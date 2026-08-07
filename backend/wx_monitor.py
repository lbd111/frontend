# -*- coding: utf-8 -*-
"""
微信支付窗口监控（替代老版 wxmonitor）v1.6
原理：按标题找到微信支付窗口 → 定时截图 → OCR 识别金额与到账时间 → POST /mpayNotify

两种运行模式：
  1. 默认（有 GUI）：弹 tkinter 窗口，可点「开始监控」「停止监控」「手动上报」
  2. --headless：无窗口，启动即自动监控，日志写文件，适合计划任务/开机自启

v1.6 改进：
  - 增加到账时间过滤：只上报最近 60 秒内的收款通知，避免微信窗口里残留的旧通知
    把新订单误匹配成已支付。
  - 去重默认间隔 5 秒；并对 --dedup 参数加保险：>=60 秒会自动钳制为 5 秒。
  - 按「金额 + 到账时间」去重，同一笔真实收款不会重复上报。
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
CHECK_INTERVAL = 2  # 秒
MAX_PAY_AGE_SECONDS = 60  # 只上报最近 60 秒内的收款通知，防止旧通知误触发新订单
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

    def log_msg(self, msg):
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {msg}"
        print(line)
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass

    def run_once(self):
        try:
            win, title = find_window()
            if not win:
                self.log_msg("未找到微信支付窗口，请把聊天窗口/通知窗口单独拖出来并保持可见")
            else:
                img = capture_window(win)
                text = ocr_image(img)
                preview = text.replace("\n", " / ")[:200]
                self.log_msg(f"OCR: {preview}")
                amount, candidates = extract_amount(text)
                pay_time = extract_pay_time(text) if amount else None
                if candidates:
                    self.log_msg(f"候选金额: {candidates}")
                if amount:
                    extra = f", 到账时间: {pay_time}" if pay_time else ""
                    self.log_msg(f"识别到金额: ¥{amount}{extra}")

                    # 必须有到账时间才能判断是不是新通知；没有则不上报，避免误触发。
                    if not pay_time:
                        self.log_msg("[SKIP] OCR 未识别到到账时间，无法确认是新收款，不上报")
                        return

                    # 过滤过期通知：微信窗口里可能残留历史收款，只上报最近 60 秒内的。
                    try:
                        pay_ts = datetime.strptime(pay_time, "%Y-%m-%d %H:%M:%S").timestamp()
                    except ValueError:
                        self.log_msg(f"[SKIP] 到账时间格式异常: {pay_time}")
                        return
                    age = time.time() - pay_ts
                    if age > MAX_PAY_AGE_SECONDS:
                        self.log_msg(f"[SKIP] 该通知已过期 {int(age)} 秒（>{MAX_PAY_AGE_SECONDS}s），不上报")
                        return

                    now = time.time()
                    # 按「金额 + 到账时间」去重：同一笔真实收款在 dedup_seconds 内只上报一次；
                    # 不同笔但金额相同（到账时间不同）可正常上报。
                    dedup_key = (amount, pay_time)
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
                else:
                    self.log_msg("未识别到金额")
        except Exception as e:
            self.log_msg(f"错误: {e}")

    def loop(self):
        """headless 用：阻塞循环，直到被 stop() 或 Ctrl+C 中断"""
        self.running = True
        self.log_msg("headless 模式启动，开始监控...")
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
        self.root.title("微信支付监控 v1.2")
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
    args = parser.parse_args()

    # 保险：去重间隔过大会导致支付延迟（旧订单挡住新订单），上限钳制为 5 秒
    if args.dedup >= 60:
        print(f"[WARN] --dedup {args.dedup} 过大，自动钳制为 5 秒，避免支付延迟")
        args.dedup = 5

    if args.headless:
        core = MonitorCore(dedup_seconds=args.dedup)
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
