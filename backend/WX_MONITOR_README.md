# mpay PC 端微信收款监控（wx_monitor.py）v1.7

用于在 Windows 10 虚拟机里监听「微信支付」窗口，自动识别收款金额并上报 mpay，完成免签收款。

v1.7 改进：监控脚本不再盲目截图/上报，而是先向 BJ 后端拉取「当前待支付金额列表」，只有识别到的金额确实在 pending 列表中才上报。这从根本上解决了「微信窗口里残留的历史同金额通知误触发新订单」的问题，同时避免无订单时频繁截图 OCR 刷屏。

v1.6 保留：到账时间过滤、60 秒去重保险、下半窗口截图、排除累计金额干扰。

## 运行环境

- Windows 10 虚拟机（本例：192.168.186.129）
- Python 3.10+（已加 PATH）
- 已登录收款微信（当前：`qingmu1680`，后台 aid=3）
- 将「微信支付」聊天窗口单独拖出，保持可见

## 安装依赖

在 Win10 VM 上打开 PowerShell，进入脚本所在目录：

```powershell
cd C:\mpay
python -m pip install rapidocr_onnxruntime uiautomation mss requests Pillow -i https://pypi.tuna.tsinghua.edu.cn/simple --timeout 120
```

若 `rapidocr_onnxruntime` 安装失败，可换成 `easyocr`：

```powershell
python -m pip install easyocr uiautomation mss requests Pillow -i https://pypi.tuna.tsinghua.edu.cn/simple --timeout 120
```

## 配置说明

脚本顶部常量已按当前环境配好，通常无需改动：

```python
SECRET = "04c920938adcf922d30b4386415e4aeb"  # mpay 用户 secret_key
PID    = "1000"
AID    = "3"   # 后台收款账号 ID（qingmu1680）
CHAN   = "2"   # 微信支付类型固定编号，不是 aid
NOTIFY_URL = "http://mpay.skypw.dpdns.org/mpayNotify"
BJ_API_URL = "https://api.skypw.dpdns.org"      # BJ 后端地址
BJ_MONITOR_TOKEN = ""                            # 从 BJ 后端 .env 的 MONITOR_TOKEN 获取
```

**注意**：`CHAN` 是支付类型（微信=2，支付宝=1），不是 aid。aid=3 的微信支付账号仍配 `CHAN="2"`。

v1.7 新增 `BJ_MONITOR_TOKEN`：在 BJ 后端 `.env` 里设置 `MONITOR_TOKEN`，脚本启动后会用它拉取当前待支付金额。若留空，则保持 v1.6 的兼容行为（不过滤 pending，靠到账时间过滤）。

## 启动监控

### 有 GUI 模式（默认，用于调试）

```powershell
cd C:\mpay
python wx_monitor.py
```

GUI 操作：
- 点「开始监控」：每 2 秒截屏 OCR，识别到金额后自动上报。
- 点「手动上报 ¥0.01」：不依赖 OCR，直接发测试金额，用于验证链路。
- 点「停止监控」：停止轮询。

### 无 GUI 模式（--headless，用于开机自启/计划任务）

```powershell
cd C:\mpay
python wx_monitor.py --headless
```

- 启动即自动监控，不弹窗口。
- 日志写入同目录 `wx_monitor.log`，同时输出控制台。
- 用 `Ctrl+C` 退出；日志文件可在无 GUI 时排查问题。
- OCR 自动上报正常，但没有手动上报按钮（日常收款不需要）。
- 无 pending 订单时脚本静默休眠，日志不会刷屏。

测试频繁遇到同一金额被跳过，可缩短去重间隔：

```powershell
python wx_monitor.py --headless --dedup 10
```

> 两种模式共用同一套逻辑：默认弹窗用于调试/手动兜底，`--headless` 用于无人值守。

## 待支付金额过滤（v1.7 新增）

v1.7 每次截图前先调用 BJ 后端 `GET /api/pending-amounts?token=MONITOR_TOKEN`，获取当前真正待支付的金额列表。只有识别到的金额在 pending 列表中，才会上报给 mpay。

这从根本上解决了「微信窗口里残留的历史同金额通知误触发新订单」的问题，也不需要每次手动清空聊天记录。

若 `BJ_MONITOR_TOKEN` 未配置，脚本会降级为 v1.6 行为：靠「到账时间过滤」只上报最近 60 秒内的通知。

## 到账时间过滤（v1.6 保留）

微信收款通知里通常包含「到账时间 2026-08-07 13:40:09」。脚本额外要求：
- 必须识别到到账时间；
- 到账时间必须晚于该 pending 订单的创建时间；
- 满足上述条件才上报。

这进一步降低旧通知误触发的概率。

## 去重机制

按「金额 + 到账时间」去重，默认 5 秒内同一笔收款只上报一次，避免同一笔反复通知。不同笔但金额相同的收款（到账时间不同）可以立即上报。

**重要**：启动参数 `--dedup` 若 >=60 秒，脚本会自动钳制为 5 秒并打印警告，以防配置错误导致支付延迟。日常使用直接用 `python wx_monitor.py --headless`（不带 `--dedup`）即可，不要配置 `--dedup 300`。

**关于 60 秒内多笔同金额订单**：v1.7 通过 pending-amounts 过滤，脚本只会为当前待支付金额截图/上报；即使多人在短时间内下相同金额订单，每一笔的真实付款通知都会按「金额 + 到账时间」独立去重。由于 mpay 侧按金额匹配，若同一时间存在两笔相同金额的未支付订单，mpay 会匹配到其中一笔；这种场景下建议用户选择不同金额或间隔 5 秒以上下单。

## 上报契约

- URL：`POST http://mpay.skypw.dpdns.org/mpayNotify`
- 字段：`action=mpaypc`、`time`、`sign`、`data`
- `sign`：urlencode(base64(hmac-sha256(time+"\n"+secret, secret)))。注意 `urlencode` 必须对 `+`、`/`、`=` 全部编码（包括 `/` -> `%2F`），与 PHP `urlencode()` 行为一致。
- `data`（JSON）：`{"aid":"3","pid":"1000","chan":"2","money":"0.01"}`
- 提交方式：`multipart/form-data`。因为 mpay 后端在 `x-www-form-urlencoded` 下会对 `sign` 再做一次 `urldecode`，会破坏含 `/` 的 sign，导致间歇性签名错误。
- mpay 后端匹配规则：`wxpay{chan}#{account}`，即 `wxpay2#qingmu1680`

## 常见问题

1. **未找到微信支付窗口**
   - 把「微信支付」会话从微信主窗口单独拖出来，形成一个独立窗口。
   - 窗口标题需包含「微信支付」、「微信收款助手」或「赞赏到账通知」。

2. **OCR 识别不到金额或识别错误（如 ¥0.01 识别成 ¥0.09）**
   - 调整窗口大小，让金额文字清晰可见，不要遮挡。
   - 确保窗口里只有当前这笔收款，没有历史 0.09 等记录干扰。
   - 换 easyocr 引擎试试。
   - 查看 `wx_monitor.log` 中的「候选金额」和「OCR」原始文本，判断是 OCR 错误还是历史记录干扰。
   - 手动上报验证后端是否已通。

3. **HTTP 200 但网页不跳转 / 订单状态不变**
   - 200 只代表请求到达 mpay，不代表金额匹配成功。
   - 重点排查 `wx_monitor.log` 里识别到的金额是否等于订单金额（例如 0.01）。
   - 检查 `BJ_MONITOR_TOKEN` 是否与 BJ 后端 `.env` 的 `MONITOR_TOKEN` 一致；若 token 错误，脚本会收不到 pending 列表，退化为不过滤模式。
   - 检查 `CHAN` 是否为 `2`（微信支付类型）。
   - 检查后台账号 aid 与 `AID` 是否一致。
   - 确认二维码/订单未过期；过期后需刷新页面重新下单再测。
   - 若用宝塔 `checkPayResult` 监听，确认 aid=3 的计划任务存在。

## 宝塔监听任务（Linux 侧）

确保宝塔计划任务包含：

- 整站新订单：`curl -s "http://mpay.skypw.dpdns.org/checkOrder/1000/1aa9f71325a2ef8ccfa2e00a90530fcf"`
- 支付宝账号：`curl -s "http://mpay.skypw.dpdns.org/checkPayResult?pid=1000&aid=1"`
- 微信账号：`curl -s "http://mpay.skypw.dpdns.org/checkPayResult?pid=1000&aid=3"`

## 文件位置

- 源码：`frontend/backend/wx_monitor.py`
- 部署位置：`C:\mpay\wx_monitor.py`（Win10 VM）
