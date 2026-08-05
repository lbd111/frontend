# -*- coding: utf-8 -*-
"""
微信支付窗口监控（替代老版 wxmonitor）
原理：按标题找到微信支付窗口 → 定时截图 → OCR 识别金额 → POST /mpayNotify

两种运行模式：
  1. 默认（有 GUI）：弹 tkinter 窗口，可点「开始监控」「停止监控」「手动上报」
  2. --headless：无窗口，启动即自动监控，日志写文件，适合计划任务/开机自启
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
from PIL import Image
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
WINDOW_TITLES = ["微信支付", "微信收款助手", "微信收款商业版"]
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
        return Image.frombytes("RGB", img.size, img.bgra, "raw", "BGRX")


def ocr_image(img):
    if ocr_engine is None:
        return ""
    if ocr_type == "rapidocr":
        result, _ = ocr_engine(img)
        if result:
            return "\n".join([line[1] for line in result])
        return ""
    else:
        # easyocr
        result = ocr_engine.readtext(img, detail=0)
        return "\n".join(result)


def extract_amount(text):
    """从 OCR 文本里提取金额，优先匹配 ¥0.01，其次 0.01元"""
    patterns = [
        r"￥\s*(\d+(?:\.\d{1,2})?)",
        r"¥\s*(\d+(?:\.\d{1,2})?)",
        r"收款\s*[金金]?\s*(\d+(?:\.\d{1,2})?)",
        r"(\d+(?:\.\d{1,2})?)\s*元",
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            return m.group(1)
    return None


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

    def __init__(self, log_func=print, dedup_seconds=300):
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
                self.log_msg("未找到微信支付窗口，请把聊天窗口单独拖出来")
            else:
                img = capture_window(win)
                text = ocr_image(img)
                preview = text.replace("\n", " / ")[:120]
                self.log_msg(f"OCR: {preview}")
                amount = extract_amount(text)
                if amount:
                    self.log_msg(f"识别到金额: ¥{amount}")
                    now = time.time()
                    # 同金额去重（避免同一笔收款反复通知）
                    last = self.seen_amounts.get(amount, 0)
                    elapsed = now - last
                    if elapsed > self.dedup_seconds:
                        code, resp = send_notify(amount)
                        self.log_msg(f"上报结果: HTTP {code}, {resp}")
                        if code == 200:
                            self.seen_amounts[amount] = now
                    else:
                        remain = int(self.dedup_seconds - elapsed)
                        self.log_msg(f"该金额 {remain} 秒内已上报，跳过（去重间隔 {self.dedup_seconds}s）")
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
        self.root.title("微信支付监控 v1.1")
        self._after_id = None

        tk.Label(root, text="监控窗口: 微信支付 / 微信收款助手", font=("Microsoft YaHei", 12)).pack(pady=5)

        self.status = tk.Label(root, text="状态: 停止", fg="red", font=("Microsoft YaHei", 10))
        self.status.pack(pady=5)

        self.log = tk.Text(root, height=18, width=70, font=("Consolas", 9))
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

        self.log_msg("准备就绪。把「微信支付」聊天窗口单独拖出来并保持可见，然后点「开始监控」。")
        if ocr_engine is None:
            self.log_msg("警告：OCR 引擎未加载，自动识别不可用，只能手动上报。")

    def log_msg(self, msg):
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {msg}\n"
        self.log.insert(tk.END, line)
        self.log.see(tk.END)
        print(line.strip())

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
    import urllib.parse

    parser = argparse.ArgumentParser(description="微信支付窗口监控")
    parser.add_argument("--headless", action="store_true", help="无窗口模式，启动即自动监控")
    parser.add_argument("--dedup", type=int, default=300, help="同金额去重间隔秒数，默认 300（5 分钟）")
    args = parser.parse_args()

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
