/**
 * BJ 陪玩团支付中台
 * 作用：前端 VIP/充值 → 创建 mpay 码支付订单 → 接收异步回调 → 发放权益
 *
 * 运行方式：
 *   1. 复制 .env.example 为 .env，填入真实密钥
 *   2. 在 MySQL 执行 sql/payment_orders.sql 建表
 *   3. npm install
 *   4. npm start
 */

require('dotenv').config();
// Node 20 的 undici(fetch) 默认优先解析 IPv6，而本服务器 IPv6 出网不通，
// 会导致 fetch('https://mpay.skypw.dpdns.org') 直接 failed。强制 IPv4 优先。
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const { createClient } = require('@supabase/supabase-js');
// Node < 22 没有全局 WebSocket，supabase-js 的 realtime 模块会在构造时抛错。
// 本服务不使用 realtime，但仍需提供一个实现让 createClient 能够初始化。
const ws = require('ws');

const app = express();

// ================== 配置 ==================
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const SUPABASE_JWT_PUBLIC_KEY = process.env.SUPABASE_JWT_PUBLIC_KEY;
const MPAY_API_URL = process.env.MPAY_API_URL || 'https://mpay.skypw.dpdns.org';
// BJ 后端经内网直连 mpay 创建订单（跳过 Cloudflare，避免公网链路偶发失败），
// 但返回给前端的 payurl 必须是公网域名，否则用户无法访问收款页。
const MPAY_PUBLIC_URL = process.env.MPAY_PUBLIC_URL || 'https://mpay.skypw.dpdns.org';
const MPAY_PID = process.env.MPAY_PID;
const MPAY_SECRET = process.env.MPAY_SECRET;
const MPAY_NOTIFY_URL = process.env.MPAY_NOTIFY_URL;
const BJ_RETURN_URL = process.env.BJ_RETURN_URL;
// 微信监控脚本访问 /api/pending-amounts 的简单 Token；未配置则自动生成一个并打印到日志
const MONITOR_TOKEN = process.env.MONITOR_TOKEN || (() => {
  const token = crypto.randomBytes(16).toString('hex');
  console.log('[WARN] 未配置 MONITOR_TOKEN，已自动生成:', token);
  return token;
})();

if (!SUPABASE_SERVICE_KEY || (!SUPABASE_JWT_SECRET && !SUPABASE_JWT_PUBLIC_KEY) || !MPAY_SECRET) {
  console.error('错误：缺少必要环境变量，请检查 .env 文件（SUPABASE_SERVICE_KEY 与 SUPABASE_JWT_SECRET/PUBLIC_KEY 至少二选一）');
  process.exit(1);
}

// ================== 中间件 ==================
// 允许的来源：生产域名 + 本地开发（任意端口）+ 内网调试
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/skypw\.dpdns\.org$/,
  /^https:\/\/[a-z0-9-]+\.skypw\.dpdns\.org$/,
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/
];

app.use(cors({
  origin(origin, callback) {
    // 无 Origin 头（同源请求、curl、服务端回调）或 file://（Origin: null）直接放行
    if (!origin || origin === 'null') return callback(null, true);
    if (ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) {
      return callback(null, true);
    }
    console.warn('[CORS] 拒绝来源:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================== 客户端初始化 ==================
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  realtime: {
    transport: ws
  }
});

const dbPool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'mpay',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'mpay',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true
});

// ================== 工具函数 ==================

/**
 * mpay 签名算法（与 app/controller/PayController.php 的 getSign 保持一致）
 * 1. 参数按 key 字母排序
 * 2. 拼接 k=v&k=v，排除 sign、sign_type 和空值
 * 3. 去掉末尾 &，末尾追加 secret
 * 4. md5
 */
function getMpaySign(params, secret) {
  const keys = Object.keys(params).sort();
  let str = '';
  for (const k of keys) {
    const v = params[k];
    if (k === 'sign' || k === 'sign_type' || v === '' || v === null || v === undefined) continue;
    str += `${k}=${v}&`;
  }
  str = str.replace(/&$/, '');
  str += secret;
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

/**
 * Supabase JWT 验签中间件
 * 前端调用时需在 Header 带：Authorization: Bearer <access_token>
 */
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ code: 0, error: '未提供登录凭证' });
  }
  try {
    let payload;
    if (SUPABASE_JWT_PUBLIC_KEY) {
      // Supabase 新 JWT Signing Keys：使用 ES256 非对称验签，PUBLIC_KEY 为 JWK JSON
      const jwk = JSON.parse(SUPABASE_JWT_PUBLIC_KEY);
      const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
      payload = jwt.verify(token, publicKey, { algorithms: ['ES256'] });
    } else {
      // 旧版 Supabase：HS256/HS384/HS512 对称验签，JWT Secret 是 base64 编码字符串，需先 decode
      payload = jwt.verify(token, Buffer.from(SUPABASE_JWT_SECRET, 'base64'), { algorithms: ['HS256', 'HS384', 'HS512'] });
    }
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    console.error('JWT 验签失败:', err.message);
    return res.status(401).json({ code: 0, error: '登录凭证无效或已过期' });
  }
}

function generateOrderNo() {
  return crypto.randomUUID();
}

// ================== 微信监控：待支付金额缓存 ==================
// key: bj_order_no, value: { amount, createdAt, itemType, userId }
const pendingOrders = new Map();
const PENDING_TTL_MS = 30 * 60 * 1000; // 30 分钟，与 mpay 订单有效期对齐

function addPendingOrder(bjOrderNo, amount, itemType, userId) {
  pendingOrders.set(bjOrderNo, { amount, createdAt: Date.now(), itemType, userId });
  // 30 分钟后自动清理
  setTimeout(() => {
    if (pendingOrders.get(bjOrderNo)?.createdAt <= Date.now() - PENDING_TTL_MS) {
      pendingOrders.delete(bjOrderNo);
    }
  }, PENDING_TTL_MS);
}

function removePendingOrder(bjOrderNo) {
  pendingOrders.delete(bjOrderNo);
}

// ================== 权益发放 ==================

/**
 * 根据订单类型发放权益
 * @param {object} order - payment_orders 行
 */
async function grantBenefit(order) {
  const { user_id, item_type, amount } = order;

  if (item_type === 'vip_month') {
    // 开通/续期 VIP：level='VIP会员'，vip_expire_at = now + 30 天
    const now = new Date();
    const expireAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // 先查现有到期时间，做续期而不是覆盖
    const { data: profile } = await supabase
      .from('profiles')
      .select('vip_expire_at')
      .eq('id', user_id)
      .single();

    let baseTime = now;
    if (profile?.vip_expire_at && new Date(profile.vip_expire_at) > now) {
      baseTime = new Date(profile.vip_expire_at);
    }
    const finalExpire = new Date(baseTime.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('profiles')
      .update({
        level: 'VIP会员',
        vip_expire_at: finalExpire,
        vip_coupon_last_granted_at: now.toISOString()
      })
      .eq('id', user_id);

    if (error) throw new Error('更新 VIP 资料失败: ' + error.message);

    // 发放首周 95 折无门槛优惠券
    const couponExpire = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await supabase.from('coupons').insert({
      user_id,
      type: 'percent',
      amount: 0.05,
      condition: '无门槛',
      expire_date: couponExpire,
      used: false
    });

    return { level: 'VIP会员', vip_expire_at: finalExpire };
  }

  if (item_type === 'recharge') {
    // 余额充值：balance += amount
    const { data: profile } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user_id)
      .single();

    const current = parseFloat(profile?.balance) || 0;
    const newBalance = (current + parseFloat(amount)).toFixed(2);

    const { error } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', user_id);

    if (error) throw new Error('更新余额失败: ' + error.message);
    return { balance: newBalance };
  }

  throw new Error('未知商品类型: ' + item_type);
}

// ================== 路由 ==================

/**
 * 健康检查
 */
app.get('/api/health', (req, res) => {
  res.json({ code: 1, msg: 'ok', time: new Date().toISOString() });
});

/**
 * 创建支付订单
 * POST /api/checkout
 * Body: { item: 'vip_month' | 'recharge', amount: number, channel?: 'wxpay' | 'alipay' }
 */
app.post('/api/checkout', authMiddleware, async (req, res) => {
  try {
    const { item, amount, channel = 'wxpay' } = req.body;
    const userId = req.user.id;

    // 参数校验
    if (!['vip_month', 'recharge'].includes(item)) {
      return res.status(400).json({ code: 0, error: '商品类型错误' });
    }
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0 || numAmount > 99999) {
      return res.status(400).json({ code: 0, error: '金额不合法' });
    }
    if (!['wxpay', 'alipay'].includes(channel)) {
      return res.status(400).json({ code: 0, error: '支付通道错误' });
    }

    // 生成 BJ 侧订单号
    const bjOrderNo = generateOrderNo();

    // 写本地 MySQL 流水
    await dbPool.execute(
      `INSERT INTO payment_orders (bj_order_no, user_id, item_type, amount, channel, status, payload)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [bjOrderNo, userId, item, numAmount.toFixed(2), channel, JSON.stringify({ created_from: 'checkout', channel })]
    );

    // 写入微信监控待支付金额缓存，避免旧收款通知误触发新订单
    addPendingOrder(bjOrderNo, numAmount, item, userId);

    // 商品名
    const itemName = item === 'vip_month' ? 'BJ陪玩团月度VIP会员' : 'BJ陪玩团账户充值';

    // 调 mpay /mapi 创建订单
    const mpayParams = {
      pid: MPAY_PID,
      type: channel,
      out_trade_no: bjOrderNo,
      notify_url: MPAY_NOTIFY_URL,
      return_url: `${BJ_RETURN_URL}?bj_order_no=${bjOrderNo}`,
      name: itemName,
      money: numAmount.toFixed(2),
      param: userId
    };
    mpayParams.sign = getMpaySign(mpayParams, MPAY_SECRET);

    // 调 mpay /mapi 创建订单（带 10s 超时，避免请求挂起）
    const mpayCtrl = new AbortController();
    const mpayTimer = setTimeout(() => mpayCtrl.abort(), 10000);
    let mpayResp;
    try {
      mpayResp = await fetch(`${MPAY_API_URL}/mapi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(mpayParams),
        signal: mpayCtrl.signal
      });
    } catch (fetchErr) {
      clearTimeout(mpayTimer);
      throw new Error('调用 mpay 下单接口失败（网络超时或服务不可达）: ' + fetchErr.message);
    }
    clearTimeout(mpayTimer);
    const mpayData = await mpayResp.json();

    // 更新 mpay 返回信息
    await dbPool.execute(
      `UPDATE payment_orders SET mpay_trade_no = ?, payload = JSON_MERGE_PATCH(COALESCE(payload, '{}'), ?) WHERE bj_order_no = ?`,
      [mpayData.trade_no || null, JSON.stringify({ mpay_create: mpayData }), bjOrderNo]
    );

    // mpay 经内网创建订单，payurl 可能带内网 IP，统一替换为公网域名，确保用户可访问
    if (mpayData.payurl) {
      mpayData.payurl = mpayData.payurl.replace(/^https?:\/\/[^/]+/, MPAY_PUBLIC_URL);
    }

    if (mpayData.code !== 1 || !mpayData.payurl) {
      await dbPool.execute(`UPDATE payment_orders SET status = 'failed', payload = JSON_MERGE_PATCH(COALESCE(payload, '{}'), ?) WHERE bj_order_no = ?`,
        [JSON.stringify({ mpay_error: mpayData }), bjOrderNo]);
      return res.status(502).json({ code: 0, error: 'mpay 下单失败', detail: mpayData });
    }

    res.json({
      code: 1,
      bj_order_no: bjOrderNo,
      payurl: mpayData.payurl,
      trade_no: mpayData.trade_no,
      amount: numAmount.toFixed(2),
      item
    });
  } catch (err) {
    console.error('/api/checkout 异常:', err);
    res.status(500).json({ code: 0, error: '服务器内部错误', detail: err.message });
  }
});

/**
 * mpay 异步通知回调
 * GET /api/mpay/notify
 */
app.get('/api/mpay/notify', async (req, res) => {
  try {
    const params = req.query;
    console.log('mpay notify:', params);

    if (!params.sign) {
      return res.status(400).type('text/plain').send('fail');
    }

    // 验签
    const sign = getMpaySign(params, MPAY_SECRET);
    if (sign !== params.sign) {
      console.error('mpay 回调签名不匹配', { received: params.sign, computed: sign });
      return res.status(400).type('text/plain').send('fail');
    }

    // 校验支付状态
    if (params.trade_status !== 'TRADE_SUCCESS') {
      return res.type('text/plain').send('success');
    }

    const bjOrderNo = params.out_trade_no;
    const mpayTradeNo = params.trade_no;

    // 查 BJ 订单
    const [rows] = await dbPool.execute(
      `SELECT * FROM payment_orders WHERE bj_order_no = ? LIMIT 1`,
      [bjOrderNo]
    );
    if (!rows.length) {
      console.error('mpay 回调找不到订单:', bjOrderNo);
      return res.status(404).type('text/plain').send('fail');
    }

    const order = rows[0];

    // 幂等：已处理过直接返回 success
    if (order.status === 'paid') {
      return res.type('text/plain').send('success');
    }

    // 更新订单为已支付
    await dbPool.execute(
      `UPDATE payment_orders SET status = 'paid', mpay_trade_no = ?, paid_at = NOW(),
       payload = JSON_MERGE_PATCH(COALESCE(payload, '{}'), ?) WHERE bj_order_no = ?`,
      [mpayTradeNo, JSON.stringify({ mpay_notify: params }), bjOrderNo]
    );

    // 从微信监控待支付缓存移除
    removePendingOrder(bjOrderNo);

    // 发放权益
    await grantBenefit(order);

    console.log('订单支付成功，权益已发放:', bjOrderNo);
    return res.type('text/plain').send('success');
  } catch (err) {
    console.error('/api/mpay/notify 异常:', err);
    return res.status(500).type('text/plain').send('fail');
  }
});

/**
 * 微信监控拉取当前待支付金额列表
 * GET /api/pending-amounts?token=MONITOR_TOKEN
 * 无 pending 时返回空数组，wx_monitor 据此决定是否截图/上报
 */
app.get('/api/pending-amounts', (req, res) => {
  const token = req.query.token;
  if (token !== MONITOR_TOKEN) {
    console.warn('[pending-amounts] Token 不匹配，拒绝访问');
    return res.status(403).json({ code: 0, error: 'forbidden' });
  }
  const now = Date.now();
  const amounts = [];
  for (const [bjOrderNo, o] of pendingOrders.entries()) {
    // 只返回 30 分钟内创建的待支付订单
    if (now - o.createdAt < PENDING_TTL_MS) {
      amounts.push({
        bj_order_no: bjOrderNo,
        amount: o.amount.toFixed(2),
        item_type: o.itemType,
        created_at: o.createdAt
      });
    }
  }
  // 按创建时间倒序，监控脚本优先关注最新订单
  amounts.sort((a, b) => b.created_at - a.created_at);
  res.json({ code: 1, amounts });
});

/**
 * 查询订单状态（前端轮询）
 * GET /api/orders/status/:bj_order_no
 */
app.get('/api/orders/status/:bj_order_no', authMiddleware, async (req, res) => {
  try {
    const { bj_order_no } = req.params;
    const [rows] = await dbPool.execute(
      `SELECT bj_order_no, user_id, item_type, amount, status, paid_at, created_at
       FROM payment_orders WHERE bj_order_no = ? LIMIT 1`,
      [bj_order_no]
    );

    if (!rows.length) {
      return res.status(404).json({ code: 0, error: '订单不存在' });
    }

    const order = rows[0];
    if (order.user_id !== req.user.id) {
      return res.status(403).json({ code: 0, error: '无权查看该订单' });
    }

    res.json({ code: 1, order });
  } catch (err) {
    console.error('/api/orders/status 异常:', err);
    res.status(500).json({ code: 0, error: '服务器内部错误' });
  }
});

/**
 * 查询当前用户的支付/充值记录
 * GET /api/payment-records
 */
app.get('/api/payment-records', authMiddleware, async (req, res) => {
  try {
    const [rows] = await dbPool.execute(
      `SELECT bj_order_no, item_type, amount, channel, status, paid_at, created_at
       FROM payment_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ code: 1, records: rows });
  } catch (err) {
    console.error('/api/payment-records 异常:', err);
    res.status(500).json({ code: 0, error: '服务器内部错误' });
  }
});

/**
 * 删除当前用户指定的充值记录
 * DELETE /api/payment-records/:bj_order_no
 */
app.delete('/api/payment-records/:bj_order_no', authMiddleware, async (req, res) => {
  try {
    const bjOrderNo = req.params.bj_order_no;
    if (!bjOrderNo) {
      return res.status(400).json({ code: 0, error: '缺少订单编号' });
    }

    const [result] = await dbPool.execute(
      `DELETE FROM payment_orders WHERE user_id = ? AND bj_order_no = ?`,
      [req.user.id, bjOrderNo]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ code: 0, error: '记录不存在或无权删除' });
    }

    res.json({ code: 1, message: '删除成功' });
  } catch (err) {
    console.error('/api/payment-records/:bj_order_no 删除异常:', err);
    res.status(500).json({ code: 0, error: '服务器内部错误' });
  }
});

/**
 * 余额查询（绕过前端 token 时间校验）
 * GET /api/balance?userId=xxx
 * 直接用 service_role 查 profiles.balance，不受前端 JWT 的 iat 时间偏差影响
 */
app.get('/api/balance', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ code: 0, error: '缺少 userId' });
  }
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single();
    if (error) throw error;
    const balance = data && data.balance != null ? parseFloat(data.balance) : 0;
    res.json({ code: 1, balance });
  } catch (err) {
    console.error('/api/balance 异常:', err);
    res.status(500).json({ code: 0, error: '查询余额失败' });
  }
});

// ================== 启动 ==================
async function startServer() {
  try {
    // 启动前检查 MySQL 连通性
    const conn = await dbPool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
    console.log('MySQL 连接正常');
  } catch (err) {
    console.error('MySQL 连接失败:', err.message);
    process.exit(1);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BJ 支付中台已启动: http://0.0.0.0:${PORT}`);
    console.log(`mpay 回调地址: ${MPAY_NOTIFY_URL}`);
  });
}

startServer();
