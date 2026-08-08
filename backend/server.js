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
// 前端公开的 anon key，/api/sb 透明代理转发时用作 apikey 头（不用 service_role，避免越权）
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
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

if (!SUPABASE_ANON_KEY) {
  console.error('错误：缺少 SUPABASE_ANON_KEY，/api/sb 透明代理无法工作，请在 .env 中补充');
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
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
  // 除常规头外，必须放行 supabase-js 直连 PostgREST 时会发送的自定义头，
  // 否则 /api/sb 透明代理的预检会失败（浏览器控制台报 CORS 红字）
  allowedHeaders: [
    'Content-Type', 'Authorization', 'apikey', 'Prefer', 'Accept',
    'Accept-Profile', 'Content-Profile', 'Range', 'Range-Unit',
    'X-Client-Info', 'X-Supabase-Api-Version', 'If-Match', 'If-None-Match'
  ],
  // 显式设置预检缓存时间为 0，避免浏览器缓存不带 CORS 头的 OPTIONS 响应
  maxAge: 0,
  // Content-Range 必须暴露，supabase-js 依赖它解析 count / 分页
  exposedHeaders: ['X-Request-Id', 'Content-Range', 'Content-Location', 'Preference-Applied', 'Range-Unit']
}));

// 显式处理所有 OPTIONS 预检请求，确保 file:// (Origin: null) 一定能拿到 CORS 头
app.options('*', cors());

// 禁止任何中间层（Cloudflare/Nginx/浏览器）缓存 API 响应，避免 CORS 头被缓存吞掉
app.use(function(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Vary', 'Origin');
  next();
});

// /api/sb 透明代理需要原始字节 body 原样转发给 PostgREST，
// 因此必须抢在 express.json() 之前用 raw 解析（raw 会标记 req._body，json 会自动跳过）
app.use('/api/sb', express.raw({ type: '*/*', limit: '12mb' }));

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

// 给 Supabase 查询加超时，避免服务端请求挂死导致接口无响应
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`查询超时: ${label}`)), ms)
    )
  ]);
}

// 安全查询：超时或报错时返回空结果，避免单表故障拖垮整个聚合接口
async function safeQuery(promise, label, emptyValue = null) {
  try {
    const res = await withTimeout(promise, 12000, label);
    if (res && res.error) throw res.error;
    return res;
  } catch (err) {
    console.warn(`[safeQuery] ${label} 失败:`, err.message || err);
    return { data: emptyValue, error: err };
  }
}

// 为错误响应补 CORS 头的公共函数
function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (!origin || origin === 'null' || ALLOWED_ORIGIN_PATTERNS.some(re => re.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

/**
 * Supabase JWT 验签中间件
 * 前端调用时需在 Header 带：Authorization: Bearer <access_token>
 */
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) {
    setCorsHeaders(req, res);
    return res.status(401).json({ code: 0, error: '未提供登录凭证' });
  }
  try {
    let payload;
    if (SUPABASE_JWT_PUBLIC_KEY) {
      // Supabase 新 JWT Signing Keys：使用 ES256 非对称验签，PUBLIC_KEY 为 JWK JSON
      const jwk = JSON.parse(SUPABASE_JWT_PUBLIC_KEY);
      const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
      // clockTolerance: 300 秒，容忍 auth 与 REST 服务端的时钟 skew（常见 "JWT issued at future" 根因）
      payload = jwt.verify(token, publicKey, { algorithms: ['ES256'], clockTolerance: 300 });
    } else {
      // 旧版 Supabase：HS256/HS384/HS512 对称验签，JWT Secret 是 base64 编码字符串，需先 decode
      // clockTolerance: 300 秒，容忍 auth 与 REST 服务端的时钟 skew
      payload = jwt.verify(token, Buffer.from(SUPABASE_JWT_SECRET, 'base64'), { algorithms: ['HS256', 'HS384', 'HS512'], clockTolerance: 300 });
    }
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    console.error('JWT 验签失败:', err.message);
    setCorsHeaders(req, res);
    return res.status(401).json({ code: 0, error: '登录凭证无效或已过期' });
  }
}

/* ============================================================================
 * Supabase PostgREST 时钟偏差补偿
 * ----------------------------------------------------------------------------
 * 已实测确认（2026-08-08）：该 Supabase 项目的 PostgREST 实例时钟比它自己的
 * Auth(GoTrue) 服务落后约 17 小时。因此 Auth 刚签发的 access_token（iat 为当前
 * 时刻）在 PostgREST 看来永远处于"未来"，直连 REST 一律返回：
 *     401 {"code":"PGRST303","message":"JWT issued at future"}
 * 这是 Supabase 云端内部不一致，浏览器端无法规避。
 *
 * 解法：由本服务端做透明代理 —— 先验证用户原 token 的真实性，再用项目的
 * JWT Secret（HS256）重新签发一个"iat 远在过去、exp 远在未来"的等价 token，
 * 保留 sub / role / aud 等全部身份声明，从而 RLS 与 auth.uid() 行为完全不变。
 * 该 token 仅存在于本服务端到 Supabase 的单次请求中，绝不下发给浏览器。
 *
 * 注意：签名必须使用 SUPABASE_JWT_SECRET 的【原始字符串】形式。
 * 实测 Buffer.from(secret,'base64') 会被 PostgREST 拒绝（PGRST301 无法解码）。
 * ========================================================================== */
const SB_CLOCK_SKEW_SEC = parseInt(process.env.SB_CLOCK_SKEW_SEC || '2592000', 10); // 默认 ±30 天

// 验证浏览器送来的 Supabase token，返回完整 payload（失败抛异常）
function verifySupabaseToken(token) {
  let lastErr;
  if (SUPABASE_JWT_PUBLIC_KEY) {
    try {
      const jwk = JSON.parse(SUPABASE_JWT_PUBLIC_KEY);
      const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
      return jwt.verify(token, publicKey, { algorithms: ['ES256'], clockTolerance: 86400 });
    } catch (e) { lastErr = e; }
  }
  if (SUPABASE_JWT_SECRET) {
    // 依次尝试原始字符串与 base64 解码两种密钥形式，兼容新旧项目配置
    for (const key of [SUPABASE_JWT_SECRET, Buffer.from(SUPABASE_JWT_SECRET, 'base64')]) {
      try {
        return jwt.verify(token, key, { algorithms: ['HS256', 'HS384', 'HS512'], clockTolerance: 86400 });
      } catch (e) { lastErr = e; }
    }
  }
  throw lastErr || new Error('无可用的验签密钥');
}

// 依据已验证的 payload，重签一个 PostgREST 一定会接受的等价 token
function mintRestToken(payload) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: payload.sub,
    role: payload.role || 'authenticated',
    aud: payload.aud || 'authenticated',
    iss: `${SUPABASE_URL}/auth/v1`,
    email: payload.email || '',
    phone: payload.phone || '',
    app_metadata: payload.app_metadata || {},
    user_metadata: payload.user_metadata || {},
    is_anonymous: payload.is_anonymous === true,
    iat: now - SB_CLOCK_SKEW_SEC,
    exp: now + SB_CLOCK_SKEW_SEC
  };
  if (payload.session_id) claims.session_id = payload.session_id;
  if (payload.amr) claims.amr = payload.amr;
  if (payload.aal) claims.aal = payload.aal;
  return jwt.sign(claims, SUPABASE_JWT_SECRET, { algorithm: 'HS256' });
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
    setCorsHeaders(req, res);
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
    setCorsHeaders(req, res);
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
    setCorsHeaders(req, res);
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
    setCorsHeaders(req, res);
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
    setCorsHeaders(req, res);
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
    setCorsHeaders(req, res);
    res.status(500).json({ code: 0, error: '查询余额失败' });
  }
});

/**
 * 个人中心数据聚合查询（绕过前端 JWT iat 时间校验）
 * POST /api/profile-data
 * 使用 service_role 一次性查询个人中心所需全部数据，按 req.user.id 过滤
 */
app.post('/api/profile-data', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const profileRes = await safeQuery(
      supabase
        .from('profiles')
        .select('nickname, balance, avatar_url, server, sky_id, wangzhe_id, wz_server, game_type, created_at, rating, vip_expire_at, role, level')
        .eq('id', userId)
        .maybeSingle(),
      'profiles',
      null
    );
    const profile = profileRes.data || null;
    const nickname = profile && profile.nickname ? profile.nickname : '';

    const [
      ordersRes,
      wizardOrdersRes,
      myRequestPostsRes,
      myRequestAcceptsRes,
      myDispatchPostsRes,
      myDispatchAcceptsRes,
      teamMemberRes,
      couponsRes,
      favoritesRes
    ] = await Promise.all([
      safeQuery(supabase.from('orders').select('*').eq('user_id', userId), 'orders', []),
      nickname ? safeQuery(supabase.from('orders').select('*').eq('wizard_name', nickname), 'wizardOrders', []) : Promise.resolve({ data: [] }),
      safeQuery(supabase.from('order_requests').select('*').eq('user_id', userId), 'order_requests posts', []),
      safeQuery(supabase.from('order_requests').select('*').eq('accepted_by', userId), 'order_requests accepts', []),
      safeQuery(supabase.from('dispatch_orders').select('*').eq('user_id', userId), 'dispatch_orders posts', []),
      safeQuery(supabase.from('dispatch_orders').select('*').eq('accepted_by', userId), 'dispatch_orders accepts', []),
      safeQuery(supabase.from('dispatch_team_members').select('dispatch_order_id').eq('user_id', userId), 'dispatch_team_members', []),
      safeQuery(supabase.from('coupons').select('*').eq('user_id', userId).eq('used', false), 'coupons', []),
      safeQuery(supabase.from('favorites').select('*').eq('user_id', userId), 'favorites', [])
    ]);

    let teamDispatchOrders = [];
    const teamDispatchIds = (teamMemberRes.data || [])
      .map(m => m.dispatch_order_id)
      .filter(id => id != null);
    if (teamDispatchIds.length > 0) {
      const teamDispatchRes = await safeQuery(
        supabase.from('dispatch_orders').select('*').in('id', teamDispatchIds),
        'teamDispatchOrders',
        []
      );
      teamDispatchOrders = teamDispatchRes.data || [];
    }

    // 为收藏弹窗一次性查出被收藏用户的资料，避免前端本地 file:// 再连 Supabase 查 profiles
    let favoriteProfiles = [];
    const favorites = favoritesRes.data || [];
    if (favorites.length > 0) {
      const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      const favIds = favorites.map(f => f.wizard_id).filter(isUuid);
      const favNames = favorites.map(f => f.wizard_name).filter(Boolean);
      const favQueries = [];
      if (favIds.length > 0) {
        favQueries.push(safeQuery(supabase.from('profiles').select('id, role, nickname, avatar_url').in('id', favIds), 'favoriteProfiles by id', []));
      }
      if (favNames.length > 0) {
        favQueries.push(safeQuery(supabase.from('profiles').select('id, role, nickname, avatar_url').in('nickname', favNames), 'favoriteProfiles by name', []));
      }
      if (favQueries.length > 0) {
        const favResults = await Promise.all(favQueries);
        favResults.forEach(r => {
          (r.data || []).forEach(p => favoriteProfiles.push(p));
        });
      }
    }

    res.json({
      code: 1,
      data: {
        profile,
        orders: ordersRes.data || [],
        wizardOrders: wizardOrdersRes.data || [],
        myRequestPosts: myRequestPostsRes.data || [],
        myRequestAccepts: myRequestAcceptsRes.data || [],
        myDispatchPosts: myDispatchPostsRes.data || [],
        myDispatchAccepts: myDispatchAcceptsRes.data || [],
        teamDispatchOrders,
        coupons: couponsRes.data || [],
        favorites,
        favoriteProfiles
      }
    });
  } catch (err) {
    console.error('/api/profile-data 异常:', err);
    setCorsHeaders(req, res);
    if (!res.headersSent) {
      res.status(500).json({ code: 0, error: '查询个人中心数据失败: ' + (err.message || '未知错误') });
    }
  }
});

/**
 * 通知列表查询（绕过前端 JWT iat 时间校验）
 * GET /api/notifications?limit=50
 * 使用 service_role 查询当前用户最近 3 小时通知
 */
app.get('/api/notifications', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const limit = parseInt(req.query.limit, 10) || 50;
  try {
    const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data, error } = await withTimeout(
      supabase
        .from('notifications')
        .select('id, user_id, title, message, type, read, created_at, metadata')
        .eq('user_id', userId)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(limit),
      8000,
      '/api/notifications'
    );
    if (error) throw error;
    res.json({ code: 1, data: data || [] });
  } catch (err) {
    console.error('/api/notifications 异常:', err);
    // 权限不足时返回空数组，避免前端控制台持续报 500；同时记录日志以便排查
    if (err && err.code === '42501') {
      return res.status(200).json({ code: 1, data: [], warning: 'notifications 表未对 service_role 授权 SELECT' });
    }
    setCorsHeaders(req, res);
    res.status(500).json({ code: 0, error: '查询通知失败: ' + (err.message || '未知错误') });
  }
});

/**
 * 陪玩成员列表查询（绕过前端 JWT iat 时间校验）
 * GET /api/members-data
 * 使用 service_role 查询已通过审核的申请与对应用户资料
 */
app.get('/api/members-data', async (req, res) => {
  try {
    const appsRes = await safeQuery(
      supabase
        .from('applications')
        .select('id, username, gyname, game_id, server, wechat, skills, game_type, bio, screenshot, apply_time, user_id, wz_name, wz_game_id, wz_server, wz_wechat, wz_rank, wz_bio, wz_skills')
        .eq('status', 'approved')
        .order('apply_time', { ascending: false }),
      'applications',
      []
    );

    const apps = appsRes.data || [];
    let profiles = [];
    const userIds = apps.map(a => a.user_id).filter(Boolean);
    if (userIds.length > 0) {
      const profRes = await safeQuery(
        supabase.from('profiles').select('id, avatar_url, rating').in('id', userIds),
        'membersProfiles',
        []
      );
      profiles = profRes.data || [];
    }

    res.json({ code: 1, data: { applications: apps, profiles } });
  } catch (err) {
    console.error('/api/members-data 异常:', err);
    setCorsHeaders(req, res);
    if (!res.headersSent) {
      res.status(500).json({ code: 0, error: '查询成员列表失败: ' + (err.message || '未知错误') });
    }
  }
});

/**
 * 批量头像查询（绕过前端 JWT iat 时间校验）
 * POST /api/avatars
 * body: { emails: [...], names: [...] }
 * 返回 { code: 1, data: { emailMap: {...}, nameMap: {...} } }
 */
app.post('/api/avatars', async (req, res) => {
  try {
    const emails = Array.isArray(req.body.emails) ? req.body.emails.filter(Boolean) : [];
    const names = Array.isArray(req.body.names) ? req.body.names.filter(Boolean) : [];
    const emailMap = {};
    const nameMap = {};

    if (emails.length > 0) {
      const emailRes = await safeQuery(
        supabase.from('profiles').select('email, avatar_url, nickname').in('email', emails),
        'avatars by email',
        []
      );
      (emailRes.data || []).forEach(p => {
        emailMap[p.email] = p.avatar_url || '';
        if (p.nickname) emailMap['name:' + p.email] = p.nickname;
      });
    }

    if (names.length > 0) {
      const nameRes = await safeQuery(
        supabase.from('profiles').select('nickname, avatar_url').in('nickname', names),
        'avatars by name',
        []
      );
      (nameRes.data || []).forEach(p => {
        nameMap[p.nickname] = p.avatar_url || '';
      });
    }

    res.json({ code: 1, data: { emailMap, nameMap } });
  } catch (err) {
    console.error('/api/avatars 异常:', err);
    setCorsHeaders(req, res);
    if (!res.headersSent) {
      res.status(500).json({ code: 0, error: '查询头像失败: ' + (err.message || '未知错误') });
    }
  }
});

/**
 * 点单大厅数据查询（绕过前端 JWT iat 时间校验）
 * GET /api/order-hall-data
 * 公开部分：wizards、profiles（头像/评分）、pending order_requests/dispatch_orders、组队成员数
 * 登录部分：当前用户 profile、已下单陪玩名称、收藏列表
 */
app.get('/api/order-hall-data', async (req, res) => {
  try {
    // 尝试解析 token（可选），失败不影响公开数据
    let userId = null;
    try {
      const auth = req.headers.authorization || '';
      const token = auth.replace(/^Bearer\s+/i, '');
      if (token && SUPABASE_JWT_SECRET) {
        const payload = jwt.verify(token, Buffer.from(SUPABASE_JWT_SECRET, 'base64'), { algorithms: ['HS256', 'HS384', 'HS512'], clockTolerance: 300 });
        userId = payload.sub;
      }
    } catch (e) {}

    // 公开数据并行查询
    const [wizardsRes, requestsRes, dispatchesRes] = await Promise.all([
      safeQuery(supabase.from('wizards').select('*').order('created_at', { ascending: false }), 'wizards', []),
      safeQuery(supabase.from('order_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }), 'order_requests', []),
      safeQuery(supabase.from('dispatch_orders').select('*').eq('status', 'pending').order('created_at', { ascending: false }), 'dispatch_orders', [])
    ]);

    const wizards = wizardsRes.data || [];
    const requests = requestsRes.data || [];
    const dispatches = dispatchesRes.data || [];

    // 批量查 wizards 关联的 profiles（avatar_url, rating）
    const wizardUserIds = wizards.map(w => w.user_id).filter(Boolean);
    let wizardProfiles = [];
    if (wizardUserIds.length > 0) {
      const profRes = await safeQuery(
        supabase.from('profiles').select('id, nickname, avatar_url, rating').in('id', wizardUserIds),
        'wizardProfiles',
        []
      );
      wizardProfiles = profRes.data || [];
    }

    // 接单大厅发布者头像
    const nicknameSet = {};
    requests.concat(dispatches).forEach(item => { if (item.nickname) nicknameSet[item.nickname] = true; });
    const nicknames = Object.keys(nicknameSet);
    let requestAvatars = {};
    if (nicknames.length > 0) {
      const reqAvatarRes = await safeQuery(
        supabase.from('profiles').select('nickname, avatar_url').in('nickname', nicknames),
        'requestAvatars',
        []
      );
      (reqAvatarRes.data || []).forEach(p => { requestAvatars[p.nickname] = p.avatar_url || ''; });
    }

    // 组队成员数
    const dispatchIds = dispatches.map(d => d.id).filter(Boolean);
    let teamCountMap = {};
    if (dispatchIds.length > 0) {
      const tmRes = await safeQuery(
        supabase.from('dispatch_team_members').select('dispatch_order_id').in('dispatch_order_id', dispatchIds),
        'dispatchTeamMembers',
        []
      );
      (tmRes.data || []).forEach(t => {
        teamCountMap[t.dispatch_order_id] = (teamCountMap[t.dispatch_order_id] || 0) + 1;
      });
    }

    // 登录用户相关数据
    let profile = null;
    let orderedWizards = [];
    let favorites = [];
    if (userId) {
      const [profileRes, ordersRes, favRes] = await Promise.all([
        safeQuery(supabase.from('profiles').select('id, nickname, role, avatar_url, balance').eq('id', userId).maybeSingle(), 'orderHallProfile', null),
        safeQuery(supabase.from('orders').select('wizard_name, status').eq('user_id', userId).not('status', 'in', '("待支付","已取消")'), 'orderHallOrders', []),
        safeQuery(supabase.from('favorites').select('*').eq('user_id', userId).order('created_at', { ascending: false }), 'orderHallFavorites', [])
      ]);
      profile = profileRes.data || null;
      orderedWizards = (ordersRes.data || []).map(o => o.wizard_name).filter(Boolean);
      favorites = favRes.data || [];
    }

    res.json({
      code: 1,
      data: {
        wizards,
        wizardProfiles,
        pendingRequests: requests,
        pendingDispatches: dispatches,
        requestAvatars,
        teamCountMap,
        profile,
        orderedWizards,
        favorites
      }
    });
  } catch (err) {
    console.error('/api/order-hall-data 异常:', err);
    setCorsHeaders(req, res);
    if (!res.headersSent) {
      res.status(500).json({ code: 0, error: '查询大厅数据失败: ' + (err.message || '未知错误') });
    }
  }
});

/**
 * 查询某派单的组队成员（绕过前端 JWT iat 时间校验）
 * GET /api/dispatch-team-members?dispatch_id=<id>
 */
app.get('/api/dispatch-team-members', async (req, res) => {
  try {
    const dispatchId = parseInt(req.query.dispatch_id, 10);
    if (!dispatchId || isNaN(dispatchId)) {
      return res.status(400).json({ code: 0, error: '缺少 dispatch_id' });
    }

    const membersRes = await safeQuery(
      supabase
        .from('dispatch_team_members')
        .select('*')
        .eq('dispatch_order_id', dispatchId)
        .order('created_at', { ascending: true }),
      'dispatch_team_members',
      []
    );

    const members = membersRes.data || [];
    const userIds = members.map(m => m.user_id).filter(Boolean);
    let profiles = [];
    if (userIds.length > 0) {
      const profRes = await safeQuery(
        supabase.from('profiles').select('id, nickname, avatar_url').in('id', userIds),
        'dispatchTeamProfiles',
        []
      );
      profiles = profRes.data || [];
    }

    res.json({ code: 1, data: { members, profiles } });
  } catch (err) {
    console.error('/api/dispatch-team-members 异常:', err);
    setCorsHeaders(req, res);
    if (!res.headersSent) {
      res.status(500).json({ code: 0, error: '查询组队成员失败: ' + (err.message || '未知错误') });
    }
  }
});

/**
 * 加入团队页面数据查询（绕过前端 JWT iat 时间校验）
 * GET /api/join-data
 * 返回当前用户 profile 与所有 applications 记录
 */
app.get('/api/join-data', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const [profileRes, appsRes] = await Promise.all([
      safeQuery(
        supabase.from('profiles').select('sky_id, wangzhe_id, server, wz_server').eq('id', userId).maybeSingle(),
        'joinProfile',
        null
      ),
      safeQuery(
        supabase.from('applications').select('status, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        'joinApplications',
        []
      )
    ]);

    res.json({
      code: 1,
      data: {
        profile: profileRes.data || null,
        applications: appsRes.data || []
      }
    });
  } catch (err) {
    console.error('/api/join-data 异常:', err);
    setCorsHeaders(req, res);
    if (!res.headersSent) {
      res.status(500).json({ code: 0, error: '查询加入团队数据失败: ' + (err.message || '未知错误') });
    }
  }
});

// ================== 写操作代理（绕过前端 JWT iat 时间校验） ==================

/**
 * POST /api/orders/create
 * 下单 + 扣减余额 + 通知陪玩，全部走 service_role，避免 file:// 直连 Supabase 触发 401。
 * body: { orderData: { wizardId, wizardName, hours, totalPrice, serviceType, gameType, orderNo, boardName, remark, couponId } }
 */
app.post('/api/orders/create', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const orderData = (req.body && req.body.orderData) ? req.body.orderData : (req.body || {});
    const finalPrice = parseFloat(orderData.totalPrice) || 0;
    if (!(finalPrice >= 0)) {
      setCorsHeaders(req, res);
      return res.status(400).json({ code: 0, error: '订单金额无效' });
    }
    const profRes = await safeQuery(
      supabase.from('profiles').select('balance, nickname, email, username').eq('id', userId).maybeSingle(),
      'orderCreateProfile', null
    );
    const profile = profRes.data || {};
    const currentBalance = parseFloat(profile.balance) || 0;
    if (currentBalance < finalPrice) {
      setCorsHeaders(req, res);
      return res.status(400).json({ code: 0, error: '余额不足，请前往充值中心充值' });
    }
    const newBalance = currentBalance - finalPrice;
    const updRes = await safeQuery(
      supabase.from('profiles').update({ balance: newBalance }).eq('id', userId),
      'orderDeductBalance', null
    );
    if (updRes.error) throw updRes.error;
    if (orderData.couponId) {
      await safeQuery(
        supabase.from('coupons').update({ used: true }).eq('id', orderData.couponId).eq('user_id', userId),
        'markCouponUsed', null
      );
    }
    const orderPayload = {
      user_id: userId,
      wizard_id: orderData.wizardId || null,
      wizard_name: orderData.wizardName || '',
      hours: orderData.hours || 1,
      price: finalPrice,
      status: 'progress',
      service_type: orderData.serviceType || '',
      game_type: orderData.gameType || '光·遇',
      order_no: orderData.orderNo || ('ORD' + Date.now()),
      board_name: orderData.boardName || profile.nickname || profile.username || profile.email || '',
      remark: orderData.remark || ''
    };
    const insRes = await safeQuery(
      supabase.from('orders').insert(orderPayload).select('id').single(),
      'orderInsert', null
    );
    if (insRes.error) {
      await safeQuery(
        supabase.from('profiles').update({ balance: currentBalance }).eq('id', userId),
        'rollbackBalance', null
      );
      setCorsHeaders(req, res);
      return res.status(500).json({ code: 0, error: '下单失败：' + insRes.error.message });
    }
    const orderId = insRes.data && insRes.data.id;
    try {
      let wizardUserId = orderData.wizardId || '';
      if (!wizardUserId && orderData.wizardName) {
        const wRes = await safeQuery(
          supabase.from('wizards').select('user_id').eq('wizard_name', orderData.wizardName).limit(1),
          'lookupWizard', []
        );
        if (wRes.data && wRes.data.length > 0 && wRes.data[0].user_id) wizardUserId = wRes.data[0].user_id;
      }
      if (wizardUserId) {
        const buyerName = profile.nickname || profile.email || profile.username || '某位用户';
        await safeQuery(
          supabase.from('notifications').insert({
            user_id: String(wizardUserId),
            title: '新订单提醒',
            message: '用户 ' + buyerName + ' 已下单，服务类型：' + (orderData.serviceType || '未指定') + '，请尽快联系对方。',
            type: 'order_new',
            read: false
          }),
          'notifyWizard', null
        );
      }
    } catch (notifErr) {
      console.warn('[orders/create] 陪玩通知失败:', notifErr.message);
    }
    res.json({ code: 1, orderId: orderId, balance: newBalance });
  } catch (err) {
    console.error('/api/orders/create 异常:', err);
    setCorsHeaders(req, res);
    if (!res.headersSent) res.status(500).json({ code: 0, error: '下单失败：' + (err.message || '未知错误') });
  }
});

/**
 * POST /api/profile-update
 * 保存个人资料（含昵称占用校验），走 service_role。
 * body: { nickname, sky_id, wangzhe_id, server, wz_server, game_type, avatar_url }
 */
app.post('/api/profile-update', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const b = req.body || {};
    const updateData = {};
    if (typeof b.nickname === 'string') updateData.nickname = b.nickname.trim();
    if (typeof b.sky_id !== 'undefined') updateData.sky_id = b.sky_id;
    if (typeof b.wangzhe_id !== 'undefined') updateData.wangzhe_id = b.wangzhe_id;
    if (typeof b.server !== 'undefined') updateData.server = b.server;
    if (typeof b.wz_server !== 'undefined') updateData.wz_server = b.wz_server;
    if (typeof b.game_type !== 'undefined') updateData.game_type = b.game_type;
    if (typeof b.avatar_url !== 'undefined') updateData.avatar_url = b.avatar_url;

    if (!updateData.nickname) {
      setCorsHeaders(req, res);
      return res.status(400).json({ code: 0, error: '昵称不能为空' });
    }
    const dupRes = await safeQuery(
      supabase.from('profiles').select('id').or('nickname.eq.' + updateData.nickname + ',username.eq.' + updateData.nickname).neq('id', userId).maybeSingle(),
      'dupNameCheck', null
    );
    if (dupRes.data) {
      setCorsHeaders(req, res);
      return res.status(400).json({ code: 0, error: '该名称已被占用，请更换其他昵称' });
    }
    const upd = await safeQuery(
      supabase.from('profiles').update(updateData).eq('id', userId),
      'profileUpdate', null
    );
    if (upd.error) throw upd.error;
    res.json({ code: 1, profile: updateData });
  } catch (err) {
    console.error('/api/profile-update 异常:', err);
    setCorsHeaders(req, res);
    if (!res.headersSent) res.status(500).json({ code: 0, error: '保存失败：' + (err.message || '未知错误') });
  }
});

/**
 * POST /api/notifications  —— 创建通知（应用内通知，可指定接收人 user_id）
 * body: { user_id, title, message, type, metadata }
 */
app.post('/api/notifications', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const b = req.body || {};
    const target = b.user_id || userId;
    if (!b.title || !target) {
      setCorsHeaders(req, res);
      return res.status(400).json({ code: 0, error: '缺少标题或接收人' });
    }
    const ins = await safeQuery(
      supabase.from('notifications').insert({
        user_id: String(target),
        title: b.title,
        message: b.message || '',
        type: b.type || 'system',
        metadata: typeof b.metadata === 'string' ? b.metadata : JSON.stringify(b.metadata || {}),
        read: false
      }).select('id').single(),
      'createNotification', null
    );
    if (ins.error) throw ins.error;
    res.json({ code: 1, id: ins.data && ins.data.id });
  } catch (err) {
    console.error('/api/notifications 异常:', err);
    setCorsHeaders(req, res);
    if (!res.headersSent) res.status(500).json({ code: 0, error: '通知创建失败：' + (err.message || '未知错误') });
  }
});

/**
 * POST /api/notifications/delete —— 删除通知（仅限本人）
 * body: { id }
 */
app.post('/api/notifications/delete', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const b = req.body || {};
    const id = b.id;
    if (!id) {
      setCorsHeaders(req, res);
      return res.status(400).json({ code: 0, error: '缺少通知 id' });
    }
    const del = await safeQuery(
      supabase.from('notifications').delete().eq('id', id).eq('user_id', userId),
      'deleteNotification', null
    );
    if (del.error) throw del.error;
    res.json({ code: 1 });
  } catch (err) {
    console.error('/api/notifications/delete 异常:', err);
    setCorsHeaders(req, res);
    if (!res.headersSent) res.status(500).json({ code: 0, error: '删除通知失败：' + (err.message || '未知错误') });
  }
});

// ---------- 派单取消投票相关后端实现 ----------
async function backendNotifyDispatchVoteCounts(rawId, excludeUserId) {
  const orderRes = await safeQuery(supabase.from('dispatch_orders').select('user_id').eq('id', rawId).maybeSingle(), 'dco', null);
  const dispatcherId = orderRes.data ? orderRes.data.user_id : null;
  const votesRes = await safeQuery(supabase.from('dispatch_cancel_votes').select('vote').eq('dispatch_order_id', rawId), 'dcv', []);
  const membersRes = await safeQuery(supabase.from('dispatch_team_members').select('user_id').eq('dispatch_order_id', rawId), 'dtm', []);
  const votes = votesRes.data || [];
  const members = membersRes.data || [];
  let cancel = 0, reject = 0;
  votes.forEach(function (v) { if (v.vote === 'cancel') cancel++; else if (v.vote === 'reject') reject++; });
  const total = members.length;
  const msg = '取消投票进展：' + cancel + ' 人同意取消，' + reject + ' 人驳回（共 ' + total + ' 名接单人）。';
  const userIds = {};
  members.forEach(function (m) { if (String(m.user_id) !== String(excludeUserId)) userIds[String(m.user_id)] = true; });
  if (dispatcherId && String(dispatcherId) !== String(excludeUserId)) userIds[String(dispatcherId)] = true;
  for (const uid in userIds) {
    await safeQuery(supabase.from('notifications').insert({
      user_id: uid, title: '取消投票更新', message: msg, type: 'dispatch_cancel_vote',
      metadata: JSON.stringify({ order_id: String(rawId), cancel_count: cancel, reject_count: reject, total: total }), read: false
    }), 'notifyVote', null);
  }
}

async function backendResolveDispatchCancel(rawId, decision) {
  const membersRes = await safeQuery(supabase.from('dispatch_team_members').select('user_id').eq('dispatch_order_id', rawId), 'dtmBefore', []);
  const members = membersRes.data || [];
  if (decision === 'cancel') {
    const orderRes = await safeQuery(supabase.from('dispatch_orders').select('user_id, price').eq('id', rawId).maybeSingle(), 'dcoRefund', null);
    const order = orderRes.data;
    if (order && order.user_id && order.price) {
      const refundAmount = parseFloat(order.price) || 0;
      const profRes = await safeQuery(supabase.from('profiles').select('balance').eq('id', order.user_id).maybeSingle(), 'profRefund', null);
      const current = parseFloat(profRes.data && profRes.data.balance) || 0;
      await safeQuery(supabase.from('profiles').update({ balance: current + refundAmount }).eq('id', order.user_id), 'doRefund', null);
    }
    await safeQuery(supabase.from('dispatch_orders').delete().eq('id', rawId), 'delDispatch', null);
  } else {
    await safeQuery(supabase.from('dispatch_orders').update({ cancel_requested: false, cancel_requested_at: null, status: 'progress' }).eq('id', rawId), 'rejectDispatch', null);
  }
  const msg = decision === 'cancel' ? '取消申请已通过，派单已取消。' : '取消申请被驳回，派单继续正常进行。';
  const userIds = {};
  members.forEach(function (m) { if (m.user_id) userIds[String(m.user_id)] = true; });
  for (const uid in userIds) {
    await safeQuery(supabase.from('notifications').insert({
      user_id: uid, title: '取消结果通知', message: msg, type: 'dispatch_cancel_result',
      metadata: JSON.stringify({ order_id: String(rawId), decision: decision }), read: false
    }), 'notifyResolved', null);
  }
}

async function backendCheckDispatchCancelResolved(rawId, userId) {
  const votesRes = await safeQuery(supabase.from('dispatch_cancel_votes').select('vote').eq('dispatch_order_id', rawId), 'dcv2', []);
  const membersRes = await safeQuery(supabase.from('dispatch_team_members').select('user_id').eq('dispatch_order_id', rawId), 'dtm2', []);
  const votes = votesRes.data || [];
  const members = membersRes.data || [];
  const total = members.length;
  let cancel = 0, reject = 0;
  votes.forEach(function (v) { if (v.vote === 'cancel') cancel++; else if (v.vote === 'reject') reject++; });
  const half = total / 2;
  if (cancel > half) { await backendResolveDispatchCancel(rawId, 'cancel'); return true; }
  if (reject > half) { await backendResolveDispatchCancel(rawId, 'reject'); return true; }
  return false;
}

/**
 * POST /api/dispatch-cancel-request —— 派单人发起取消投票
 * body: { dispatch_id }
 */
app.post('/api/dispatch-cancel-request', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const rawId = parseInt(req.body && req.body.dispatch_id, 10);
    if (!rawId) throw new Error('无效的派单 ID');
    const orderRes = await safeQuery(supabase.from('dispatch_orders').select('user_id').eq('id', rawId).maybeSingle(), 'dcoCheck', null);
    if (!orderRes.data || String(orderRes.data.user_id) !== String(userId)) {
      setCorsHeaders(req, res);
      return res.status(403).json({ code: 0, error: '只有派单人可以发起取消' });
    }
    const memRes = await safeQuery(supabase.from('dispatch_team_members').select('user_id').eq('dispatch_order_id', rawId), 'dtm', []);
    const members = memRes.data || [];
    for (let i = 0; i < members.length; i++) {
      const uid = members[i].user_id;
      if (String(uid) === String(userId)) continue;
      await safeQuery(supabase.from('notifications').insert({
        user_id: String(uid),
        title: '派单取消投票',
        message: '派单人发起了取消申请，请到「我接的单」投票：同意取消 或 驳回。',
        type: 'dispatch_cancel_request',
        metadata: JSON.stringify({ order_id: String(rawId) }),
        read: false
      }), 'notifyCancelReq', null);
    }
    await safeQuery(
      supabase.from('dispatch_orders').update({ cancel_requested: true, cancel_requested_at: new Date().toISOString() }).eq('id', rawId),
      'markCancelReq', null
    );
    res.json({ code: 1 });
  } catch (err) {
    console.error('/api/dispatch-cancel-request 异常:', err);
    setCorsHeaders(req, res);
    if (!res.headersSent) res.status(500).json({ code: 0, error: '发起取消失败：' + (err.message || '请重试') });
  }
});

/**
 * POST /api/dispatch-vote —— 接单人投票（cancel / reject）
 * body: { dispatch_id, vote }
 */
app.post('/api/dispatch-vote', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const rawId = parseInt(req.body && req.body.dispatch_id, 10);
    const vote = req.body && req.body.vote;
    if (!rawId) throw new Error('无效的派单 ID');
    if (vote !== 'cancel' && vote !== 'reject') throw new Error('无效投票');
    const memRes = await safeQuery(
      supabase.from('dispatch_team_members').select('user_id').eq('dispatch_order_id', rawId).eq('user_id', userId).maybeSingle(),
      'dtmCheck', null
    );
    if (!memRes.data) {
      setCorsHeaders(req, res);
      return res.status(403).json({ code: 0, error: '你不是该派单的接单人' });
    }
    const ve = await safeQuery(
      supabase.from('dispatch_cancel_votes').upsert({
        dispatch_order_id: rawId, user_id: userId, vote: vote, created_at: new Date().toISOString()
      }, { onConflict: 'dispatch_order_id,user_id' }),
      'voteUpsert', null
    );
    if (ve.error) throw ve.error;
    await backendNotifyDispatchVoteCounts(rawId, userId);
    await backendCheckDispatchCancelResolved(rawId, userId);
    res.json({ code: 1 });
  } catch (err) {
    console.error('/api/dispatch-vote 异常:', err);
    setCorsHeaders(req, res);
    if (!res.headersSent) res.status(500).json({ code: 0, error: '投票失败：' + (err.message || '请重试') });
  }
});

/**
 * POST /api/account-delete —— 注销账号（删除本人相关数据 + auth 用户）
 */
app.post('/api/account-delete', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const tables = ['favorites', 'coupons', 'notifications', 'applications', 'wizards', 'dispatch_team_members'];
    for (const t of tables) {
      await safeQuery(supabase.from(t).delete().eq('user_id', userId), 'delete_' + t, null);
    }
    await safeQuery(supabase.from('orders').delete().eq('user_id', userId), 'delete_orders', null);
    await safeQuery(supabase.from('profiles').delete().eq('id', userId), 'delete_profile', null);
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch (e) {
      console.warn('[account-delete] auth 用户删除失败（可能无权限）:', e.message);
    }
    res.json({ code: 1 });
  } catch (err) {
    console.error('/api/account-delete 异常:', err);
    setCorsHeaders(req, res);
    if (!res.headersSent) res.status(500).json({ code: 0, error: '注销失败：' + (err.message || '未知错误') });
  }
});

/* ============================================================================
 * Supabase PostgREST 透明代理： /api/sb/rest/v1/*  →  <SUPABASE_URL>/rest/v1/*
 * ----------------------------------------------------------------------------
 * 前端 supabase-js 的所有 REST 调用改指向这里，本服务端负责把浏览器持有的
 * access_token 换成 PostgREST 能接受的等价 token（见 mintRestToken 注释）。
 * 除 Authorization 外，请求与响应均原样透传，因此：
 *   · RLS 策略、auth.uid()、归属权判断等业务语义 100% 不变
 *   · 前端已有的 100+ 处 .from(...) 调用一行都不用改
 * ========================================================================== */
const SB_PROXY_PREFIX = '/api/sb';

// 转发给 PostgREST 的请求头白名单（Authorization / apikey 由本服务重新设置）
const SB_FORWARD_REQ_HEADERS = [
  'content-type', 'prefer', 'accept', 'accept-profile', 'content-profile',
  'range', 'range-unit', 'x-client-info', 'x-supabase-api-version',
  'if-match', 'if-none-match'
];

// 回传给浏览器的响应头白名单（不透传上游 CORS / 压缩相关头，避免与本服务冲突）
const SB_FORWARD_RES_HEADERS = [
  'content-type', 'content-range', 'content-location',
  'preference-applied', 'range-unit'
];

app.all(SB_PROXY_PREFIX + '/*', async (req, res) => {
  setCorsHeaders(req, res);
  try {
    const suffix = req.originalUrl.slice(SB_PROXY_PREFIX.length); // 含 query string
    // 只允许代理 REST 接口，杜绝被当作任意 URL 的开放代理
    if (!/^\/rest\/v1\//.test(suffix.split('?')[0])) {
      return res.status(403).json({ code: 0, error: '仅允许代理 /rest/v1 路径' });
    }

    const incoming = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    let outgoingAuth;

    if (!incoming || incoming === SUPABASE_ANON_KEY) {
      // 未登录：anon key 的 iat 早已是过去时间，PostgREST 可直接接受
      outgoingAuth = SUPABASE_ANON_KEY;
    } else {
      let payload;
      try {
        payload = verifySupabaseToken(incoming);
      } catch (e) {
        console.warn('[sb-proxy] token 验签失败:', e.message);
        return res.status(401).json({ code: 0, error: '登录凭证无效或已过期', detail: e.message });
      }
      if (payload.role === 'service_role') {
        // 浏览器不该持有 service_role，出现即视为攻击
        return res.status(403).json({ code: 0, error: '不允许的凭证类型' });
      }
      outgoingAuth = payload.sub ? mintRestToken(payload) : SUPABASE_ANON_KEY;
    }

    const headers = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + outgoingAuth };
    for (const h of SB_FORWARD_REQ_HEADERS) {
      if (req.headers[h] !== undefined) headers[h] = req.headers[h];
    }

    const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
                    Buffer.isBuffer(req.body) && req.body.length > 0;

    const upstream = await withTimeout(
      fetch(SUPABASE_URL + suffix, {
        method: req.method,
        headers,
        body: hasBody ? req.body : undefined
      }),
      15000,
      'sb-proxy ' + req.method + ' ' + suffix.split('?')[0]
    );

    for (const h of SB_FORWARD_RES_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.status(upstream.status);
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (err) {
    console.error('[sb-proxy] 异常:', err && err.message ? err.message : err);
    setCorsHeaders(req, res);
    if (!res.headersSent) {
      return res.status(502).json({ code: 0, error: '数据服务暂时不可用：' + (err.message || '未知错误') });
    }
  }
});

// ================== 全局错误处理（保证任何异常响应都带 CORS 头） ==================
app.use(function(err, req, res, next) {
  setCorsHeaders(req, res);
  console.error('[全局错误处理]', err && err.stack ? err.stack : err);
  if (!res.headersSent) {
    res.status(err && err.status ? err.status : 500).json({
      code: 0,
      error: err && err.message ? err.message : '服务器内部错误'
    });
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
