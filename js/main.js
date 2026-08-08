// ============================================

// BJ陪玩团 - 主交互脚本

// ============================================



// --- 导航栏滚动效果 ---

window.addEventListener('scroll', () => {

    const navbar = document.querySelector('.navbar');

    if (navbar) {

        if (window.scrollY > 50) {

            navbar.classList.add('scrolled');

        } else {

            navbar.classList.remove('scrolled');

        }

    }

});



// --- 消息通知 ---

const DEFAULT_NOTIFICATIONS = [
    { id: 'notif_1', title: '欢迎加入BJ陪玩团', text: '恭喜成为我们的新成员，开始你的陪玩之旅吧！', time: '今天', unread: true },
    { id: 'notif_2', title: '系统公告', text: '新版UI界面即将上线，敬请期待新功能', time: '1小时前', unread: false },
    { id: 'notif_3', title: 'VIP特权', text: '开通VIP享专属陪玩折扣和优先匹配服务', time: '3天前', unread: false }
];

var __notificationsCache = null;

function getNotifications() {
    if(__notificationsCache) return __notificationsCache;
    try {
        const saved = localStorage.getItem('skyNotifications');
        if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_NOTIFICATIONS.map(function(n) { return Object.assign({}, n); });
}

function setNotificationsCache(list) {
    __notificationsCache = list || [];
    try {
        localStorage.setItem('skyNotifications', JSON.stringify(__notificationsCache));
    } catch (e) {}
}

function formatNotifTime(iso) {
    if(!iso) return '';
    var d = new Date(iso);
    if(isNaN(d.getTime())) return iso;
    var now = new Date();
    var diff = now - d;
    var oneMinute = 60 * 1000;
    var oneHour = 60 * oneMinute;
    var oneDay = 24 * oneHour;
    if(diff < oneMinute) return '刚刚';
    if(diff < oneHour) return Math.floor(diff / oneMinute) + '分钟前';
    if(diff < oneDay) return Math.floor(diff / oneHour) + '小时前';
    var days = Math.floor(diff / oneDay);
    if(days < 7) return days + '天前';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}




// 安全解析 JWT payload（不验证签名，仅取 iat/exp）
function decodeJwtPayload(token) {
    if (!token) return null;
    try {
        var parts = token.split('.');
        if (parts.length < 2) return null;
        var base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        var json = atob(base64);
        return JSON.parse(json);
    } catch (e) {
        return null;
    }
}

function sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

// 后端代理统一使用 HTTPS 域名。内网源站 192.168.186.130:3000 在 Windows 侧不可达，
// 且 file:// 本地页面跨域访问内网 IP 会被浏览器静默拦截，因此统一走 api.skypw.dpdns.org。
function getApiBase() {
    if (typeof window.API_BASE !== 'undefined') return window.API_BASE;
    return 'https://api.skypw.dpdns.org';
}
window.getApiBase = getApiBase;

// fetch 超时包装，避免浏览器请求无限挂起
async function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    if (typeof AbortController !== 'undefined') {
        var controller = new AbortController();
        var id = setTimeout(function() { controller.abort(); }, timeoutMs);
        try {
            return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
        } finally {
            clearTimeout(id);
        }
    }
    return await fetch(url, options);
}
window.fetchWithTimeout = fetchWithTimeout;

// 获取当前用户的 Supabase access_token：优先读内存，再读 localStorage 的 sky-auth-token
function getSupabaseToken() {
    try {
        if (window.supabaseClient && window.supabaseClient.auth && window.supabaseClient.auth.currentSession) {
            return window.supabaseClient.auth.currentSession.access_token || null;
        }
    } catch(e) {}
    try {
        var raw = localStorage.getItem('sky-auth-token');
        if (raw) {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.access_token) return parsed.access_token;
            if (parsed && parsed.session && parsed.session.access_token) return parsed.session.access_token;
        }
    } catch(e) {}
    try {
        var userStr = localStorage.getItem('skyUser');
        if (userStr) {
            var user = JSON.parse(userStr);
            if (user && user.access_token) return user.access_token;
        }
    } catch(e) {}
    return null;
}
window.getSupabaseToken = getSupabaseToken;

// 判断是否为 "JWT issued at future" 类错误，兼容 Supabase 返回的对象和异常。
// 注意：不把普通 401/unauthorized 算进来，避免所有 401 都被死循环重试。
function isJwtFutureError(errOrResult) {
    if (!errOrResult) return false;
    // 如果传入的是查询结果对象 { data, error }，取 error
    var err = errOrResult.error || errOrResult;
    var msg = String(err && (err.message || err.msg || err)).toLowerCase();
    return msg.indexOf('issued at future') !== -1 ||
           msg.indexOf('jwt') !== -1 && msg.indexOf('future') !== -1 ||
           msg.indexOf('iat') !== -1 && msg.indexOf('future') !== -1;
}

// 执行 Supabase 查询，若报 "JWT issued at future"，则等待 token 生效时间后重试。
// 适用于 Supabase auth/REST 服务存在时钟 skew 的场景。
async function withJwtRetry(queryFn, maxRetries) {
    maxRetries = (maxRetries == null) ? 5 : maxRetries;
    var lastResult;
    for (var i = 0; i <= maxRetries; i++) {
        try {
            lastResult = await queryFn();
        } catch (err) {
            lastResult = err;
        }

        // Supabase 通常不抛异常，而是返回 { error } 对象
        if (lastResult && !lastResult.error && typeof lastResult === 'object' && (lastResult.message || lastResult.msg)) {
            lastResult = { error: lastResult };
        }

        var errObj = lastResult && lastResult.error ? lastResult.error : lastResult;
        var errMsg = String(errObj && (errObj.message || errObj.msg || errObj)).toLowerCase();
        if (lastResult && lastResult.error && isJwtFutureError(lastResult)) {
            if (i < maxRetries) {
                try {
                    var res = await window.supabaseClient.auth.getSession();
                    var token = res && res.data && res.data.session && res.data.session.access_token;
                    var payload = token ? decodeJwtPayload(token) : null;
                    var iatMs = payload && payload.iat ? payload.iat * 1000 : 0;
                    var nowMs = Date.now();
                    var wait = iatMs ? (iatMs - nowMs + 1000) : 2000;
                    // iat 已过去但 REST 仍判 future：这是服务端时钟 skew，客户端等也没用，直接返回错误
                    if (wait <= 0) {
                        console.warn('[withJwtRetry] iat 已过去但 REST 仍拒绝（服务端时钟偏差），停止重试:', errMsg);
                        return lastResult;
                    }
                    if (wait < 500) wait = 500;
                    if (wait > 10000) wait = 10000; // 最多等 10 秒
                    console.warn('[withJwtRetry] 第' + (i + 1) + '次遇到 JWT future，iat=' + (iatMs ? new Date(iatMs).toISOString() : 'unknown') + '，now=' + new Date(nowMs).toISOString() + '，等待 ' + wait + 'ms 后重试');
                    await sleep(wait);
                } catch (e) {
                    console.warn('[withJwtRetry] 计算等待时间失败，等 2s:', e);
                    await sleep(2000);
                }
                continue;
            } else {
                console.warn('[withJwtRetry] 超过最大重试次数，返回错误:', errMsg);
            }
        }
        return lastResult;
    }
    return lastResult;
}
window.withJwtRetry = withJwtRetry;
async function loadNotifications() {
    try {
        var user = null;
        try {
            user = JSON.parse(localStorage.getItem('skyUser') || '{}');
        } catch(e) {}
        var userId = user && (user.id || user.user_id);
        if(!userId) {
            if (!window.supabaseClient) return;
            var sessionRes = await window.supabaseClient.auth.getSession();
            userId = sessionRes.data && sessionRes.data.session && sessionRes.data.session.user && sessionRes.data.session.user.id;
        }
        if(!userId) return;

        var list = null;
        // 优先走后端代理，绕过 Supabase REST 的 JWT iat future 问题
        try {
            var token = getSupabaseToken();
            if (token) {
                var res = await fetchWithTimeout(getApiBase() + '/api/notifications?limit=50', {
                    method: 'GET',
                    headers: { 'Authorization': 'Bearer ' + token }
                }, 25000);
                if (res.ok) {
                    var result = await res.json();
                    if (result.code === 1 && Array.isArray(result.data)) {
                        list = result.data.map(function(n) {
                            return {
                                id: n.id,
                                title: n.title || '系统通知',
                                text: n.message || '',
                                time: formatNotifTime(n.created_at),
                                unread: !n.read,
                                raw: n
                            };
                        });
                    }
                }
            }
        } catch(apiErr) {
            // 后端失败，继续走 Supabase 兜底
        }

        // 后端代理失败时不再回退 Supabase（已知会 401），直接渲染缓存或空列表
        if (!list) {
            console.warn('[loadNotifications] 后端代理不可用，使用缓存通知');
            list = getNotifications() || [];
        }

        setNotificationsCache(list);
        renderNotificationList(list);
        updateNotifBadge(list);
    } catch(e) {
        // 加载失败不打印警告，静默使用缓存渲染
        renderNotificationList(getNotifications());
    }
}
window.loadNotifications = loadNotifications;

function updateNotifBadge(list) {
    var badge = document.getElementById('notifBadge');
    if(!badge) return;
    var count = (list || []).filter(function(n) { return n.unread; }).length;
    if(count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.add('show');
    } else {
        badge.classList.remove('show');
    }
}

function deleteNotification(id) {
    if(!id || !window.supabaseClient) return;
    window.supabaseClient
        .from('notifications')
        .delete()
        .eq('id', id)
        .then(function(res) {
            if(res.error) throw res.error;
            loadNotifications();
        })
        .catch(function(e) {
            console.error('删除通知失败:', e);
            showNotification('删除通知失败', 'error');
        });
}
window.deleteNotification = deleteNotification;

function markNotificationRead(id) {
    if(!id || !window.supabaseClient) return;
    window.supabaseClient
        .from('notifications')
        .update({ read: true })
        .eq('id', id)
        .then(function(res) {
            if(res.error) throw res.error;
            loadNotifications();
        })
        .catch(function(e) {
            console.error('标记已读失败:', e);
        });
}
window.markNotificationRead = markNotificationRead;

function renderNotificationList(notifications) {
    const panel = document.getElementById('notificationPanel');
    if (!panel) return;
    const listContainer = panel.querySelector('.notif-list');
    if (!listContainer) return;
    if (!notifications) notifications = getNotifications();

    // 自动处理已超过 3 小时的订单取消申请通知
    autoConfirmExpiredCancellations(notifications);

    if (notifications.length === 0) {
        listContainer.innerHTML = '<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>暂无消息通知</p></div>';
    } else {
        listContainer.innerHTML = notifications.map(function(n) {
            var clickAction = 'markNotificationRead(\'' + n.id + '\')';
            if (n.raw && n.raw.type === 'order_cancel_request' && n.raw.metadata) {
                try {
                    var meta = (typeof n.raw.metadata === 'string') ? JSON.parse(n.raw.metadata) : n.raw.metadata;
                    if (meta && meta.order_id) {
                        clickAction = 'handleCancelRequestNotification(\'' + n.id + '\', \'' + meta.order_id + '\')';
                    }
                } catch(e) {}
            }
            return '<div class="notif-item ' + (n.unread ? 'unread' : '') + '" data-id="' + n.id + '" onclick="' + clickAction + '">' +
                '<div class="notif-dot"></div>' +
                '<div class="notif-content">' +
                    '<div class="notif-title">' + (n.title || '') + '</div>' +
                    '<div class="notif-text">' + (n.text || '') + '</div>' +
                    '<div class="notif-time">' + (n.time || '') + '</div>' +
                '</div>' +
                '<button class="notif-delete" onclick="deleteNotification(\'' + n.id + '\'); event.stopPropagation();" title="删除"><i class="fas fa-times"></i></button>' +
            '</div>';
        }).join('');
    }
}

function escapeHtml(text) {
    if(text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 通用消息/确认白卡片（动态创建，不依赖页面结构）
function showMessageModal(options) {
    options = options || {};
    var title = options.title || '提示';
    var message = options.message || '';
    var showCancel = !!options.showCancel;
    var cancelText = options.cancelText || '取消';
    var okText = options.okText || '确定';
    var onOk = typeof options.onOk === 'function' ? options.onOk : function() {};
    var onCancel = typeof options.onCancel === 'function' ? options.onCancel : function() {};

    var existing = document.getElementById('dynamicMessageModal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'dynamicMessageModal';
    overlay.className = 'card-overlay active';
    overlay.style.cssText = 'display:flex;z-index:10001;';
    overlay.innerHTML =
        '<div class="card-modal confirm-modal" style="max-width:360px;text-align:center;padding:28px 24px;">' +
            '<h3 style="margin:0 0 12px 0;font-size:1.15rem;color:#333;">' + escapeHtml(title) + '</h3>' +
            '<p style="margin:0 0 24px 0;font-size:0.95rem;color:#666;line-height:1.5;">' + escapeHtml(message) + '</p>' +
            '<div class="confirm-actions">' +
                (showCancel ? '<button class="btn-confirm-cancel" id="msgModalCancel">' + escapeHtml(cancelText) + '</button>' : '') +
                '<button class="btn-confirm-ok" id="msgModalOk">' + escapeHtml(okText) + '</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.remove();
            onCancel();
        }
    });

    var okBtn = document.getElementById('msgModalOk');
    if (okBtn) {
        okBtn.addEventListener('click', function() {
            overlay.remove();
            onOk();
        });
    }

    var cancelBtn = document.getElementById('msgModalCancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            overlay.remove();
            onCancel();
        });
    }
}
window.showMessageModal = showMessageModal;

// 用户发起取消订单申请
async function requestCancelOrder(orderId) {
    if (!orderId || !window.supabaseClient) {
        showNotification('订单信息缺失', 'error');
        return;
    }
    try {
        var userStr = localStorage.getItem('skyUser') || '{}';
        var user = JSON.parse(userStr);
        if (!user || !user.id) {
            showNotification('请先登录', 'error');
            return;
        }

        // 1. 查询订单，确认是当前用户的进行中订单
        var { data: order, error: fetchErr } = await window.supabaseClient
            .from('orders')
            .select('id, user_id, wizard_id, wizard_name, price, status, cancel_requested')
            .eq('id', orderId)
            .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!order) throw new Error('未找到该订单');
        if (String(order.user_id) !== String(user.id)) throw new Error('只能取消自己的订单');
        if (order.status !== 'progress' && order.status !== '进行中') throw new Error('只有进行中的订单可以申请取消');
        if (order.cancel_requested) throw new Error('已发起取消申请，请等待陪陪确认');

        // 1.5 兜底：旧订单可能没有 wizard_id，用 wizard_name 反查 wizards 表补全
        var wizardUserId = order.wizard_id || '';
        if (!wizardUserId && order.wizard_name) {
            try {
                var { data: wizardRows, error: wizardLookupErr } = await window.supabaseClient
                    .from('wizards')
                    .select('user_id')
                    .eq('wizard_name', order.wizard_name)
                    .limit(1);
                if (wizardLookupErr) console.warn('反查陪玩 user_id 失败:', wizardLookupErr);
                if (wizardRows && wizardRows.length > 0 && wizardRows[0].user_id) {
                    wizardUserId = wizardRows[0].user_id;
                    // 顺手把订单的 wizard_id 补回去，方便后续流程
                    await window.supabaseClient
                        .from('orders')
                        .update({ wizard_id: wizardUserId })
                        .eq('id', orderId);
                }
            } catch (lookupErr) {
                console.warn('wizard_id 兜底查询异常:', lookupErr);
            }
        }

        // 2. 标记取消申请
        var { error: updateErr } = await window.supabaseClient
            .from('orders')
            .update({ cancel_requested: true, cancel_requested_at: new Date().toISOString() })
            .eq('id', orderId);
        if (updateErr) throw updateErr;

        // 3. 给陪陪发送通知
        if (wizardUserId) {
            var buyerName = user.nickname || user.email || user.username || '某位用户';
            var { error: notifErr } = await window.supabaseClient
                .from('notifications')
                .insert({
                    user_id: String(wizardUserId),
                    title: '订单取消申请',
                    message: '用户 ' + buyerName + ' 希望取消订单「' + (order.wizard_name || '未知陪玩') + '」，请在消息中确认。如未确认，3小时后将自动取消并退款。',
                    type: 'order_cancel_request',
                    metadata: JSON.stringify({ order_id: String(orderId) }),
                    read: false
                });
            if (notifErr) {
                console.warn('发送取消申请通知失败:', notifErr);
                showNotification('取消申请已提交，但通知发送失败：' + (notifErr.message || '请让对方手动刷新'), 'warning');
            }
        } else {
            console.warn('订单缺少 wizard_id，无法给陪陪发送取消通知。订单 ID:', orderId);
            showNotification('取消申请已提交，但无法定位陪陪，请联系管理', 'warning');
        }

        // 4. 刷新本地订单缓存（如果页面有）
        if (typeof window.loadOrders === 'function') {
            try { window.loadOrders(); } catch(e) {}
        }

        // 5. 弹出等待确认提示
        showMessageModal({
            title: '取消申请已发送',
            message: '等待陪陪确认，对方确认后订单取消，金额将返还账户',
            okText: '知道了',
            onOk: function() {}
        });
    } catch (err) {
        console.error('申请取消订单失败:', err);
        showNotification('申请取消失败：' + (err.message || '请重试'), 'error');
    }
}
window.requestCancelOrder = requestCancelOrder;

// 陪陪点击取消申请通知后弹出确认
function handleCancelRequestNotification(notificationId, orderId) {
    if (!orderId) {
        markNotificationRead(notificationId);
        return;
    }
    showMessageModal({
        title: '订单取消确认',
        message: '对方希望取消订单，经过确认后订单取消，不进行确定则三小时后自动确定。',
        showCancel: true,
        cancelText: '暂不处理',
        okText: '确认取消',
        onOk: function() {
            confirmCancelOrder(orderId, notificationId);
        },
        onCancel: function() {
            // 关闭弹窗，不标记已读，让陪陪可以再次点击
        }
    });
}
window.handleCancelRequestNotification = handleCancelRequestNotification;

// 陪陪确认取消订单：退款并标记取消
async function confirmCancelOrder(orderId, notificationId) {
    if (!orderId || !window.supabaseClient) {
        showNotification('订单信息缺失', 'error');
        return;
    }
    try {
        var sessionRes = await window.supabaseClient.auth.getSession();
        var wizardUserId = sessionRes.data && sessionRes.data.session && sessionRes.data.session.user && sessionRes.data.session.user.id;
        if (!wizardUserId) {
            showNotification('请先登录', 'error');
            return;
        }

        // 查询订单
        var { data: order, error: fetchErr } = await window.supabaseClient
            .from('orders')
            .select('id, user_id, wizard_id, wizard_name, price, status, cancel_requested')
            .eq('id', orderId)
            .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!order) throw new Error('未找到该订单');
        // 权限校验：wizard_id 匹配当前用户；若旧订单缺失 wizard_id，则允许 wizard_name 匹配当前用户昵称兜底
        var canConfirm = String(order.wizard_id) === String(wizardUserId);
        if (!canConfirm && !order.wizard_id && order.wizard_name) {
            try {
                var { data: meProf } = await window.supabaseClient
                    .from('profiles')
                    .select('nickname')
                    .eq('id', wizardUserId)
                    .maybeSingle();
                if (meProf && meProf.nickname && meProf.nickname === order.wizard_name) {
                    canConfirm = true;
                    // 顺手补全 wizard_id，后续流程不再缺失
                    await window.supabaseClient
                        .from('orders')
                        .update({ wizard_id: wizardUserId })
                        .eq('id', orderId);
                }
            } catch(e) {}
        }
        if (!canConfirm) throw new Error('无权确认该订单');
        if (order.status === 'cancelled' || order.status === '已完成') throw new Error('该订单已结束');

        var refundAmount = parseFloat(order.price) || 0;
        var buyerId = order.user_id;

        // 退款给下单用户
        if (refundAmount > 0 && buyerId) {
            var { data: buyerProfile, error: buyerErr } = await window.supabaseClient
                .from('profiles')
                .select('balance')
                .eq('id', buyerId)
                .maybeSingle();
            if (buyerErr) throw buyerErr;
            var currentBalance = parseFloat(buyerProfile && buyerProfile.balance) || 0;
            var newBalance = currentBalance + refundAmount;
            var { error: refundErr } = await window.supabaseClient
                .from('profiles')
                .update({ balance: newBalance })
                .eq('id', buyerId);
            if (refundErr) throw refundErr;

            // 同步本地余额
            try {
                var skyUser = JSON.parse(localStorage.getItem('skyUser') || '{}');
                if (String(skyUser.id) === String(buyerId)) {
                    skyUser.balance = newBalance;
                    localStorage.setItem('skyUser', JSON.stringify(skyUser));
                }
            } catch(e) {}
        }

        // 物理删除订单记录（下单方与接单方共享同一行，删除后双方订单列表均不再显示）
        var { error: updateErr } = await window.supabaseClient
            .from('orders')
            .delete()
            .eq('id', orderId);
        if (updateErr) throw updateErr;

        // 给下单用户发送通知
        try {
            await window.supabaseClient
                .from('notifications')
                .insert({
                    user_id: String(buyerId),
                    title: '订单已取消',
                    message: '陪陪已确认取消订单，金额 ¥' + refundAmount.toFixed(2) + ' 已返还到您的账户。',
                    type: 'order_cancelled',
                    read: false
                });
        } catch(notifErr) {
            console.warn('发送取消成功通知失败:', notifErr);
        }

        // 标记原通知已读/删除
        if (notificationId) {
            try {
                await window.supabaseClient.from('notifications').delete().eq('id', notificationId);
            } catch(e) {}
        }

        // 刷新通知和订单列表
        loadNotifications();
        if (typeof window.loadOrders === 'function') {
            try { window.loadOrders(); } catch(e) {}
        }

        showNotification('订单已取消，金额已退还用户', 'success');
    } catch (err) {
        console.error('确认取消订单失败:', err);
        showNotification('确认取消失败：' + (err.message || '请重试'), 'error');
    }
}
window.confirmCancelOrder = confirmCancelOrder;

// 陪陪驳回取消申请：恢复订单并通知下单用户
async function rejectCancelOrder(orderId) {
    if (!orderId || !window.supabaseClient) {
        showNotification('订单信息缺失', 'error');
        return;
    }
    try {
        var sessionRes = await window.supabaseClient.auth.getSession();
        var wizardUserId = sessionRes.data && sessionRes.data.session && sessionRes.data.session.user && sessionRes.data.session.user.id;
        if (!wizardUserId) {
            showNotification('请先登录', 'error');
            return;
        }

        var { data: order, error: fetchErr } = await window.supabaseClient
            .from('orders')
            .select('id, user_id, wizard_id, wizard_name, price, status, cancel_requested')
            .eq('id', orderId)
            .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!order) throw new Error('未找到该订单');

        // 权限校验：与 confirmCancelOrder 保持一致
        var canReject = String(order.wizard_id) === String(wizardUserId);
        if (!canReject && !order.wizard_id && order.wizard_name) {
            try {
                var { data: meProf } = await window.supabaseClient
                    .from('profiles')
                    .select('nickname')
                    .eq('id', wizardUserId)
                    .maybeSingle();
                if (meProf && meProf.nickname && meProf.nickname === order.wizard_name) {
                    canReject = true;
                    await window.supabaseClient
                        .from('orders')
                        .update({ wizard_id: wizardUserId })
                        .eq('id', orderId);
                }
            } catch(e) {}
        }
        if (!canReject) throw new Error('无权操作该订单');
        if (!order.cancel_requested) throw new Error('该订单未申请取消');

        // 恢复订单为进行中（双方视图共享同一行，更新后双方均显示进行中）
        var { error: updateErr } = await window.supabaseClient
            .from('orders')
            .update({ cancel_requested: false, cancel_requested_at: null, status: 'progress' })
            .eq('id', orderId);
        if (updateErr) throw updateErr;

        // 通知下单用户
        try {
            var wizardName = order.wizard_name || '陪陪';
            await window.supabaseClient
                .from('notifications')
                .insert({
                    user_id: String(order.user_id),
                    title: '取消申请被驳回',
                    message: '陪陪 ' + wizardName + ' 已驳回您的取消申请，订单将继续进行。',
                    type: 'order_cancel_rejected',
                    read: false
                });
        } catch(notifErr) {
            console.warn('发送驳回通知失败:', notifErr);
        }

        // 删除陪陪自己收到的这条取消申请通知（如存在）
        try {
            var { data: notifRows } = await window.supabaseClient
                .from('notifications')
                .select('id, metadata')
                .eq('user_id', wizardUserId)
                .eq('type', 'order_cancel_request');
            if (notifRows && notifRows.length > 0) {
                for (var i = 0; i < notifRows.length; i++) {
                    var meta = notifRows[i].metadata;
                    try {
                        meta = (typeof meta === 'string') ? JSON.parse(meta) : meta;
                        if (meta && String(meta.order_id) === String(orderId)) {
                            await window.supabaseClient.from('notifications').delete().eq('id', notifRows[i].id);
                        }
                    } catch(e) {}
                }
            }
        } catch(delErr) {
            console.warn('删除取消申请通知失败:', delErr);
        }

        loadNotifications();
        if (typeof window.loadOrders === 'function') {
            try { window.loadOrders(); } catch(e) {}
        }

        showNotification('已驳回取消申请，订单继续', 'success');
    } catch (err) {
        console.error('驳回取消申请失败:', err);
        showNotification('驳回失败：' + (err.message || '请重试'), 'error');
    }
}
window.rejectCancelOrder = rejectCancelOrder;

// 自动确认已超过 3 小时的取消申请（通知过期删除前兜底）
function autoConfirmExpiredCancellations(notifications) {
    if (!Array.isArray(notifications)) return;
    var now = Date.now();
    var threeHours = 3 * 60 * 60 * 1000;
    notifications.forEach(function(n) {
        if (!n.raw || n.raw.type !== 'order_cancel_request' || !n.raw.metadata) return;
        try {
            var meta = (typeof n.raw.metadata === 'string') ? JSON.parse(n.raw.metadata) : n.raw.metadata;
            if (!meta || !meta.order_id || !n.raw.created_at) return;
            var created = new Date(n.raw.created_at).getTime();
            if (now - created >= threeHours) {
                // 异步自动确认，不阻塞渲染
                confirmCancelOrder(meta.order_id, n.id);
            }
        } catch(e) {}
    });
}


// ============================================================
// 组队订单（dispatch_orders）取消投票
// 流程：派单人发起 → 所有接单人表决（同意取消 / 驳回）→ 任一方过半即生效
//       每人投票后两个选项都变灰；3 小时后若某项 > 半数自动通过
// ============================================================

// 给订单对象附加投票信息（票数 / 我的票 / 总人数），供卡片渲染
async function loadDispatchCancelInfo(orders, userId) {
    if (!Array.isArray(orders) || !userId) return;
    var dispOrders = orders.filter(function(o) { return o.isDispatch && o.rawId; });
    if (dispOrders.length === 0) return;
    var ids = dispOrders.map(function(o) { return o.rawId; });
    try {
        var votesRes = await window.supabaseClient
            .from('dispatch_cancel_votes')
            .select('dispatch_order_id, user_id, vote')
            .in('dispatch_order_id', ids);
        var memberRes = await window.supabaseClient
            .from('dispatch_team_members')
            .select('dispatch_order_id, user_id')
            .in('dispatch_order_id', ids);
        var votes = votesRes.data || [];
        var members = memberRes.data || [];
        var byOrder = {};
        ids.forEach(function(id) { byOrder[id] = { cancel: 0, reject: 0, total: 0, my: null }; });
        members.forEach(function(m) { if (byOrder[m.dispatch_order_id]) byOrder[m.dispatch_order_id].total++; });
        votes.forEach(function(v) {
            var b = byOrder[v.dispatch_order_id];
            if (!b) return;
            if (v.vote === 'cancel') b.cancel++;
            else if (v.vote === 'reject') b.reject++;
            if (String(v.user_id) === String(userId)) b.my = v.vote;
        });
        dispOrders.forEach(function(o) {
            var b = byOrder[o.rawId] || { cancel: 0, reject: 0, total: 0, my: null };
            o.cancelVotes = b.cancel;
            o.rejectVotes = b.reject;
            o.totalMembers = b.total;
            o.myVote = b.my;
        });
    } catch (e) {
        console.warn('loadDispatchCancelInfo failed:', e);
    }
}
window.loadDispatchCancelInfo = loadDispatchCancelInfo;

// 派单人发起取消投票
async function requestDispatchCancel(rawId) {
    try {
        rawId = parseInt(rawId, 10);
        if (!rawId) throw new Error('无效的派单 ID');
        var token = (typeof window.getSupabaseToken === 'function') ? window.getSupabaseToken() : null;
        if (!token) { showNotification('请先登录', 'error'); return; }
        const resp = await window.fetchWithTimeout(window.getApiBase() + '/api/dispatch-cancel-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ dispatch_id: rawId })
        });
        const result = await resp.json();
        if (result.code !== 1) { showNotification(result.error || '发起取消失败', 'error'); return; }
        showNotification('已发起取消投票，等待接单人表决', 'success');
        if (typeof window.refreshCurrentPageOrders === 'function') window.refreshCurrentPageOrders();
    } catch (e) {
        console.error('requestDispatchCancel failed:', e);
        showNotification('发起取消失败：' + (e.message || '请重试'), 'error');
    }
}
window.requestDispatchCancel = requestDispatchCancel;

async function voteDispatchCancel(rawId, vote) {
    try {
        rawId = parseInt(rawId, 10);
        if (!rawId) throw new Error('无效的派单 ID');
        if (vote !== 'cancel' && vote !== 'reject') throw new Error('无效投票');
        var token = (typeof window.getSupabaseToken === 'function') ? window.getSupabaseToken() : null;
        if (!token) { showNotification('请先登录', 'error'); return; }
        const resp = await window.fetchWithTimeout(window.getApiBase() + '/api/dispatch-vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ dispatch_id: rawId, vote: vote })
        });
        const result = await resp.json();
        if (result.code !== 1) { showNotification(result.error || '投票失败', 'error'); return; }
        showNotification('已投票：' + (vote === 'cancel' ? '同意取消' : '驳回取消'), 'success');
        if (typeof window.refreshCurrentPageOrders === 'function') window.refreshCurrentPageOrders();
    } catch (e) {
        console.error('voteDispatchCancel failed:', e);
        showNotification('投票失败：' + (e.message || '请重试'), 'error');
    }
}
window.voteDispatchCancel = voteDispatchCancel;

// 投票后通知其他接单人 + 派单人最新票数
async function notifyDispatchVoteCounts(rawId, excludeUserId) {
    try {
        var orderRes = await window.supabaseClient
            .from('dispatch_orders').select('user_id').eq('id', rawId).maybeSingle();
        var dispatcherId = orderRes.data ? orderRes.data.user_id : null;
        var votesRes = await window.supabaseClient
            .from('dispatch_cancel_votes').select('vote').eq('dispatch_order_id', rawId);
        var membersRes = await window.supabaseClient
            .from('dispatch_team_members').select('user_id').eq('dispatch_order_id', rawId);
        var votes = votesRes.data || [];
        var members = membersRes.data || [];
        var cancel = 0, reject = 0;
        votes.forEach(function(v) { if (v.vote === 'cancel') cancel++; else if (v.vote === 'reject') reject++; });
        var total = members.length;
        var msg = '取消投票进展：' + cancel + ' 人同意取消，' + reject + ' 人驳回（共 ' + total + ' 名接单人）。';
        var userIds = {};
        members.forEach(function(m) { if (String(m.user_id) !== String(excludeUserId)) userIds[String(m.user_id)] = true; });
        if (dispatcherId && String(dispatcherId) !== String(excludeUserId)) userIds[String(dispatcherId)] = true;
        for (var uid in userIds) {
            await window.supabaseClient.from('notifications').insert({
                user_id: uid,
                title: '取消投票更新',
                message: msg,
                type: 'dispatch_cancel_vote',
                metadata: JSON.stringify({ order_id: String(rawId), cancel_count: cancel, reject_count: reject, total: total }),
                read: false
            });
        }
    } catch (e) {
        console.warn('notifyDispatchVoteCounts failed:', e);
    }
}
window.notifyDispatchVoteCounts = notifyDispatchVoteCounts;

// 计算票数，任一方 > 半数则立即生效（过半即代表多数人意见）
async function checkDispatchCancelResolved(rawId, userId) {
    try {
        var votesRes = await window.supabaseClient
            .from('dispatch_cancel_votes').select('vote').eq('dispatch_order_id', rawId);
        var membersRes = await window.supabaseClient
            .from('dispatch_team_members').select('user_id').eq('dispatch_order_id', rawId);
        var votes = votesRes.data || [];
        var members = membersRes.data || [];
        var total = members.length;
        var cancel = 0, reject = 0;
        votes.forEach(function(v) { if (v.vote === 'cancel') cancel++; else if (v.vote === 'reject') reject++; });
        var half = total / 2;
        if (cancel > half) { await resolveDispatchCancel(rawId, 'cancel'); return true; }
        if (reject > half) { await resolveDispatchCancel(rawId, 'reject'); return true; }
        return false;
    } catch (e) {
        console.warn('checkDispatchCancelResolved failed:', e);
        return false;
    }
}
window.checkDispatchCancelResolved = checkDispatchCancelResolved;

// 落实结果：cancel → 物理删除派单（连带组队成员、投票记录级联删除）；reject → 恢复进行中
async function resolveDispatchCancel(rawId, decision) {
    try {
        if (decision === 'cancel') {
            // 先退款给派单人
            try {
                var orderRes = await window.supabaseClient
                    .from('dispatch_orders').select('user_id, price').eq('id', rawId).maybeSingle();
                var order = orderRes.data;
                if (order && order.user_id && order.price) {
                    var refundAmount = parseFloat(order.price) || 0;
                    var profRes = await window.supabaseClient
                        .from('profiles').select('balance').eq('id', order.user_id).maybeSingle();
                    var current = parseFloat(profRes.data && profRes.data.balance) || 0;
                    await window.supabaseClient
                        .from('profiles').update({ balance: current + refundAmount }).eq('id', order.user_id);
                    try {
                        var skyUser = JSON.parse(localStorage.getItem('skyUser') || '{}');
                        if (String(skyUser.id) === String(order.user_id)) {
                            skyUser.balance = current + refundAmount;
                            localStorage.setItem('skyUser', JSON.stringify(skyUser));
                        }
                    } catch(e) {}
                }
            } catch(refundErr) { console.warn('dispatch cancel refund failed:', refundErr); }

            // 物理删除派单记录（关联的 dispatch_team_members / dispatch_cancel_votes 会级联删除）
            var { error: de } = await window.supabaseClient
                .from('dispatch_orders')
                .delete()
                .eq('id', rawId);
            if (de) throw de;
            await notifyDispatchResolved(rawId, 'cancel');
        } else {
            var { error: ue2 } = await window.supabaseClient
                .from('dispatch_orders')
                .update({ cancel_requested: false, cancel_requested_at: null, status: 'progress' })
                .eq('id', rawId);
            if (ue2) throw ue2;
            await notifyDispatchResolved(rawId, 'reject');
        }
    } catch (e) {
        console.warn('resolveDispatchCancel failed:', e);
    }
}
window.resolveDispatchCancel = resolveDispatchCancel;

// 通知所有人最终结果
async function notifyDispatchResolved(rawId, decision) {
    try {
        var orderRes = await window.supabaseClient
            .from('dispatch_orders').select('user_id').eq('id', rawId).maybeSingle();
        var dispatcherId = orderRes.data ? orderRes.data.user_id : null;
        var membersRes = await window.supabaseClient
            .from('dispatch_team_members').select('user_id').eq('dispatch_order_id', rawId);
        var members = membersRes.data || [];
        var msg = decision === 'cancel' ? '取消申请已通过，派单已取消。' : '取消申请被驳回，派单继续正常进行。';
        var userIds = {};
        members.forEach(function(m) { userIds[String(m.user_id)] = true; });
        if (dispatcherId) userIds[String(dispatcherId)] = true;
        for (var uid in userIds) {
            await window.supabaseClient.from('notifications').insert({
                user_id: uid,
                title: decision === 'cancel' ? '派单已取消' : '派单继续',
                message: msg,
                type: 'dispatch_cancel_resolved',
                metadata: JSON.stringify({ order_id: String(rawId), decision: decision }),
                read: false
            });
        }
    } catch (e) {
        console.warn('notifyDispatchResolved failed:', e);
    }
}
window.notifyDispatchResolved = notifyDispatchResolved;

// 前端兜底：页面加载时检查已超 3 小时且未决的取消投票，过半则自动通过
async function autoResolveExpiredDispatchCancels(orders) {
    if (!Array.isArray(orders)) return;
    var now = Date.now();
    var threeHours = 3 * 60 * 60 * 1000;
    var expired = orders.filter(function(o) {
        return o.isDispatch && o.cancel_requested && o.cancel_requested_at
            && (now - new Date(o.cancel_requested_at).getTime() > threeHours);
    });
    for (var i = 0; i < expired.length; i++) {
        var sess = await window.supabaseClient.auth.getSession();
        var user = sess.data && sess.data.session ? sess.data.session.user : null;
        if (user) await checkDispatchCancelResolved(expired[i].rawId, user.id);
    }
}
window.autoResolveExpiredDispatchCancels = autoResolveExpiredDispatchCancels;


// --- 移动端菜单切换 ---

function toggleMenu() {

    const menu = document.getElementById('navMenu');

    const hamburger = document.getElementById('hamburger');

    if (menu && hamburger) {

        menu.classList.toggle('open');

        hamburger.classList.toggle('active');

    }

}



// --- 点击菜单项后自动关闭 ---

document.addEventListener('click', (e) => {

    if (e.target.classList.contains('nav-link')) {

        const menu = document.getElementById('navMenu');

        const hamburger = document.getElementById('hamburger');

        if (menu && menu.classList.contains('open')) {

            menu.classList.remove('open');

            hamburger.classList.remove('active');

        }

    }

});



// --- 登录弹窗 ---

function showLoginModal() {

    const modal = document.getElementById('loginModal');

    if (modal) {

        modal.classList.add('active');

        document.body.style.overflow = 'hidden';

    }

}



function closeLoginModal() {

    const modal = document.getElementById('loginModal');

    if (modal) {

        modal.classList.remove('active');

        document.body.style.overflow = '';

    }

}



// --- Tab切换 ---

function switchTab(tab) {

    const tabs = document.querySelectorAll('.modal-tabs .tab');

    const loginForm = document.getElementById('loginForm');

    const registerForm = document.getElementById('registerForm');



    tabs.forEach(t => t.classList.remove('active'));



    if (tab === 'login') {

        tabs[0].classList.add('active');

        loginForm.style.display = 'block';

        registerForm.style.display = 'none';

    } else {

        tabs[1].classList.add('active');

        loginForm.style.display = 'none';

        registerForm.style.display = 'block';

    }

}



// --- 订单弹窗 ---

let currentWizardPrice = 0;
let currentCoupon = null;
let availableCoupons = [];
let allCoupons = [];
let couponAutoSelectEnabled = true;
let currentOrderWizardName = '';
let currentOrderWizardId = '';



async function fillOrderEmail() {
    const input = document.getElementById('orderEmail');
    if(!input) return;
    let email = '';
    try {
        const userStr = localStorage.getItem('skyUser');
        if(userStr) {
            const user = JSON.parse(userStr);
            email = user.email || '';
        }
    } catch(ex) {}
    if(!email && window.supabaseClient && window.supabaseClient.auth) {
        try {
            const sessionRes = await window.supabaseClient.auth.getSession();
            email = (sessionRes.data && sessionRes.data.session && sessionRes.data.session.user && sessionRes.data.session.user.email) || '';
        } catch(ex) {}
    }
    input.value = email || '';
}

async function showOrderModal(name, price, avatar, skills, wizardId) {

    const modal = document.getElementById('orderModal');

    const wizardName = document.getElementById('orderWizardName');

    const wizardPrice = document.getElementById('orderWizardPrice');

    const totalPrice = document.getElementById('orderTotalPrice');

    const avatarEl = document.querySelector('.order-wizard-avatar');

    const serviceTypeSelect = document.getElementById('orderServiceType');


    if (modal && wizardName && wizardPrice) {

        currentOrderWizardName = name || '';
        currentOrderWizardId = wizardId || '';

        wizardName.textContent = name;

        wizardPrice.textContent = '￥' + price.toFixed(2) + '/小时';

        // Update avatar in modal
        if (avatar) {
            const av = String(avatar).replace(/^"|"/g, '');
            avatarEl.innerHTML = '<img src="' + av + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
        } else {
            avatarEl.innerHTML = '<i class="fas fa-user-circle"></i>';
        }

        // Dynamically populate service type dropdown from skill tags array
        if (serviceTypeSelect) {
            // skills can be a JSON stringified array like '["技术","娱乐","普陪"]' or ''
            var skillArray = [];
            if (skills) {
                try {
                    var parsed = JSON.parse(skills);
                    if (Array.isArray(parsed)) skillArray = parsed;
                } catch(e) {
                    // Not valid JSON, treat as single value if non-empty
                    if (String(skills).trim()) skillArray = [String(skills).trim()];
                }
            }

            // Fallback: read skill tags from the visible wizard card if no valid skills passed
            var hasValidSkills = skillArray.some(function(s) { return String(s).trim() && String(s).trim() !== '['; });
            if (!hasValidSkills && name) {
                skillArray = [];
                var cards = document.querySelectorAll('.wizard-list-card');
                for (var c = 0; c < cards.length; c++) {
                    var cardNameEl = cards[c].querySelector('.card-info h3');
                    if (cardNameEl && cardNameEl.textContent.trim() === name) {
                        var tagEls = cards[c].querySelectorAll('.card-skills .skill');
                        for (var t = 0; t < tagEls.length; t++) {
                            var tagText = tagEls[t].textContent.trim();
                            if (tagText) skillArray.push(tagText);
                        }
                        break;
                    }
                }
            }

            // Clear previous options except placeholder
            while (serviceTypeSelect.options.length > 1) {
                serviceTypeSelect.remove(1);
            }

            // Keep display identical to card tags (sync service types)
            var seen = {};
            for (var i = 0; i < skillArray.length; i++) {
                var rawSkill = String(skillArray[i]).trim();
                if (!rawSkill || seen[rawSkill]) continue;
                seen[rawSkill] = true;
                var option = document.createElement('option');
                option.value = rawSkill;
                option.textContent = rawSkill;
                serviceTypeSelect.appendChild(option);
            }
        }

        currentWizardPrice = price;

        await loadOrderCoupons();

        calcOrderTotal();

        await fillOrderEmail();

        modal.classList.add('active');

        document.body.style.overflow = 'hidden';

    }

}



function closeOrderModal() {

    const modal = document.getElementById('orderModal');

    if (modal) {

        modal.classList.remove('active');

        document.body.style.overflow = '';

    }

    currentCoupon = null;
    availableCoupons = [];
    allCoupons = [];
    couponAutoSelectEnabled = true;

}



// --- 计算订单总价 ---

function calcOrderTotal() {

    const hoursInput = document.querySelector('#orderForm input[type=\"number\"]');

    const totalPrice = document.getElementById('orderTotalPrice');

    const select = document.getElementById('orderCouponSelect');

    if (hoursInput && totalPrice) {

        const hours = parseInt(hoursInput.value) || 1;

        let subtotal = hours * currentWizardPrice;

        // Re-evaluate available coupons whenever the amount changes
        refreshCouponsForAmount(subtotal);

        // Always sync currentCoupon with the actually selected option
        if (select && select.value) {
            const selectedId = select.value;
            currentCoupon = availableCoupons.find(function(c) { return String(c.id) === String(selectedId); }) || null;
        } else if (select && !select.value && couponAutoSelectEnabled && availableCoupons.length > 0) {
            currentCoupon = availableCoupons[0];
            select.value = currentCoupon.id;
        } else if (select && !select.value) {
            currentCoupon = null;
        }

        // Apply selected coupon if it still satisfies current order amount
        if (currentCoupon && isCouponApplicable(currentCoupon, subtotal)) {
            if (currentCoupon.type === 'percent') {
                subtotal = Math.max(0, subtotal * (1 - (parseFloat(currentCoupon.amount) || 0)));
            } else {
                subtotal = Math.max(0, subtotal - (currentCoupon.amount || 0));
            }
        }

        totalPrice.textContent = '￥' + subtotal.toFixed(2);

    }

}



// --- 优惠券逻辑 ---

function parseCouponMinAmount(condition) {
    if (!condition) return 0;
    const text = String(condition);
    if (text.includes('无门槛')) return 0;
    const match = text.match(/满\s*([0-9]+(?:\.[0-9]+)?)/);
    if (match) return parseFloat(match[1]) || 0;
    return 0;
}

function isCouponApplicable(coupon, orderAmount) {
    if (!coupon) return false;
    if (coupon.used) return false;
    if (coupon.expire_date && String(coupon.expire_date).trim()) {
        const expire = new Date(coupon.expire_date);
        const now = new Date();
        if (!isNaN(expire.getTime()) && expire < now) return false;
    }
    const minAmount = parseCouponMinAmount(coupon.condition);
    return orderAmount >= minAmount;
}

async function deleteExpiredCoupons(coupons) {
    if (!Array.isArray(coupons) || coupons.length === 0 || !window.supabaseClient) return coupons;

    const now = new Date();

    const expiredIds = coupons
        .filter(function(c) {
            if (!c.expire_date) return false;
            const expire = new Date(c.expire_date);
            return !isNaN(expire.getTime()) && expire < now;
        })
        .map(function(c) { return c.id; });

    if (expiredIds.length > 0) {
        try {
            const { error: delErr } = await window.supabaseClient
                .from('coupons')
                .delete()
                .in('id', expiredIds);
            if (delErr) throw delErr;
        } catch(e) {
            console.error('删除过期优惠券失败:', e);
        }
    }

    return coupons.filter(function(c) {
        if (!c.expire_date) return true;
        const expire = new Date(c.expire_date);
        return isNaN(expire.getTime()) || expire >= now;
    });
}

async function loadOrderCoupons() {
    const select = document.getElementById('orderCouponSelect');
    if (!select) return;

    // Reset
    select.innerHTML = '<option value="">不使用优惠券</option>';
    currentCoupon = null;
    availableCoupons = [];
    allCoupons = [];

    const userStr = localStorage.getItem('skyUser');
    if (!userStr || !window.supabaseClient) {
        select.innerHTML = '<option value="">暂无优惠券可用</option>';
        select.disabled = true;
        return;
    }

    let user = null;
    try { user = JSON.parse(userStr); } catch(e) { user = null; }
    if (!user || !user.id) {
        select.innerHTML = '<option value="">暂无优惠券可用</option>';
        select.disabled = true;
        return;
    }

    try {
        const { data: coupons, error } = await window.supabaseClient
            .from('coupons')
            .select('*')
            .eq('user_id', user.id)
            .eq('used', false)
            .order('amount', { ascending: false });

        if (error) throw error;

        allCoupons = await deleteExpiredCoupons(coupons || []);

        const hoursInput = document.querySelector('#orderForm input[type="number"]');
        const hours = hoursInput ? (parseInt(hoursInput.value) || 1) : 1;
        const orderAmount = hours * currentWizardPrice;

        refreshCouponsForAmount(orderAmount);

        // Coupons are loaded asynchronously; recalculate total so the auto-selected discount is applied
        calcOrderTotal();

    } catch(err) {
        console.error('加载优惠券失败:', err);
        select.innerHTML = '<option value="">暂无优惠券可用</option>';
        select.disabled = true;
    }
}

function refreshCouponsForAmount(orderAmount) {
    const select = document.getElementById('orderCouponSelect');
    if (!select) return;

    const validCoupons = allCoupons.filter(function(c) {
        return isCouponApplicable(c, orderAmount);
    });

    availableCoupons = validCoupons;

    if (validCoupons.length === 0) {
        select.innerHTML = '<option value="">暂无优惠券可用</option>';
        select.disabled = true;
        currentCoupon = null;
        return;
    }

    select.disabled = false;
    select.innerHTML = '<option value="">不使用优惠券</option>';

    validCoupons.forEach(function(c) {
        const amount = parseFloat(c.amount) || 0;
        const conditionText = c.condition || '无门槛';
        const expireText = c.expire_date ? ('到期：' + c.expire_date) : '长期有效';
        const option = document.createElement('option');
        option.value = c.id;
        if (c.type === 'percent') {
            const discount = Math.round((1 - amount) * 100);
            option.textContent = discount + '折券 (' + conditionText + '，' + expireText + ')';
        } else {
            option.textContent = '满减 ¥' + amount.toFixed(2) + ' (' + conditionText + '，' + expireText + ')';
        }
        option.dataset.couponId = c.id;
        select.appendChild(option);
    });

    // Preserve user selection if still applicable; otherwise auto-select the best coupon
    if (currentCoupon && isCouponApplicable(currentCoupon, orderAmount)) {
        select.value = currentCoupon.id;
    } else if (couponAutoSelectEnabled) {
        currentCoupon = validCoupons[0];
        select.value = currentCoupon.id;
    } else {
        currentCoupon = null;
        select.value = '';
    }
}

function onOrderCouponChange() {
    const select = document.getElementById('orderCouponSelect');
    if (!select) return;

    const selectedId = select.value;
    if (!selectedId) {
        currentCoupon = null;
        couponAutoSelectEnabled = false;
    } else {
        currentCoupon = availableCoupons.find(function(c) { return String(c.id) === String(selectedId); }) || null;
        couponAutoSelectEnabled = true;
    }

    calcOrderTotal();
}

// --- 下载APP ---

function downloadApp(platform) {

    if (platform === 'android') {

    } else if (platform === 'ios') {

    } else {

        // 显示下载选择

        const choice = confirm('您想下载哪个平台的APP？\\n\\n确定 = Android\\n取消 = iOS');

        if (choice) {

            downloadApp('android');

        } else {

            downloadApp('ios');

        }

    }

}





// --- 通知系统（全局） ---

function showNotification(message, type) {

    const old = document.querySelector('.notification-toast');
    if (old) old.remove();

    const toast = document.createElement('div');

    toast.className = 'notification-toast notification-' + type;
    toast.innerHTML = '<div class="notification-content">' + message + '</div>';
    toast.style.cssText = 'position:fixed;top:80px;right:20px;padding:16px 24px;border-radius:12px;color:white;font-weight:600;z-index:10000;animation:slideInRight 0.3s ease;box-shadow:0 4px 20px rgba(0,0,0,0.15);';

    if (type === 'success') {
        toast.style.background = 'linear-gradient(135deg, #4CAF50, #66BB6A)';
    } else if (type === 'error') {
        toast.style.background = 'linear-gradient(135deg, #f44336, #e57373)';
    } else {
        toast.style.background = 'linear-gradient(135deg, #2196F3, #64B5F6)';
    }

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 3000);
    }, 3000);

}

// --- 表单提交 ---

document.addEventListener('DOMContentLoaded', () => {

    // 登录表单

    const loginForm = document.getElementById('loginForm');

    if (loginForm) {

        loginForm.addEventListener('submit', (e) => {

            if (e && e.preventDefault) e.preventDefault();

            closeLoginModal();

        });

    }



    // 注册表单

    const registerForm = document.getElementById('registerForm');

    if (registerForm) {

        registerForm.addEventListener('submit', (e) => {

            if (e && e.preventDefault) e.preventDefault();

            closeLoginModal();

        });

    }



    // 订单表单

    const orderForm = document.getElementById('orderForm');

    if (orderForm) {

        orderForm.addEventListener('submit', async (e) => {

            if (e && e.preventDefault) e.preventDefault();

            const userStr = localStorage.getItem('skyUser');
            if (!userStr) {
                showNotification('请先登录', 'error');
                return;
            }

            let user = null;
            try { user = JSON.parse(userStr); } catch(err) { user = null; }
            if (!user || !user.id) {
                showNotification('请先登录', 'error');
                return;
            }

            // Read form values
            const serviceTypeEl = document.getElementById('orderServiceType');
            const serverEl = document.getElementById('orderServer');
            const hoursEl = document.getElementById('orderHours');
            const timeEl = document.getElementById('orderTime');
            const emailEl = document.getElementById('orderEmail');
            const remarkEl = document.getElementById('orderRemark');
            const totalPriceEl = document.getElementById('orderTotalPrice');

            const serviceType = serviceTypeEl ? serviceTypeEl.value.trim() : '';
            const server = serverEl ? serverEl.value.trim() : '';
            const hours = hoursEl ? (parseInt(hoursEl.value) || 1) : 1;
            const appointmentTime = timeEl ? timeEl.value.trim() : '';
            const email = emailEl ? emailEl.value.trim() : '';
            let remark = remarkEl ? remarkEl.value.trim() : '';
            if(email) {
                remark = '联系邮箱：' + email + (remark ? '\n' + remark : '');
            }

            if (!serviceType) {
                showNotification('请选择服务类型', 'error');
                return;
            }
            if (!server) {
                showNotification('请选择游戏服务器', 'error');
                return;
            }
            if (!appointmentTime) {
                showNotification('请选择预约时间', 'error');
                return;
            }

            // Recalculate final price (with coupon applied)
            calcOrderTotal();
            const totalText = totalPriceEl ? totalPriceEl.textContent.replace(/[￥\s]/g, '') : '0';
            const finalPrice = parseFloat(totalText) || 0;

            if (finalPrice <= 0) {
                showNotification('订单金额无效', 'error');
                return;
            }

            // Fetch current balance
            let profile = null;
            try {
                const { data, error } = await window.supabaseClient
                    .from('profiles')
                    .select('balance')
                    .eq('id', user.id)
                    .single();
                if (error) throw error;
                profile = data;
            } catch(err) {
                console.error('查询余额失败:', err);
                showNotification('查询余额失败，请重试', 'error');
                return;
            }

            const currentBalance = parseFloat(profile && profile.balance) || 0;
            if (currentBalance < finalPrice) {
                showNotification('余额不足，请前往充值中心充值', 'error');
                return;
            }

            // Build order data
            const couponSelect = document.getElementById('orderCouponSelect');
            const couponId = (couponSelect && couponSelect.value) || null;
            const gameType = window.currentGame === 'king' ? '王者荣耀' : '光·遇';

            const orderData = {
                wizardName: currentOrderWizardName,
                wizardId: currentOrderWizardId,
                serviceType: serviceType,
                server: server,
                hours: hours,
                appointmentTime: appointmentTime,
                remark: remark,
                email: email,
                totalPrice: finalPrice,
                couponId: couponId,
                gameType: gameType,
                boardName: user.nickname || user.username || user.email || ''
            };

            const ok = await createOrder(orderData);
            if (ok) {
                closeOrderModal();
                orderForm.reset();
                // Refresh displayed balance if header has it
                if (typeof updateUserBalanceDisplay === 'function') {
                    updateUserBalanceDisplay();
                }
            }

        });

    }



    // 点击弹窗外部关闭

    document.querySelectorAll('.modal-overlay').forEach(overlay => {

        overlay.addEventListener('click', (e) => {

            if (e.target === overlay) {

                overlay.classList.remove('active');

                document.body.style.overflow = '';

            }

        });

    });



    // --- 星星粒子效果 ---

    function createParticles() {

        const heroSection = document.querySelector('.hero-section');

        if (!heroSection) return;

        const particleContainer = document.createElement('div');

        particleContainer.className = 'particles';

        particleContainer.style.cssText = 'position:absolute;width:100%;height:100%;top:0;left:0;overflow:hidden;pointer-events:none;';

        for (let i = 0; i < 30; i++) {

            const star = document.createElement('div');

            star.style.cssText = 'position:absolute;width:' + (Math.random() * 4 + 2) + 'px;height:' + (Math.random() * 4 + 2) + 'px;background:white;border-radius:50%;left:' + (Math.random() * 100) + '%;top:' + (Math.random() * 100) + '%;opacity:' + (Math.random() * 0.7 + 0.3) + ';animation:twinkle ' + (Math.random() * 3 + 2) + 's infinite alternate;';

            particleContainer.appendChild(star);

        }

        heroSection.appendChild(particleContainer);

    }

    createParticles();



    // --- 平滑滚动到锚点 ---

    document.querySelectorAll('a[href^=\"#\"]').forEach(anchor => {

        anchor.addEventListener('click', function(e) {

            if (e && e.preventDefault) e.preventDefault();

            const target = document.querySelector(this.getAttribute('href'));

            if (target) {

                target.scrollIntoView({ behavior: 'smooth', block: 'start' });

            }

        });

    });



    // --- 当英雄区域可见时启动数字动画 ---

    const heroObserver = new IntersectionObserver((entries) => {

        entries.forEach(entry => {

            if (entry.isIntersecting) {

                animateNumbers();

            }

        });

    }, { threshold: 0.5 });

    const heroSection2 = document.querySelector('.hero-section');

    if (heroSection2) heroObserver.observe(heroSection2);



    // --- 搜索功能（预留） ---

    function searchWizards(keyword) {

        console.log('搜索陪玩师:', keyword);

    }



    // showNotification moved to global scope (see top of file)



    // --- 本地存储工具 ---

    const Storage = {

        get(key) {

            try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }

        },

        set(key, value) {

            localStorage.setItem(key, JSON.stringify(value));

        },

        remove(key) {

            localStorage.removeItem(key);

        }

    };

    window.Storage = Storage;



    // --- 移动端菜单 ---

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');

    if (mobileMenuBtn) {

        mobileMenuBtn.addEventListener('click', toggleMenu);

    }



    // --- 用户菜单 ---

        function toggleUserMenu() {
            var dropdown = document.getElementById('userDropdown');
            if (dropdown) {
                dropdown.classList.toggle('show');
            }
            // 同时关闭通知面板
            var panel = document.getElementById('notificationPanel');
            if (panel) {
                panel.style.display = 'none';
            }
        }
        window.toggleUserMenu = toggleUserMenu;

        function toggleNotification(e) {
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }
            var panel = document.getElementById('notificationPanel');
            if (panel) {
                if (panel.style.display === 'none' || panel.style.display === '') {
                    panel.style.display = 'block';
                } else {
                    panel.style.display = 'none';
                }
            }
        }
        window.toggleNotification = toggleNotification;

        async function handleLogout(e) {
            if (e && e.preventDefault) e.preventDefault();
            try { await window.supabaseClient.auth.signOut(); } catch(err) {}
            localStorage.removeItem('skyUser');
            localStorage.removeItem('skyUserList');
            var keys = Object.keys(localStorage);
            for (var i = 0; i < keys.length; i++) {
                if (keys[i].startsWith('sb-') || keys[i].indexOf('supabase') !== -1) {
                    localStorage.removeItem(keys[i]);
                }
            }
            showNotification('已退出登录', 'success');
            updateNavUser();
            var dd = document.getElementById('userDropdown');
            if (dd) dd.classList.remove('show');
            var np = document.getElementById('notificationPanel');
            if (np) np.style.display = 'none';
            setTimeout(function() { window.location.reload(); }, 500);
        }
        window.handleLogout = handleLogout;



    document.addEventListener('click', function(e) {

        var avatar = document.querySelector('.user-avatar');

        var dropdown = document.getElementById('userDropdown');

        var notifPanel = document.getElementById('notificationPanel');

        if (avatar && dropdown && !avatar.contains(e.target)) {

            dropdown.classList.remove('show');

        }

        if (notifPanel && !notifPanel.contains(e.target)) {

            notifPanel.style.display = 'none';

        }

    });



    // --- 轮播图 ---

    let currentSlide = 0;

    function goToSlide(index) {

        const track = document.querySelector('.carousel-track');

        const slides = document.querySelectorAll('.carousel-slide');

        const dots = document.querySelectorAll('.carousel-dots .dot');

        if (!slides.length || !track) return;

        currentSlide = (index + slides.length) % slides.length;

        track.style.transform = 'translateX(-' + (currentSlide * 100) + '%)';

        slides.forEach((s, i) => s.classList.toggle('active', i === currentSlide));

        dots.forEach((d, i) => d.classList.toggle('active', i === currentSlide));

    }

    function nextSlide() { goToSlide(currentSlide + 1); }

    function prevSlide() { goToSlide(currentSlide - 1); }

    // 暴露给 HTML onclick 使用
    window.nextSlide = nextSlide;
    window.prevSlide = prevSlide;
    window.goToSlide = goToSlide;

    function startInterval() { slideInterval = setInterval(nextSlide, 5000); }

    function resetInterval() { clearInterval(slideInterval); startInterval(); }

    let slideInterval;

    startInterval();

    // 初始化轮播

    goToSlide(0);



    // --- 优惠券弹窗 ---

    function closeCouponsModal() {

        var modal = document.getElementById('couponsModal');

        if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }

    }



    // 设置弹窗

    function showSettings() {

        var modal = document.getElementById('settingsModal');

        if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }

    }

    function closeSettingsModal() {

        var modal = document.getElementById('settingsModal');

        if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }

    }



    // 更新导航栏用户信息

    updateNavUser();

    // 启动账号禁用状态轮询（管理员禁用后自动退出）
    startAccountStatusPolling();

});



// 全局函数

function renderNavActions(userData) {
    var navActions = document.querySelector('.nav-actions');
    if (!navActions) return;

    // 计算基础URL路径
    var currentPath = window.location.pathname;
    var basePath = '';
    if (currentPath.indexOf('/pages/') !== -1) {
        basePath = '';
    } else {
        basePath = 'pages/';
    }

    var userName = userData.nickname || userData.username || userData.name || '用户';
    var displayName = userName.length > 6 ? userName.substring(0, 6) + '...' : userName;

    var avatarHtml = '';
    if (userData.avatar) {
        avatarHtml = '<img src="' + userData.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
    } else {
        avatarHtml = '<i class="fas fa-user-circle"></i>';
    }
    navActions.innerHTML =
        '<div class="user-avatar" onclick="toggleUserMenu()" title="' + userName + '">' +
            '<div class="nav-avatar-img" style="width:32px;height:32px;border-radius:50%;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#4facfe,#00f2fe);vertical-align:middle;margin-right:6px;">' + avatarHtml + '</div>' +
            '<span class="user-name">' + displayName + '</span>' +
        ' <a href="' + basePath + 'orders.html" class="publish-btn" title="上架我的陪玩"><i class="fas fa-plus-circle"></i></a>' +
            '<div class="user-dropdown" id="userDropdown">' +
                '<a href="' + basePath + 'profile.html" class="dropdown-item"><i class="fas fa-user"></i> 个人中心</a>' +
                '<a href="' + basePath + 'settings.html" class="dropdown-item"><i class="fas fa-cog"></i> 设置</a>' +
                '<a href="' + basePath + 'recharge.html" class="dropdown-item"><i class="fas fa-wallet"></i> 充值中心</a>' +
                '<div class="dropdown-divider"></div>' +
                '<a href="#" class="dropdown-item" onclick="toggleNotification(event)" id="notifToggle"><i class="fas fa-bell"></i> 消息通知<span class="notif-badge" id="notifBadge"></span></a>' +
                '<div class="dropdown-divider"></div>' +
                '<a href="#" class="dropdown-item logout-btn" onclick="handleLogout(event)"><i class="fas fa-sign-out-alt"></i> 退出登录</a>' +
            '</div>' +
            '<div class="notification-panel" id="notificationPanel" style="display:none;">' +
                '<div class="notif-header"><i class="fas fa-bell"></i> 消息通知</div>' +
                '<div class="notif-list"></div>' +
            '</div>' +
        '</div>';
    loadNotifications();
}

async function updateNavUser() {
    try {
        var user = localStorage.getItem('skyUser');
        var navActions = document.querySelector('.nav-actions');
        if (!navActions) return;

        if (!user) {
            var currentPath = window.location.pathname;
            var basePath = currentPath.indexOf('/pages/') !== -1 ? '' : 'pages/';
            var authUrl2 = navActions.getAttribute('data-auth-url') || basePath + 'auth.html';
            navActions.innerHTML = '<button class="btn-login" id="loginBtn">登录 / 注册</button>';
            setTimeout(function() {
                var lb = document.getElementById('loginBtn');
                if (lb) {
                    lb.addEventListener('click', function() {
                        window.location.href = authUrl2;
                    });
                }
            }, 0);
            return;
        }

        var userData = JSON.parse(user);

        // 先用 localStorage 数据立刻渲染，避免空白；当前 Supabase 读取会 401，不再异步拉取
        renderNavActions(userData);
    } catch (err) {
        console.error('[导航更新异常]', err);
    }
}


window.updateNavUser = updateNavUser;

// 强制退出登录并刷新页面（用于账号被管理员禁用后）
async function forceLogoutAndReload(message) {
    try { await window.supabaseClient.auth.signOut(); } catch(e) {}
    localStorage.removeItem('skyUser');
    localStorage.removeItem('skyUserList');
    var keys = Object.keys(localStorage);
    for (var i = 0; i < keys.length; i++) {
        if (keys[i].startsWith('sb-') || keys[i].indexOf('supabase') !== -1) {
            localStorage.removeItem(keys[i]);
        }
    }
    showNotification(message || '该账号已被禁用，请联系管理员', 'error');
    setTimeout(function() { window.location.reload(); }, 800);
}
window.forceLogoutAndReload = forceLogoutAndReload;

// 定时检查当前账号是否被禁用
function startAccountStatusPolling() {
    if (window.__accountStatusInterval) return;
    window.__accountStatusInterval = setInterval(async function() {
        var user = null;
        try {
            var userStr = localStorage.getItem('skyUser');
            if (userStr) user = JSON.parse(userStr);
        } catch(e) {}
        if (!user || !user.id) return;

        try {
            var token = getSupabaseToken();
            if (!token) return;
            var res = await fetchWithTimeout(getApiBase() + '/api/profile-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({})
            }, 8000);
            if (!res.ok) return; // 网络等原因失败时静默，下次轮询再试
            var result = await res.json();
            if (result.code === 1 && result.data && result.data.profile && result.data.profile.disabled === true) {
                clearInterval(window.__accountStatusInterval);
                await forceLogoutAndReload('该账号已被禁用，请联系管理员');
            }
        } catch(e) {
            // 网络等原因失败时静默，下次轮询再试
        }
    }, 10000); // 每 10 秒检查一次
}
window.startAccountStatusPolling = startAccountStatusPolling;



// ==================== 订单功能 ====================

async function loadOrders() {

    try {

        const userStr = localStorage.getItem('skyUser');

        if (!userStr) return [];

        const user = JSON.parse(userStr);

        

        const { data, error } = await window.supabaseClient

            .from('orders')

            .select('*')

            .eq('user_id', user.id)

            .order('created_at', { ascending: false });

        

        return data || [];

    } catch (err) {

        console.error('加载订单失败:', err);

        return [];

    }

}



async function createOrder(orderData) {

    try {

        const userStr = localStorage.getItem('skyUser');

        if (!userStr) {
            showNotification('请先登录', 'error');
            return false;
        }

        const user = JSON.parse(userStr);
        if (!user || !user.id) {
            showNotification('请先登录', 'error');
            return false;
        }

        const token = (typeof window.getSupabaseToken === 'function') ? window.getSupabaseToken() : null;
        if (!token) {
            showNotification('登录凭证已失效，请重新登录', 'error');
            return false;
        }

        const finalPrice = parseFloat(orderData.totalPrice) || 0;

        // 本地快速余额预检（仅即时反馈，最终以后端为准）
        const localBalance = parseFloat(user.balance) || 0;
        if (localBalance < finalPrice) {
            showNotification('余额不足，请前往充值中心充值', 'error');
            return false;
        }

        // 走后端代理创建订单（绕过前端 JWT iat 时钟偏差导致的 401）
        const resp = await window.fetchWithTimeout(window.getApiBase() + '/api/orders/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ orderData: orderData })
        });
        const result = await resp.json();

        if (result.code !== 1) {
            showNotification(result.error || '下单失败', 'error');
            return false;
        }

        // 同步本地余额
        const newBalance = result.balance;
        user.balance = newBalance;
        localStorage.setItem('skyUser', JSON.stringify(user));
        if (typeof updateNavUser === 'function') updateNavUser();

        showNotification('下单成功，已扣除余额 ¥' + finalPrice.toFixed(2), 'success');

        // 实时更新点单大厅按钮为「已接单」
        if (typeof window.markWizardOrdered === 'function' && orderData.wizardName) {
            window.markWizardOrdered(orderData.wizardName);
        }

        return true;

    } catch (err) {

        console.error('创建订单错误:', err);

        showNotification('下单失败，请重试', 'error');

        return false;

    }

}



// ==================== 优惠券功能 ====================

async function loadCoupons() {

    try {

        const userStr = localStorage.getItem('skyUser');

        if (!userStr) return [];

        const user = JSON.parse(userStr);

        

        const { data, error } = await window.supabaseClient

            .from('coupons')

            .select('*')

            .eq('user_id', user.id)

            .eq('used', false)

            .order('expire_date', { ascending: true });

        

        if (error) throw error;

        const cleanCoupons = await deleteExpiredCoupons(data || []);

        return cleanCoupons;

    } catch (err) {

        console.error('加载优惠券失败:', err);

        return [];

    }

}



async function grantWeeklyCoupon(userId) {

    try {

        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await window.supabaseClient

            .from('coupons')

            .insert({

                user_id: userId,

                amount: 5.00,

                condition: '满20元可用',

                expire_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],

                used: false

            });

        return !error;

    } catch (err) {

        console.error('发放优惠券失败:', err);

        return false;

    }

}



// ==================== 收藏功能 ====================

async function loadFavorites() {

    try {

        const userStr = localStorage.getItem('skyUser');

        if (!userStr) return [];

        // 优先走后端聚合接口，避免本地 file:// 打开时 Supabase REST 因 JWT iat future 401
        try {
            const token = typeof window.getSupabaseToken === 'function' ? window.getSupabaseToken() : null;
            if (token) {
                const res = await window.fetchWithTimeout(window.getApiBase() + '/api/profile-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({})
                }, 25000);
                if (res.ok) {
                    const result = await res.json();
                    if (result.code === 1 && result.data && Array.isArray(result.data.favorites)) {
                        return result.data.favorites;
                    }
                }
            }
        } catch (apiErr) {
            console.warn('[loadFavorites] api fallback:', apiErr);
        }

        // 兜底：回退 Supabase 直连
        const user = JSON.parse(userStr);
        let res = await window.supabaseClient

            .from('favorites')

            .select('*')

            .eq('user_id', user.id)

            .order('created_at', { ascending: false });

        if (res.error) {

            console.warn('[loadFavorites] 按 created_at 排序查询失败，尝试无排序查询:', res.error);

            res = await window.supabaseClient

                .from('favorites')

                .select('*')

                .eq('user_id', user.id);

        }

        

        return res.data || [];

    } catch (err) {

        console.error('加载收藏失败:', err);

        return [];

    }

}



async function addFavorite(wizardId, wizardName, skills, gameType) {

    try {

        const userStr = localStorage.getItem('skyUser');

        if (!userStr) return false;

        const user = JSON.parse(userStr);

        const isSelf = (wizardId && (wizardId === user.id || wizardId === user.nickname)) ||
            (wizardName && wizardName === user.nickname);
        if (isSelf) {
            showNotification('不能收藏自己', 'error');
            return false;
        }

        const payload = {

            user_id: user.id,

            wizard_id: wizardId,

            wizard_name: wizardName,

            created_at: new Date().toISOString()

        };

        if (skills !== undefined && skills !== null) payload.skills = skills;

        if (gameType !== undefined && gameType !== null) payload.game_type = gameType;

        const { error } = await window.supabaseClient

            .from('favorites')

            .insert(payload);

        if (error) {

            showNotification('收藏失败', 'error');

            return false;

        }

        showNotification('收藏成功！', 'success');

        return true;

    } catch (err) {

        console.error('收藏错误:', err);

        return false;

    }

}



async function removeFavorite(favoriteId) {

    try {

        const { error } = await window.supabaseClient

            .from('favorites')

            .delete()

            .eq('id', favoriteId);

        

        if (error) {

            showNotification('取消收藏失败', 'error');

            return false;

        }

        

        showNotification('已取消收藏', 'success');

        return true;

    } catch (err) {

        console.error('取消收藏错误:', err);

        return false;

    }

}



// ==================== 账户余额 ====================

async function updateBalance(amount) {

    try {

        const userStr = localStorage.getItem('skyUser');

        if (!userStr) return false;

        const user = JSON.parse(userStr);

        



        const { data: profiles, error } = await window.supabaseClient

            .from('profiles')

            .select('balance')

            .eq('id', user.id)

            .limit(1);



        const profile = profiles && profiles.length > 0 ? profiles[0] : null;

        const newBalance = (parseFloat(profile.balance) + parseFloat(amount)).toFixed(2);

        

        const { error: updateError } = await window.supabaseClient

            .from('profiles')

            .update({ balance: newBalance })

            .eq('id', user.id);

        

        if (updateError) return false;

        

        // 同步到 localStorage

        user.balance = newBalance;

        localStorage.setItem('skyUser', JSON.stringify(user));

        

        return true;

    } catch (err) {

        console.error('更新余额失败:', err);

        return false;

    }

}



// 暴露全局函数

window.loadOrders = loadOrders;

window.createOrder = createOrder;

window.loadCoupons = loadCoupons;

window.deleteExpiredCoupons = deleteExpiredCoupons;

window.grantWeeklyCoupon = grantWeeklyCoupon;

window.loadFavorites = loadFavorites;

window.addFavorite = addFavorite;

window.removeFavorite = removeFavorite;

window.updateBalance = updateBalance;



// ==================== 全局同步余额 ====================

async function syncBalanceFromDB() {

    try {

        const userStr = localStorage.getItem('skyUser');

        if (!userStr) return null;

        const user = JSON.parse(userStr);



        const userId = user && (user.id || user.user_id);
        if (!userId) return null;

        // 先拿本地缓存余额更新显示，避免请求失败时页面一直显示 0.00
        var cachedBalance = parseFloat(user.balance) || 0;
        var rechargeEl = document.getElementById('balanceValue');
        if (rechargeEl) rechargeEl.textContent = cachedBalance.toFixed(2);
        var statCards = document.querySelectorAll('.stat-card');
        if (statCards && statCards[3]) {
            var v = statCards[3].querySelector('.stat-value');
            if (v) v.textContent = '\uffe5' + cachedBalance.toFixed(2);
        }

        // 优先走后端代理 /api/profile-data，绕过 Supabase REST 的 JWT iat future 问题
        var balance = cachedBalance;
        var synced = false;
        try {
            var token = getSupabaseToken();
            if (token) {
                var res = await fetchWithTimeout(getApiBase() + '/api/profile-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({})
                }, 25000);
                if (res.ok) {
                    var result = await res.json();
                    if (result.code === 1 && result.data && result.data.profile) {
                        balance = parseFloat(result.data.profile.balance) || cachedBalance;
                        user.balance = balance;
                        localStorage.setItem('skyUser', JSON.stringify(user));
                        synced = true;
                    }
                }
            }
        } catch (err) {
            // 后端代理失败，继续走 Supabase 兜底
        }

        // 后端代理失败时不再回退 Supabase（已知会 401），直接用缓存余额
        if (!synced) {
            console.warn('[syncBalanceFromDB] 后端代理不可用，使用 localStorage 缓存余额:', balance);
        }

        // 更新充值中心余额显示
        if (rechargeEl) rechargeEl.textContent = balance.toFixed(2);

        // 更新个人中心余额显示
        if (statCards && statCards[3]) {
            var v2 = statCards[3].querySelector('.stat-value');
            if (v2) v2.textContent = '\uffe5' + balance.toFixed(2);
        }

        return balance;

    } catch (err) {
        // 外层异常也静默处理，避免控制台报错影响体验
        return null;
    }

}



window.syncBalanceFromDB = syncBalanceFromDB;


