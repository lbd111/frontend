# BJ 支付中台部署说明

> 实际部署环境：**Linux CentOS 7.9 宝塔面板**（`192.168.186.130`），与 mpay 同机。
> 早期文档写的「Win10 虚拟机」方案已废弃，Win10 VM 现在只负责运行微信收款监控 `wx_monitor.py`。

## 1. 架构总览

```
浏览器 (https://skypw.dpdns.org)
    │  POST /api/checkout  (带 Supabase access_token)
    ▼
BJ 薄后端 Node.js  ← 本文档部署对象
  192.168.186.130:3000
  公网入口 https://api.skypw.dpdns.org (cloudflared tunnel)
    │  调 mpay /mapi 创建订单
    ▼
mpay 码支付 (https://mpay.skypw.dpdns.org)
    │  用户扫码支付
    ▼
Win10 VM: wx_monitor.py --headless  → OCR 识别金额 → /mpayNotify
    │
    ▼  mpay 异步回调
BJ 薄后端 /api/mpay/notify  → 发放权益（Supabase profiles）
```

## 2. 运行环境

CentOS 7 的 glibc 是 **2.17**，官方 Node.js 18+ 二进制要求 glibc 2.28，**无法直接运行**。
必须使用 unofficial-builds 的 `glibc-217` 专版：

```bash
cd /usr/local/src
wget -c https://unofficial-builds.nodejs.org/download/release/v20.18.1/node-v20.18.1-linux-x64-glibc-217.tar.gz
tar -xzf node-v20.18.1-linux-x64-glibc-217.tar.gz -C /usr/local/
ln -sf /usr/local/node-v20.18.1-linux-x64-glibc-217/bin/node /usr/bin/node
ln -sf /usr/local/node-v20.18.1-linux-x64-glibc-217/bin/npm  /usr/bin/npm
node -v   # 应输出 v20.18.1
```

> 为什么必须 Node 18+：`server.js` 使用了全局 `fetch()` 调用 mpay `/mapi`，Node 16 没有该 API。

### Node 20 的 WebSocket 坑

`@supabase/supabase-js` 构造时会初始化 realtime 客户端，而 Node < 22 没有全局 `WebSocket`，
直接 `createClient()` 会抛 `Node.js 20 detected without native WebSocket support`。

解决办法：安装 `ws` 并显式传入 transport（本服务不用 realtime，但构造阶段绕不过）：

```js
const ws = require('ws');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws }
});
```

## 3. 部署代码

```bash
mkdir -p /www/wwwroot/api.skypw.dpdns.org
# 从开发机上传 server.js / package.json / .env / sql 到该目录
cd /www/wwwroot/api.skypw.dpdns.org
npm install --registry=https://registry.npmmirror.com
```

## 4. 配置 .env

```bash
cp .env.example .env
vi .env
```

| 变量 | 值 / 获取位置 |
|------|--------------|
| `PORT` | `3000` |
| `SUPABASE_URL` | `https://cumcskaepjofogktmjzz.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase 后台 → Project Settings → API → `service_role` secret |
| `SUPABASE_JWT_SECRET` | Supabase 后台 → Project Settings → API → JWT Secret |
| `DB_HOST` | `127.0.0.1` |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `mpay_skypw_dpdns` / `H37sih4DnNYBMX3n` / `mpay_skypw_dpdns` |
| `MPAY_API_URL` | `https://mpay.skypw.dpdns.org` |
| `MPAY_PID` / `MPAY_SECRET` | `1000` / mpay 后台 secret_key |
| `MPAY_NOTIFY_URL` | `https://api.skypw.dpdns.org/api/mpay/notify` |
| `BJ_RETURN_URL` | `https://skypw.dpdns.org/pages/pay-return.html` |

> `SUPABASE_SERVICE_KEY` 可绕过 RLS 直接改用户资料，**绝不能出现在前端代码或公开仓库**。

## 5. 建表

支付流水表与 mpay 共库（mpay 自身表均带 `mpay_` 前缀，不冲突）：

```bash
mysql -umpay_skypw_dpdns -p'H37sih4DnNYBMX3n' mpay_skypw_dpdns < sql/payment_orders.sql
```

## 6. 公网入口（cloudflared）

后端必须能被 mpay 异步回调，已在 `/root/.cloudflared/config.yml` 增加 ingress：

```yaml
ingress:
  - hostname: pay.skypw.dpdns.org
    service: http://localhost:8080
  - hostname: mpay.skypw.dpdns.org
    service: http://127.0.0.1:80
  - hostname: api.skypw.dpdns.org
    service: http://127.0.0.1:3000
  - service: http_status:404
```

改完校验并重启：

```bash
cloudflared tunnel ingress validate    # 应输出 OK
systemctl restart cloudflared
```

若 DNS 未绑定，执行一次：

```bash
cloudflared tunnel route dns bj-dujiao api.skypw.dpdns.org
```

## 7. 用 systemd 托管（开机自启）

```bash
cat > /etc/systemd/system/bj-api.service <<'EOF'
[Unit]
Description=BJ Payment Backend
After=network.target mysqld.service

[Service]
Type=simple
WorkingDirectory=/www/wwwroot/api.skypw.dpdns.org
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
StandardOutput=append:/var/log/bj-api.log
StandardError=append:/var/log/bj-api.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now bj-api
systemctl status bj-api --no-pager
```

> **注意**：CentOS 7 的 systemd 是 219，**不支持** `StandardOutput=append:/path` 语法，
> 用了会导致服务反复 `activating` 起不来。必须像上面这样用 `/bin/sh -c "exec ... >> log 2>&1"` 重定向。

查看日志：

```bash
tail -f /var/log/bj-api.log
```

## 8. 验收

```bash
# 本地健康检查
curl http://127.0.0.1:3000/api/health

# 公网健康检查
curl https://api.skypw.dpdns.org/api/health
```

均应返回 `{"code":1,"msg":"ok"}`。

完整链路测试：

1. 访问 `https://skypw.dpdns.org/pages/vip.html`，登录后点开通 VIP。
2. 跳转到 mpay 收银台二维码页。
3. 用微信扫码支付 → Win10 VM 的 `wx_monitor.py` OCR 识别并上报。
4. mpay 标记订单已支付 → 回调 `https://api.skypw.dpdns.org/api/mpay/notify`。
5. 后端发放权益 → 前端 `pay-return.html` 轮询到已支付并跳转。

## 9. 排错

| 现象 | 排查方向 |
|------|---------|
| `/api/checkout` 401 | 前端 access_token 过期，重新登录；或 `SUPABASE_JWT_SECRET` 填错 |
| `/api/checkout` 502 | 检查 `MPAY_PID` / `MPAY_SECRET`，看 `/var/log/bj-api.log` 里的 mpay 返回 |
| `api.skypw.dpdns.org` 返回 530 | cloudflared 缺 ingress 或未重启；`cloudflared tunnel ingress validate` 检查 |
| `api.skypw.dpdns.org` 返回 502 | ingress 正常但 Node 没跑，`systemctl status bj-api` |
| CORS 报错 | `server.js` 的 `ALLOWED_ORIGIN_PATTERNS` 未覆盖当前来源，看日志 `[CORS] 拒绝来源` |
| 订单已 paid 但权益未到账 | 看 `grantBenefit` 报错，通常是 `SUPABASE_SERVICE_KEY` 权限或 `profiles` RLS |
| 支付了但订单不变 | 属 mpay 侧问题，见 `WX_MONITOR_README.md` |

## 10. 关联文档

- `WX_MONITOR_README.md` — Win10 VM 微信收款监控部署
- `sql/payment_orders.sql` — 支付流水表结构
