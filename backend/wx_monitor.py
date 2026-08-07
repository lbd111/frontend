# -*- coding: utf-8 -*-
"""
微信支付窗口监控（替代老版 wxmonitor）v1.8
原理：先向 BJ 后端拉取「当前待支付金额」→ 只在有待付金额时才截图 → OCR 识别 → 只上报 pending 列表里的金额 → POST /mpayNotify

两种运行模式：
  1. 默认（有 GUI）：弹 tkinter 窗口，可点「开始监控」「停止监控」「手动上报」
  2. --headless：无窗口，启动即自动监控，日志写文件，适合计划任务/开机自启

v1.8 改进（解决到账时间识别失败导致漏报）：
  - 保留 v1.7 的 pending-amounts 前置过滤：没有待支付订单时不截图、不上报。
  - 到账时间改为「可选辅助过滤」：OCR 识别到则用于过滤旧通知；识别不到也允许上报，避免真实收款被漏掉。
  - 保留 5 秒去重，避免同一笔真实收款重复上报。

v1.7 核心改进（已保留）：
  - 监控脚本先调用 BJ /api/pending-amounts 获取当前真正待支付的金额。
  - 只有识别到的金额在 pending 列表中才上报；微信窗口里残留的历史同金额通知不会再触发新订单。
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.parse
from datetime import datetime


def _ensure_package(name, import_name=None):
    import_name = import_name or name
    try:
        return __import__(import_name)
    except ImportError:
        print(f"[INFO] 安装依赖: {name}")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", name])
        return __import__(import_name)


requests = _ensure_package("requests")
auto = _ensure_package("uiautomation")
_ensure_package("Pillow", "PIL")
from PIL import Image, ImageEnhance, ImageFilter
mss = _ensure_package("mss")

# 尝试加载 OCR 引擎
ocr_engine = None
ocr_type = None
try:
    from rapidocr_onnxruntime import RapidOCR

    ocr_engine = RapidOCR()
    ocr_type = "rapidocr"
    print("[INFO] OCR 引擎: rapidocr_onnxruntime")
except Exception as e:
    print(f"[WARN] rapidocr 加载失败: {e}")
    try:
        import easyocr

        ocr_engine = easyocr.Reader(["ch_sim", "en"])
        ocr_type = "easyocr"
        print("[INFO] OCR 引擎: easyocr")
    except Exception as e2:
        print(f"[WARN] easyocr 加载失败: {e2}")
        print("[ERROR] 无可用 OCR 引擎，只能用「手动上报」功能。")


# ===== 配置区 =====
SECRET = "04c920938adcf922d30b4386415e4aeb"
PID = "1000"
AID = "3"
CHAN = "2"  # 微信支付固定类型编号，不是 aid
NOTIFY_URL = "http://mpay.skypw.dpdns.org/mpayNotify"
# BJ 后端地址，用于拉取当前待支付金额列表
BJ_API_URL = os.environ.get("BJ_API_URL", "https://api.skypw.dpdns.org")
BJ_MONITOR_TOKEN = os.environ.get("BJ_MONITOR_TOKEN", "")
CHECK_INTERVAL = 2  # 秒
PENDING_FETCH_INTERVAL = 3  # 秒：拉取 pending-amounts 的间隔
WINDOW_TITLES = ["微信支付", "微信收款助手", "微信收款商业版", "赞赏到账通知"]
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wx_monitor.log")


def find_window():
    for t in WINDOW_TITLES:
        w = auto.WindowControl(searchDepth=1, Name=t)
        if w.Exists(0.5):
            return w, t
    return None, None


def capture_window(win):
    rect = win.BoundingRectangle
    left, top, right, bottom = rect.left, rect.top, rect.right, rect.bottom
    width = max(1, right - left)
    height = max(1, bottom - top)
    with mss.mss() as sct:
        monitor = {"left": left, "top": top, "width": width, "height": height}
        img = sct.grab(monitor)
        full = Image.frombytes("RGB", img.size, img.bgra, "raw", "BGRX")
    # 微信支付通知窗口往往同时显示历史记录（在上）和最新通知（在下），
    # 只截取下半部分进行 OCR，可显著降低旧金额干扰。
    crop_top = int(height * 0.45)
    return full.crop((0, crop_top, width, height))


def preprocess_image(img):
    """放大 + 灰度 + 自适应对比度 + 二值化，提高 OCR 对小字体的识别率"""
    # 放大 2.5 倍
    img = img.resize((int(img.width * 2.5), int(img.height * 2.5)), Image.LANCZOS)
    # 灰度
    img = img.convert("L")
    # 适度锐化
    img = img.filter(ImageFilter.SHARPEN)
    # 二值化（根据经验阈值 180）
    img = img.point(lambda x: 0 if x < 180 else 255, "1")
    return img.convert("RGB")


def ocr_image(img):
    if ocr_engine is None:
        return ""
    proc = preprocess_image(img)
    if ocr_type == "rapidocr":
        result, _ = ocr_engine(proc)
        if result:
            return "\n".join([line[1] for line in result])
        return ""
    else:
        # easyocr
        result = ocr_engine.readtext(proc, detail=0)
        return "\n".join(result)


def fetch_pending_amounts():
    """从 BJ 后端拉取当前待支付金额列表。返回 {amount_str: created_at_ms} 字典。"""
    if not BJ_MONITOR_TOKEN:
        return None  # 未配置 token，禁用 pending 过滤（兼容旧部署）
    try:
        url = f"{BJ_API_URL}/api/pending-amounts?token={BJ_MONITOR_TOKEN}"
        resp = requests.get(url, timeout=10)
        if resp.status_code != 200:
            print(f"[WARN] pending-amounts 请求失败: HTTP {resp.status_code} {resp.text[:80]}")
            return None
        data = resp.json()
        if data.get("code") != 1:
            print(f"[WARN] pending-amounts 返回错误: {data}")
            return None
        amounts = data.get("amounts", [])
        return {a["amount"]: a["created_at"] for a in amounts}
    except Exception as e:
        print(f"[WARN] 拉取 pending-amounts 异常: {e}")
        return None


def extract_pay_time(text):
    """从 OCR 文本中提取到账时间，作为同一笔收款的唯一标识。

    微信到账通知常见格式：「到账时间 2026-08-07 12:47:49」，
    OCR 也可能把「账」识别成「长」，写成「到长时间」。
    """
    patterns = [
        r"到[账长]时间\s*[：:/]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})",
        r"(?:到账|到长)时间\s*[：:]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})",
        r"(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*(?:到账|到长|入账)",
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            return m.group(1)
    return None


def extract_amount(text):
    """从 OCR 文本里提取金额，返回 (最佳金额, 候选列表)

    微信支付窗口里最新通知一般在最下方，历史记录在上方；
    因此同类型金额选择位置最靠下的（pos 最大）。
    同时排除「累计金额」等统计信息干扰。
    """
    # 先抹掉「累计金额/今日收到...累计金额」这类统计行
    cleaned = re.sub(r"(累计|今日收到).*?\d+(?:\.\d{1,2})?", "", text)

    candidates = []
    # 1. 匹配 ¥/￥ 后的金额
    for m in re.finditer(r"[￥¥]\s*(\d+(?:\.\d{1,2})?)", cleaned):
        candidates.append({"value": m.group(1), "pos": m.start(), "source": "currency_symbol"})
    # 2. 匹配 "收款金额"、"赞赏金额" 等关键字后面的金额
    for kw in ["收款金额", "赞赏金额", "到账金额", "收款"]:
        for m in re.finditer(re.escape(kw) + r"\s*[：:]?\s*[￥¥]?\s*(\d+(?:\.\d{1,2})?)", cleaned):
            candidates.append({"value": m.group(1), "pos": m.start(), "source": "keyword"})
    # 3. 通用金额匹配
    for m in re.finditer(r"(\d+(?:\.\d{1,2})?)\s*元", cleaned):
        candidates.append({"value": m.group(1), "pos": m.start(), "source": "yuan"})

    if not candidates:
        return None, []

    # 按来源优先级排序，同来源取最下方（pos 最大，最新通知）
    source_order = {"currency_symbol": 0, "keyword": 1, "yuan": 2}
    candidates.sort(key=lambda x: (source_order[x["source"]], x["pos"]))
    best_by_source = {}
    for c in candidates:
        best_by_source[c["source"]] = c  # 同来源覆盖为 pos 更大的
    # 按来源优先级返回最佳
    for source in sorted(best_by_source.keys(), key=lambda s: source_order[s]):
        return best_by_source[source]["value"], candidates


def send_notify(amount):
    t = str(int(time.time()))
    before = t + "\n" + SECRET
    # PHP urlencode 会对 + / = 全部编码（包括 / -> %2F），必须与 PHP 完全一致；
    # 且后端 request->post() 会对 x-www-form-urlencoded 自动 urldecode，
    # 所以改用 multipart/form-data 提交，保持 sign 原样到达后端。
    sign = urllib.parse.quote(
        base64.b64encode(
            hmac.new(SECRET.encode(), before.encode(), hashlib.sha256).digest()
        ).decode(),
        safe="",
    )
    data = json.dumps(
        {"aid": AID, "pid": PID, "chan": CHAN, "money": str(amount)}, ensure_ascii=False
    )
    resp = requests.post(
        NOTIFY_URL,
        data={"action": "mpaypc", "time": t, "data": data},
        files={"sign": (None, sign)},
        timeout=10,
    )
    return resp.status_code, resp.text


class MonitorCore:
    """无 GUI 的监控核心，GUI 与 headless 共用"""

    def __init__(self, log_func=print, dedup_seconds=5):
        self.log = log_func
        self.dedup_seconds = dedup_seconds
        self.running = False
        self.seen_amounts = {}
        self._stop = threading.Event()
        self.pending_amounts = {}  # amount_str -> created_at_ms
        self._last_pending_fetch = 0
        self._pending_fetch_failures = 0

    def log_msg(self, msg):
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {msg}"
        print(line)
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass

    def refresh_pending(self, force=False):
        """刷新待支付金额列表。失败时保留旧值，连续失败过多则降级为不过滤。"""
        now = time.time()
        if not force and now - self._last_pending_fetch < PENDING_FETCH_INTERVAL:
            return
        self._last_pending_fetch = now
        new_pending = fetch_pending_amounts()
        if new_pending is None:
            self._pending_fetch_failures += 1
            if self._pending_fetch_failures >= 3:
                # 连续失败 3 次，降级为不过滤（避免 BJ 后端不可用导致无法收款）
                if self.pending_amounts:
                    self.log_msg("[WARN] pending-amounts 连续失败 3 次，降级为不过滤模式")
                    self.pending_amounts = {}
        else:
            self._pending_fetch_failures = 0
            if new_pending != self.pending_amounts:
                self.pending_amounts = new_pending
                if new_pending:
                    self.log_msg(f"[PENDING] 当前待支付金额: {list(new_pending.keys())}")

    def run_once(self):
        try:
            # 1. 先刷新 pending 列表；无 pending 时直接静默休眠（不截图、不 OCR）
            self.refresh_pending()
            if BJ_MONITOR_TOKEN and not self.pending_amounts:
                # 没有待支付订单，进入静默。headless 模式下不打印，避免刷屏。
                return

            win, title = find_window()
            if not win:
                self.log_msg("未找到微信支付窗口，请把聊天窗口/通知窗口单独拖出来并保持可见")
                return

            img = capture_window(win)
            text = ocr_image(img)
            preview = text.replace("\n", " / ")[:200]
            self.log_msg(f"OCR: {preview}")
            amount, candidates = extract_amount(text)
            pay_time = extract_pay_time(text) if amount else None
            if candidates:
                self.log_msg(f"候选金额: {candidates}")

            if not amount:
                self.log_msg("未识别到金额")
                return

            extra = f", 到账时间: {pay_time}" if pay_time else ""
            self.log_msg(f"识别到金额: ¥{amount}{extra}")

            # 2. 金额必须属于 pending 列表才上报；旧通知/无关金额直接忽略
            if BJ_MONITOR_TOKEN and amount not in self.pending_amounts:
                self.log_msg(f"[SKIP] ¥{amount} 不在当前待支付金额列表 {list(self.pending_amounts.keys())} 中，不上报")
                return

            # 3. 到账时间作为辅助过滤：识别到则校验，识别不到也允许上报
            #    pending-amounts 过滤已是第一道防线，不会因识别不到时间就漏掉真实收款。
            pay_ts = None
            if pay_time:
                try:
                    pay_ts = datetime.strptime(pay_time, "%Y-%m-%d %H:%M:%S").timestamp()
                except ValueError:
                    self.log_msg(f"[WARN] 到账时间格式异常: {pay_time}，仍尝试上报")
            else:
                self.log_msg("[WARN] OCR 未识别到到账时间，但金额在 pending 列表中，仍尝试上报")

            # 4. 到账时间必须晚于该 pending 订单的创建时间，进一步过滤旧通知
            if pay_ts is not None:
                order_created_at = self.pending_amounts.get(amount, 0)
                if order_created_at and pay_ts * 1000 < order_created_at:
                    self.log_msg(f"[SKIP] 到账时间早于订单创建时间，不上报")
                    return

            now = time.time()
            # 5. 按「金额 + 到账时间」去重；若未识别到时间，则用当前时间分桶去重
            dedup_time = pay_time or f"bucket_{int(now / max(1, self.dedup_seconds))}"
            dedup_key = (amount, dedup_time)
            last = self.seen_amounts.get(dedup_key, 0)
            elapsed = now - last
            if elapsed > self.dedup_seconds:
                code, resp = send_notify(amount)
                self.log_msg(f"上报结果: HTTP {code}, {resp}")
                if code == 200:
                    self.seen_amounts[dedup_key] = now
            else:
                remain = int(self.dedup_seconds - elapsed)
                self.log_msg(f"该收款 {remain} 秒内已上报，跳过（去重间隔 {self.dedup_seconds}s）")
        except Exception as e:
            self.log_msg(f"错误: {e}")

    def loop(self):
        """headless 用：阻塞循环，直到被 stop() 或 Ctrl+C 中断"""
        self.running = True
        try:
            while self.running and not self._stop.is_set():
                self.run_once()
                self._stop.wait(CHECK_INTERVAL)
        finally:
            self.running = False
            self.log_msg("监控已停止")

    def start(self):
        self.running = True

    def stop(self):
        self.running = False
        self._stop.set()

    def manual(self, amount):
        def _send():
            try:
                code, resp = send_notify(amount)
                self.log_msg(f"手动上报 ¥{amount}: HTTP {code}, {resp}")
            except Exception as e:
                self.log_msg(f"手动上报失败: {e}")
        threading.Thread(target=_send, daemon=True).start()


class MonitorApp:
    def __init__(self, root, core):
        self.root = root
        self.core = core
        self.root.title("微信支付监控 v1.8")
        self._after_id = None

        tk.Label(root, text="监控窗口: 微信支付 / 微信收款助手 / 赞赏到账通知", font=("Microsoft YaHei", 12)).pack(pady=5)

        self.status = tk.Label(root, text="状态: 停止", fg="red", font=("Microsoft YaHei", 10))
        self.status.pack(pady=5)

        self.log = tk.Text(root, height=18, width=80, font=("Consolas", 9))
        self.log.pack(pady=5, padx=10)

        btn_frame = tk.Frame(root)
        btn_frame.pack(pady=8)
        self.start_btn = tk.Button(btn_frame, text="开始监控", command=self.start, width=12)
        self.start_btn.pack(side=tk.LEFT, padx=5)
        self.stop_btn = tk.Button(btn_frame, text="停止监控", command=self.stop, width=12, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT, padx=5)
        tk.Button(btn_frame, text="手动上报 ¥0.01", command=lambda: self.core.manual("0.01"), width=14).pack(side=tk.LEFT, padx=5)

        # 重定向 core.log 到 GUI 文本框
        self.core.log = self.log_msg

        self.log_msg("准备就绪。把「微信支付」聊天窗口/通知窗口单独拖出来并保持可见，然后点「开始监控」。")
        if ocr_engine is None:
            self.log_msg("警告：OCR 引擎未加载，自动识别不可用，只能手动上报。")

    def log_msg(self, msg):
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {msg}\n"
        self.log.insert(tk.END, line)
        self.log.see(tk.END)
        print(line.strip())
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(line)
        except Exception:
            pass

    def start(self):
        self.core.start()
        self.status.config(text="状态: 运行中", fg="green")
        self.start_btn.config(state=tk.DISABLED)
        self.stop_btn.config(state=tk.NORMAL)
        self.log_msg("开始监控...")
        self.monitor_loop()

    def stop(self):
        self.core.stop()
        if self._after_id:
            self.root.after_cancel(self._after_id)
            self._after_id = None
        self.status.config(text="状态: 停止", fg="red")
        self.start_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)
        self.log_msg("已停止")

    def monitor_loop(self):
        if not self.core.running:
            return
        self.core.run_once()
        self._after_id = self.root.after(CHECK_INTERVAL * 1000, self.monitor_loop)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="微信支付窗口监控")
    parser.add_argument("--headless", action="store_true", help="无窗口模式，启动即自动监控")
    parser.add_argument("--dedup", type=int, default=5, help="同一笔收款去重间隔秒数，默认 5（按金额+到账时间去重）。注意：>=60 会被自动钳制为 5，以免支付延迟。")
    parser.add_argument("--bj-api-url", default=BJ_API_URL, help="BJ 后端地址，默认 https://api.skypw.dpdns.org")
    parser.add_argument("--bj-token", default=BJ_MONITOR_TOKEN, help="BJ /api/pending-amounts 鉴权 Token")
    args = parser.parse_args()

    # 允许命令行覆盖全局配置
    if args.bj_api_url:
        BJ_API_URL = args.bj_api_url
    if args.bj_token:
        BJ_MONITOR_TOKEN = args.bj_token

    # 保险：去重间隔过大会导致支付延迟（旧订单挡住新订单），上限钳制为 5 秒
    if args.dedup >= 60:
        print(f"[WARN] --dedup {args.dedup} 过大，自动钳制为 5 秒，避免支付延迟")
        args.dedup = 5

    if args.headless:
        core = MonitorCore(dedup_seconds=args.dedup)
        core.log_msg(f"headless 模式启动 (v1.8)，BJ 后端: {BJ_API_URL}")
        if not BJ_MONITOR_TOKEN:
            core.log_msg("[WARN] 未配置 BJ_MONITOR_TOKEN，pending 过滤已禁用（兼容模式）")
        try:
            core.loop()
        except KeyboardInterrupt:
            core.stop()
    else:
        import tkinter as tk

        core = MonitorCore(dedup_seconds=args.dedup)
        root = tk.Tk()
        app = MonitorApp(root, core)
        root.mainloop()
