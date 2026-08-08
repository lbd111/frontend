// ============================================
function formatVipExpire(expireAt) {
            if (!expireAt) return '';
            try {
                var d = new Date(expireAt);
                var y = d.getFullYear();
                var m = String(d.getMonth() + 1).padStart(2, '0');
                var day = String(d.getDate()).padStart(2, '0');
                return y + '-' + m + '-' + day;
            } catch(e) { return ''; }
        }
// BJ陪玩团 - 个人中心交互
// ============================================

function showCoupons() {
    const modal = document.getElementById('couponsModal');
    if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; loadCouponsList(); }
}

function closeCouponsModal() {
    const modal = document.getElementById('couponsModal');
    if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
}

function showAddress() {
    const modal = document.getElementById('ordersModal');
    if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
}

function closeOrdersModal() {
    const modal = document.getElementById('ordersModal');
    if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
}

function showWallet() { window.location.href = 'recharge.html'; }
function showSettings() { window.location.href = 'settings.html'; }

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
}

async function supabaseGet(table, filters) {
    try {
        let query = window.supabaseClient.from(table).select('*');
        if (filters && filters.length > 0) {
            filters.forEach(f => {
                // Parse filter format: "field=eq.value" or "field=neq.value" etc
                const eqIndex = f.indexOf('=eq.');
                const neqIndex = f.indexOf('=neq.');
                const gtIndex = f.indexOf('=gt.');
                const ltIndex = f.indexOf('=lt.');
                const gteIndex = f.indexOf('=gte.');
                const lteIndex = f.indexOf('=lte.');

                let key = f;
                let op = null;
                let val = null;

                if (eqIndex > 0) { key = f.substring(0, eqIndex); op = 'eq'; val = f.substring(eqIndex + 4); }
                else if (neqIndex > 0) { key = f.substring(0, neqIndex); op = 'neq'; val = f.substring(neqIndex + 6); }
                else if (gtIndex > 0) { key = f.substring(0, gtIndex); op = 'gt'; val = f.substring(gtIndex + 4); }
                else if (ltIndex > 0) { key = f.substring(0, ltIndex); op = 'lt'; val = f.substring(ltIndex + 4); }
                else if (gteIndex > 0) { key = f.substring(0, gteIndex); op = 'gte'; val = f.substring(gteIndex + 5); }
                else if (lteIndex > 0) { key = f.substring(0, lteIndex); op = 'lte'; val = f.substring(lteIndex + 5); }

                if (op && val) {
                    query = query[op](key, val);
                }
            });
        }
        var runQuery = function() { return query; };
        // 每次重试都需要一个新的 QueryBuilder，否则 await 同一个 builder 不会重新发请求
        var builderFn = function() { return window.supabaseClient.from(table).select('*'); };
        if (filters && filters.length > 0) {
            filters.forEach(function(f) {
                var eqIndex = f.indexOf('=eq.');
                var neqIndex = f.indexOf('=neq.');
                var gtIndex = f.indexOf('=gt.');
                var ltIndex = f.indexOf('=lt.');
                var gteIndex = f.indexOf('=gte.');
                var lteIndex = f.indexOf('=lte.');
                var key = f, op = null, val = null;
                if (eqIndex > 0) { key = f.substring(0, eqIndex); op = 'eq'; val = f.substring(eqIndex + 4); }
                else if (neqIndex > 0) { key = f.substring(0, neqIndex); op = 'neq'; val = f.substring(neqIndex + 6); }
                else if (gtIndex > 0) { key = f.substring(0, gtIndex); op = 'gt'; val = f.substring(gtIndex + 4); }
                else if (ltIndex > 0) { key = f.substring(0, ltIndex); op = 'lt'; val = f.substring(ltIndex + 4); }
                else if (gteIndex > 0) { key = f.substring(0, gteIndex); op = 'gte'; val = f.substring(gteIndex + 5); }
                else if (lteIndex > 0) { key = f.substring(0, lteIndex); op = 'lte'; val = f.substring(lteIndex + 5); }
                if (op && val) {
                    builderFn = (function(prevBuilder, k, o, v) {
                        return function() {
                            var q = prevBuilder();
                            return q[o](k, v);
                        };
                    })(builderFn, key, op, val);
                }
            });
        }
        var result;
        if (typeof window.withJwtRetry === 'function') {
            result = await window.withJwtRetry(builderFn);
        } else {
            result = await builderFn();
        }
        const { data, error } = result;
        if (error) {
            console.error('SUPABASE GET error:', error);
            return { data: [], error: error.message };
        }
        return { data: data || [], error: null };
    } catch (err) {
        console.error('GET error:', err);
        return { data: [], error: err.message };
    }
}

async function supabaseInsert(table, record) {
    try {
        const { data, error } = await window.supabaseClient.from(table).insert(record).select();
        if (error) {
            console.error('INSERT error:', error);
            return { error: error.message };
        }
        return { data, error: null };
    } catch (err) {
        return { error: err.message };
    }
}

// --- 加载优惠券列表 ---
// 包装 Supabase 查询，若报 "JWT issued at future" 则自动等待重试
async function spQuery(builderFn) {
    if (typeof window.withJwtRetry === 'function') {
        return await window.withJwtRetry(builderFn);
    }
    return await builderFn();
}

function getStatsCache(userId) {
    try {
        var raw = localStorage.getItem('skyStatsCache');
        if (!raw) return null;
        var cache = JSON.parse(raw);
        if (cache && cache.userId === userId) return cache;
    } catch (e) {}
    return null;
}

function setStatsCache(userId, stats) {
    try {
        localStorage.setItem('skyStatsCache', JSON.stringify(Object.assign({ userId: userId, updatedAt: Date.now() }, stats)));
    } catch (e) {}
}

async function loadCouponsList() {
    const userStr = localStorage.getItem('skyUser');
    const list = document.getElementById('dynamicCouponsList');
    if (!userStr) {
        if (list) list.innerHTML = '<div class="coupon-empty"><i class="fas fa-ticket-alt"></i><p>请先登录</p></div>';
        return;
    }
    const user = JSON.parse(userStr);

    let coupons = [];
    // 优先使用 loadProfileDataFromApi 已缓存的全量数据，避免本地 file:// 直连 Supabase 401
    if (window.__profileData && window.__profileData.coupons) {
        coupons = window.__profileData.coupons;
    } else {
        // 兜底：尝试调一次后端 /api/profile-data（带超时）
        try {
            const token = getSupabaseToken();
            if (token) {
                const res = await fetchWithTimeout(getApiBase() + '/api/profile-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({})
                }, 8000);
                const result = await res.json();
                if (result.code === 1 && result.data && result.data.coupons) {
                    coupons = result.data.coupons;
                    window.__profileData = result.data;
                }
            }
        } catch (e) {
            console.warn('[loadCouponsList] 后端取优惠券失败:', e);
        }
    }

    if (!list) return;

    const cleanCoupons = typeof deleteExpiredCoupons === 'function'
        ? await deleteExpiredCoupons(coupons || [])
        : (coupons || []);

    if (!cleanCoupons || cleanCoupons.length === 0) {
        list.innerHTML = '<div class="coupon-empty"><i class="fas fa-ticket-alt"></i><p>暂无优惠券</p></div>';
        return;
    }

    let html = '';
    cleanCoupons.forEach(c => {
        const amount = parseFloat(c.amount) || 0;
        const condition = c.condition || '';
        const expireDate = c.expire_date || '长期有效';
        const used = c.used || false;
        const statusClass = used ? 'used' : 'active';
        const statusText = used ? '已使用' : '未使用';
        const isPercent = c.type === 'percent';
        const amountHtml = isPercent
            ? '<div class="coupon-amount">' + Math.round((1 - amount) * 100) + '折</div>'
            : '<div class="coupon-amount">￥' + amount.toFixed(2) + '</div>';
        html += '<div class="coupon-item ' + statusClass + '">' +
            '<div class="coupon-left">' +
            amountHtml +
            '<div class="coupon-condition">' + condition + '</div>' +
            '</div>' +
            '<div class="coupon-right">' +
            '<div class="coupon-status ' + statusClass + '">' + statusText + '</div>' +
            '<div class="coupon-expire">到期：' + expireDate + '</div>' +
            '</div>' +
            '</div>';
    });
    list.innerHTML = html;
}

async function loadUserProfile(prefetchedProfile, useCacheOnly) {
    try {
        const userStr = localStorage.getItem('skyUser');
        let user = null;
        if (userStr) { try { user = JSON.parse(userStr); } catch(e) { user = null; } }
        if (!userStr || !user || !user.id) {
            // Not logged in - show guest state
            const nameEl = document.getElementById('userName');
            if (nameEl) nameEl.textContent = '游客';
            const uidEl = document.querySelector('.user-id');
            if (uidEl) uidEl.innerHTML = '<i class="fas fa-id-badge"></i> 请先登录后查看';
            const skyIdEl = document.getElementById('skyIdValue');
            if (skyIdEl) skyIdEl.textContent = '未设置';
            const levelEl = document.getElementById('levelValue');
            if (levelEl) levelEl.textContent = '未登录';
            const regEl = document.getElementById('regTimeValue');
            if (regEl) regEl.textContent = '--';
            const vipEl = document.getElementById('metaVipExpire');
            if (vipEl) vipEl.style.display = 'inline';
            const vipExpireEl = document.getElementById('vipExpireValue');
            if (vipExpireEl) vipExpireEl.textContent = '--';
            const wMeta = document.getElementById('metaWangzheId');
            if (wMeta) wMeta.style.display = 'inline';
                        // Guest identity
            const roleEl = document.getElementById('roleIdDisplay');
            if (roleEl) {
                roleEl.innerHTML = '<i class="fas fa-user"></i> 身份：<span>请先登录</span>';
            }
const wEl = document.getElementById('wangzheIdValue');
            if (wEl) wEl.textContent = '未设置';
            return;
        }
        console.log('加载用户数据:', user);

        let profile = prefetchedProfile || null;
        // 本地 file:// 因 Supabase JWT iat 时间校验会 401，个人中心资料统一由后端 /api/profile-data 提供。
        // 若未传入 profile 且允许请求，不再直连 Supabase，而是交给调用方（loadProfileDataFromApi）去后端获取。
        if (!profile && !useCacheOnly) {
            console.warn('[loadUserProfile] 未提供 profile 且非缓存模式，但为避免 401 不再直连 Supabase，稍后由 loadProfileDataFromApi 重试');
            return false;
        }

        if (profile) {
            console.log('Profile data:', profile);

            var displayName = profile.nickname || user.email.split('@')[0] || (user.username || '玩家');
            const avatarUrl = profile.avatar_url || '';

            // 更新昵称
            const nameEl = document.getElementById('userName');
            if (nameEl) nameEl.textContent = displayName;

            // 更新头像
            var avatarContainer = document.querySelector('.avatar-inner');
            if (avatarContainer && avatarUrl) {
                avatarContainer.innerHTML = '<img src="' + avatarUrl + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
            } else if (avatarContainer && user.avatar) {
                avatarContainer.innerHTML = '<img src="' + user.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
            }

            const skyIdEl = document.getElementById('skyIdValue');
            if (skyIdEl) skyIdEl.textContent = profile.sky_id || '未设置';
            var wMeta1 = document.getElementById('metaWangzheId'); var wEl1 = document.getElementById('wangzheIdValue'); if (wMeta1 && wEl1) { wMeta1.style.display = 'inline'; wEl1.textContent = profile.wangzhe_id || '未设置'; }
            const levelEl = document.getElementById('levelValue');
            if (levelEl) levelEl.textContent = profile.level || '普通会员';

            const expireAt = profile.vip_expire_at || user.vip_expire_at;
            var vipExpireMeta = document.getElementById('metaVipExpire');
            if (vipExpireMeta) {
                if (expireAt && (profile.level && profile.level.includes('VIP'))) {
                    var expireEl = document.getElementById('vipExpireValue');
                    if (expireEl) expireEl.textContent = formatVipExpire(expireAt);
                    vipExpireMeta.style.display = 'inline';
                } else if (expireAt) {
                    var expireEl2 = document.getElementById('vipExpireValue');
                    if (expireEl2) expireEl2.textContent = formatVipExpire(expireAt);
                    vipExpireMeta.style.display = 'inline';
                } else {
                    vipExpireMeta.style.display = 'inline';
                    var expireEl3 = document.getElementById('vipExpireValue');
                    if (expireEl3) expireEl3.textContent = '--';
                }
            }
            const serverEl = document.getElementById('serverValue');
            if (serverEl && profile.server) {
                const labels = { ios: 'iOS', android: 'Android', pc: '渠道服' };
                serverEl.textContent = labels[profile.server] || profile.server;
            }

            const regTimeEl = document.getElementById('regTimeValue');
            if (regTimeEl) {
                regTimeEl.textContent = profile.created_at ? new Date(profile.created_at).toLocaleDateString('zh-CN') : '--';
            }
            // Display rating
            const ratingEl = document.getElementById('ratingValue');
            const metaRating = document.getElementById('metaRating');
            if (ratingEl && metaRating) {
                const rating = profile.rating;
                if (rating !== null && rating !== undefined && rating !== '') {
                    ratingEl.textContent = rating;
                    metaRating.style.display = 'inline';
                } else {
                    ratingEl.textContent = '暂无评分';
                    metaRating.style.display = 'inline';
                }
            }

            user.server = profile.server;
            user.sky_id = profile.sky_id || '';
            user.wangzhe_id = profile.wangzhe_id || '';
            user.wz_server = profile.wz_server || '';
            user.username = profile.nickname || displayName;
            if (profile.nickname) user.nickname = profile.nickname;
            if(profile.avatar_url) user.avatar = profile.avatar_url;
            if (profile.role) user.role = profile.role;
            localStorage.setItem('skyUser', JSON.stringify(user));

            // 同步刷新顶部导航栏头像/昵称
            if (typeof window.updateNavUser === 'function') {
                window.updateNavUser();
            }

            // Show role from profile data
            const roleEl = document.getElementById('roleIdDisplay');
            if (roleEl) {
                var roleIcon = user.role === '\u966a\u966a' ? 'fa-shield-halved' : 'fa-user';
                var roleColor = user.role === '\u966a\u966a' ? 'var(--accent)' : 'var(--text-secondary)';
                roleEl.innerHTML = '<i class="fas ' + roleIcon + '"></i> \u8eab\u4efd\uff1a<span style="color:' + roleColor + ';font-weight:600;">' + (profile.role || user.role || '\u677f\u677f') + '</span>';
            }
} else {
            console.log('No profile found, using localStorage data');
            const nameEl = document.getElementById('userName');
            const displayName = user.email ? user.email.split('@')[0] : (user.username || '玩家');
            if (nameEl) nameEl.textContent = displayName;
            const skyIdEl2 = document.getElementById('skyIdValue');
            if (skyIdEl2) skyIdEl2.textContent = user.sky_id || '未设置';
            var wMeta2 = document.getElementById('metaWangzheId'); var wEl2 = document.getElementById('wangzheIdValue'); if (wMeta2 && wEl2) { wMeta2.style.display = 'inline'; wEl2.textContent = user.wangzhe_id || '未设置'; }
            const levelEl = document.getElementById('levelValue');
            if (levelEl) levelEl.textContent = user.level || '普通会员';
            var expireAt2 = user.vip_expire_at;
            if (expireAt2 && user.level && user.level.includes('VIP')) {
                var expireEl2 = document.getElementById('vipExpireValue');
                if (expireEl2) expireEl2.textContent = formatVipExpire(expireAt2);
                expireEl2.parentElement.style.display = 'inline';
            }
            const regTimeEl = document.getElementById('regTimeValue');
            if (regTimeEl) {
                regTimeEl.textContent = user.register_time ? new Date(user.register_time).toLocaleString('zh-CN').replace(/\//g, '-') : new Date().toLocaleDateString('zh-CN');
            }
            // Display rating from localStorage
            const ratingEl2 = document.getElementById('ratingValue');
            const metaRating2 = document.getElementById('metaRating');
            if (ratingEl2 && metaRating2) {
                const rating = user.rating || '';
                if (rating && String(rating).trim() !== '') {
                    ratingEl2.textContent = rating;
                    metaRating2.style.display = 'inline';
                } else {
                    ratingEl2.textContent = '暂无评分';
                    metaRating2.style.display = 'inline';
                }
            }
            // Also display avatar from localStorage if no profile avatar
            
            // Show role (banban/peipei)
            const roleEl = document.getElementById('roleIdDisplay');
            if (roleEl) {
                var roleIcon = user.role === '陪陪' ? 'fa-shield-halved' : 'fa-user';
                var roleColor = user.role === '陪陪' ? 'var(--accent)' : 'var(--text-secondary)';
                roleEl.innerHTML = '<i class="fas ' + roleIcon + '"></i> 身份：<span style="color:' + roleColor + ';font-weight:600;">' + (user.role || '\u677f\u677f') + '</span>';
            }
const avatarContainer = document.querySelector('.avatar-inner');
            if (avatarContainer && user.avatar) {
                avatarContainer.innerHTML = '<img src="' + user.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
            }
        }
        console.log('用户信息加载完成');
    } catch (err) {
        console.error('[加载用户信息失败]', err);
        // 异常兜底：至少用 localStorage 把昵称、余额等显示出来，避免页面一直「加载中」
        try {
            const userStr = localStorage.getItem('skyUser');
            if (userStr) {
                const user = JSON.parse(userStr);
                const nameEl = document.getElementById('userName');
                const displayName = user.nickname || user.username || (user.email ? user.email.split('@')[0] : '玩家');
                if (nameEl) nameEl.textContent = displayName;
                const skyIdEl = document.getElementById('skyIdValue');
                if (skyIdEl) skyIdEl.textContent = user.sky_id || '未设置';
                var wMeta = document.getElementById('metaWangzheId');
                var wEl = document.getElementById('wangzheIdValue');
                if (wMeta && wEl) { wMeta.style.display = 'inline'; wEl.textContent = user.wangzhe_id || '未设置'; }
                const levelEl = document.getElementById('levelValue');
                if (levelEl) levelEl.textContent = user.level || '普通会员';
                const roleEl = document.getElementById('roleIdDisplay');
                if (roleEl) {
                    var roleIcon = user.role === '陪陪' ? 'fa-shield-halved' : 'fa-user';
                    var roleColor = user.role === '陪陪' ? 'var(--accent)' : 'var(--text-secondary)';
                    roleEl.innerHTML = '<i class="fas ' + roleIcon + '"></i> 身份：<span style="color:' + roleColor + ';font-weight:600;">' + (user.role || '板板') + '</span>';
                }
                const avatarContainer = document.querySelector('.avatar-inner');
                if (avatarContainer && user.avatar) {
                    avatarContainer.innerHTML = '<img src="' + user.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
                }
            }
        } catch(e) {}
    }
}

// 后端代理统一使用 HTTPS 域名（优先用 main.js 已挂载的全局函数）
function getApiBase() {
    if (typeof window.getApiBase === 'function' && window.getApiBase !== getApiBase) {
        return window.getApiBase();
    }
    if (typeof window.API_BASE !== 'undefined') return window.API_BASE;
    return 'https://api.skypw.dpdns.org';
}

// fetch 超时包装（优先用 main.js 已挂载的全局函数）
async function fetchWithTimeout(url, options, timeoutMs) {
    if (typeof window.fetchWithTimeout === 'function' && window.fetchWithTimeout !== fetchWithTimeout) {
        return await window.fetchWithTimeout(url, options, timeoutMs);
    }
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

// 获取当前用户的 Supabase access_token（优先用 main.js 已挂载的全局函数）
function getSupabaseToken() {
    if (typeof window.getSupabaseToken === 'function' && window.getSupabaseToken !== getSupabaseToken) {
        return window.getSupabaseToken();
    }
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

// 通过后端 /api/profile-data 一次性获取个人中心数据，绕过 Supabase REST 的 JWT iat 时间校验
async function loadProfileDataFromApi() {
    try {
        const userStr = localStorage.getItem('skyUser');
        if (!userStr) {
            console.warn('[loadProfileDataFromApi] 无 skyUser，跳过后端代理');
            return false;
        }
        let user = null;
        try { user = JSON.parse(userStr); } catch(e) { return false; }
        if (!user || !user.id) return false;

        var token = getSupabaseToken();
        if (!token) {
            console.warn('[loadProfileDataFromApi] 未获取到 access_token，回退 Supabase');
            return false;
        }

        var apiBase = getApiBase();
        var url = apiBase + '/api/profile-data';
        console.log('[loadProfileDataFromApi] 请求后端:', url);
        const res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({})
        }, 25000);

        if (res.status === 204) {
            console.warn('[loadProfileDataFromApi] 后端返回 204 No Content，可能 Nginx/Cloudflare 拦截');
            return false;
        }
        var result;
        try {
            result = await res.json();
        } catch(parseErr) {
            console.warn('[loadProfileDataFromApi] 响应不是 JSON，status=' + res.status);
            return false;
        }
        if (!res.ok || result.code !== 1) {
            console.warn('[loadProfileDataFromApi] 后端返回异常:', res.status, result);
            return false;
        }

        console.log('[loadProfileDataFromApi] 后端数据已返回');
        window.__profileData = result.data || null;
        await loadUserProfile(result.data.profile || null);
        await loadStats(result.data || null);
        // 触发个人中心其他依赖数据的渲染（最近订单、优惠券等）
        try {
            if (typeof window.loadRecentOrders === 'function') {
                window.loadRecentOrders(result.data || null);
            }
        } catch (e) { console.warn('[loadProfileDataFromApi] 触发最近订单渲染失败:', e); }
        try {
            if (typeof window.loadCouponsList === 'function') {
                // 优惠券弹窗未打开时也预渲染一次空列表到容器，避免打开时重复请求
                const list = document.getElementById('dynamicCouponsList');
                if (list && list.querySelector('.coupon-empty') && list.textContent.indexOf('加载中') > -1) {
                    window.loadCouponsList();
                }
            }
        } catch (e) { console.warn('[loadProfileDataFromApi] 触发优惠券渲染失败:', e); }
        return true;
    } catch (err) {
        console.error('[loadProfileDataFromApi] 调用后端失败:', err);
        return false;
    }
}

async function loadStats(prefetchedData, useCacheOnly) {
    try {
        const userStr = localStorage.getItem('skyUser');
        let user = null;
        if (userStr) { try { user = JSON.parse(userStr); } catch(e) { user = null; } }
        if (!userStr || !user || !user.id) {
            // Not logged in - show guest state
            const nameEl = document.getElementById('userName');
            if (nameEl) nameEl.textContent = '游客';
            const uidEl = document.querySelector('.user-id');
            if (uidEl) uidEl.innerHTML = '<i class="fas fa-id-badge"></i> 请先登录后查看';
            const skyIdEl = document.getElementById('skyIdValue');
            if (skyIdEl) skyIdEl.textContent = '未设置';
            const levelEl = document.getElementById('levelValue');
            if (levelEl) levelEl.textContent = '未登录';
            const regEl = document.getElementById('regTimeValue');
            if (regEl) regEl.textContent = '--';
            const vipEl = document.getElementById('metaVipExpire');
            if (vipEl) vipEl.style.display = 'inline';
            const vipExpireEl = document.getElementById('vipExpireValue');
            if (vipExpireEl) vipExpireEl.textContent = '--';
            const wMeta = document.getElementById('metaWangzheId');
            if (wMeta) wMeta.style.display = 'inline';
            const wEl = document.getElementById('wangzheIdValue');
            if (wEl) wEl.textContent = '未设置';
            return;
        }

        // 读取上次成功缓存的统计，作为本次同步失败时的兜底
        const cache = getStatsCache(user.id);

        // 纯缓存模式：直接用 skyStatsCache / skyUser 渲染，不发任何请求
        if (useCacheOnly) {
            const ordersCount = cache ? cache.ordersCount : 0;
            const couponsCount = cache ? cache.couponsCount : 0;
            const favoritesCount = cache ? cache.favoritesCount : 0;
            const balance = parseFloat(cache && cache.balance) || parseFloat(user.balance) || 0;

            const orderEl = document.getElementById('profileOrderCount');
            if (orderEl) orderEl.textContent = ordersCount || 0;
            const favEl = document.getElementById('profileFavoriteCount');
            if (favEl) favEl.textContent = favoritesCount || 0;
            const couponEl = document.getElementById('profileCouponCount');
            if (couponEl) couponEl.textContent = couponsCount || 0;
            const balanceEl = document.getElementById('profileBalanceValue');
            if (balanceEl) balanceEl.textContent = '\uFFE5' + balance.toFixed(2);

            console.log('[loadStats] 缓存模式渲染:', { ordersCount, couponsCount, favoritesCount, balance });
            return;
        }

        let profileRes, ordersRes, wizardOrdersRes, myRequestPostsRes, myRequestAcceptsRes, myDispatchPostsRes, myDispatchAcceptsRes, teamMemberRes, couponsRes, favoritesRes, teamDispatchRes;
        if (prefetchedData) {
            profileRes = { data: prefetchedData.profile || null };
            ordersRes = { data: prefetchedData.orders || [] };
            wizardOrdersRes = { data: prefetchedData.wizardOrders || [] };
            myRequestPostsRes = { data: prefetchedData.myRequestPosts || [] };
            myRequestAcceptsRes = { data: prefetchedData.myRequestAccepts || [] };
            myDispatchPostsRes = { data: prefetchedData.myDispatchPosts || [] };
            myDispatchAcceptsRes = { data: prefetchedData.myDispatchAccepts || [] };
            teamMemberRes = { data: (prefetchedData.teamDispatchOrders || []).map(d => ({ dispatch_order_id: d.id })) };
            couponsRes = { data: prefetchedData.coupons || [] };
            favoritesRes = { data: prefetchedData.favorites || [] };
            teamDispatchRes = { data: prefetchedData.teamDispatchOrders || [] };
        } else {
            // 本地 file:// 因 Supabase JWT iat 时间校验会 401，
            // 统计数量统一由后端 /api/profile-data 提供；若未预取则直接用本地缓存渲染，不再直连 Supabase。
            console.warn('[loadStats] 未预取数据，不再直连 Supabase，使用本地缓存兜底');
            const cache = getStatsCache(user.id);
            const ordersCount = cache ? cache.ordersCount : 0;
            const couponsCount = cache ? cache.couponsCount : 0;
            const favoritesCount = cache ? cache.favoritesCount : 0;
            const balance = parseFloat(cache && cache.balance) || parseFloat(user.balance) || 0;

            const orderEl = document.getElementById('profileOrderCount');
            if (orderEl) orderEl.textContent = ordersCount || 0;
            const favEl = document.getElementById('profileFavoriteCount');
            if (favEl) favEl.textContent = favoritesCount || 0;
            const couponEl = document.getElementById('profileCouponCount');
            if (couponEl) couponEl.textContent = couponsCount || 0;
            const balanceEl = document.getElementById('profileBalanceValue');
            if (balanceEl) balanceEl.textContent = '\uFFE5' + balance.toFixed(2);

            console.log('[loadStats] 无预取数据，缓存模式渲染:', { ordersCount, couponsCount, favoritesCount, balance });
            return;
        }

        // 任一查询出错（如 401/JWT future），就用缓存兜底，避免页面全变 0
        const hasError = !!(profileRes.error || ordersRes.error || wizardOrdersRes.error ||
            myRequestPostsRes.error || myRequestAcceptsRes.error || myDispatchPostsRes.error ||
            myDispatchAcceptsRes.error || teamMemberRes.error || couponsRes.error || favoritesRes.error);

        const profile = profileRes.data || {};
        const nickname = profile.nickname || user.nickname || '';

        // 通过 dispatch_team_members 查找我加入的组队派单
        const teamDispatchIds = (teamMemberRes.data || []).map(m => m.dispatch_order_id).filter(Boolean);
        if (!prefetchedData && teamDispatchIds.length > 0) {
            try {
                teamDispatchRes = await spQuery(() => window.supabaseClient.from('dispatch_orders').select('*').in('id', teamDispatchIds));
            } catch(e) { teamDispatchRes = { data: [] }; }
        }

        // 合并所有「我的订单」并去重（按原表标识）
        const seen = {};
        const seenSourceIds = {};
        const allOrders = [];
        function addOrder(item, role, sourceTable, sourceId) {
            // 按原始表+原始id去重：手动录入的接单会同时命中 user_id 与 accepted_by，优先归为「我接的单」
            const srcKey = (sourceTable || role) + '_' + (sourceId || item.id || item.uuid);
            if (seenSourceIds[srcKey]) return;
            seenSourceIds[srcKey] = true;
            const key = role + '_' + (item.id || item.uuid);
            if (seen[key]) return;
            seen[key] = true;
            item.order_role = role;
            allOrders.push(item);
        }
        (ordersRes.data || []).forEach(o => addOrder(o, 'board'));
        (wizardOrdersRes.data || []).forEach(o => addOrder(o, 'wizard'));
        // order_requests 统一视为「我接的单」
        (myRequestAcceptsRes.data || []).forEach(r => addOrder({...r, id: 'req_' + r.id}, 'wizard', 'order_requests', r.id));
        (myRequestPostsRes.data || []).forEach(r => addOrder({...r, id: 'req_post_' + r.id}, 'wizard', 'order_requests', r.id));
        (myDispatchAcceptsRes.data || []).forEach(d => addOrder({...d, id: 'disp_' + d.id}, 'wizard', 'dispatch_orders', d.id));
        (myDispatchPostsRes.data || []).forEach(d => addOrder({...d, id: 'disp_post_' + d.id}, 'dispatch', 'dispatch_orders', d.id));
        (teamDispatchRes.data || []).forEach(d => addOrder({...d, id: 'disp_' + d.id}, 'wizard', 'dispatch_orders', d.id));

        // 同步失败时用本地缓存兜底；余额优先用刚读到的 DB 值，其次 localStorage，再次缓存
        let ordersCount = allOrders.length;
        let couponsCount = (couponsRes.data || []).length;
        let favoritesCount = (favoritesRes.data || []).length;
        let balance = parseFloat(profile.balance) || 0;

        if (hasError) {
            // 任一查询出错（401/JWT future）时，完全用缓存数据兜底，不用 Supabase 返回的空数据覆盖页面
            if (cache) {
                ordersCount = cache.ordersCount || 0;
                couponsCount = cache.couponsCount || 0;
                favoritesCount = cache.favoritesCount || 0;
                balance = parseFloat(cache.balance) || 0;
                console.warn('[loadStats] Supabase 同步异常，使用本地缓存兜底:', cache);
            } else {
                // 没有缓存时，至少把 localStorage 里已有的余额显示出来
                balance = parseFloat(user.balance) || 0;
                console.warn('[loadStats] Supabase 同步异常且暂无缓存，使用 localStorage 余额兜底');
            }
        }

        // 同步余额与昵称到 localStorage
        user.balance = balance;
        if (profile.nickname) { user.nickname = profile.nickname; user.username = profile.nickname; }
        localStorage.setItem('skyUser', JSON.stringify(user));

        const orderEl = document.getElementById('profileOrderCount');
        if (orderEl) orderEl.textContent = ordersCount;
        const favEl = document.getElementById('profileFavoriteCount');
        if (favEl) favEl.textContent = favoritesCount;
        const couponEl = document.getElementById('profileCouponCount');
        if (couponEl) couponEl.textContent = couponsCount;
        const balanceEl = document.getElementById('profileBalanceValue');
        if (balanceEl) balanceEl.textContent = '\uFFE5' + balance.toFixed(2);

        // 缓存成功统计，供下次同步失败时使用
        setStatsCache(user.id, { ordersCount, couponsCount, favoritesCount, balance });

        console.log('统计数据加载完成:', { ordersCount, couponsCount, favoritesCount, balance, hasError });
    } catch (err) {
        console.error('加载统计失败:', err);
        // 函数级异常兜底：尝试用缓存刷新显示，避免一片空白
        try {
            const userStr = localStorage.getItem('skyUser');
            if (userStr) {
                const user = JSON.parse(userStr);
                const cache = user.id ? getStatsCache(user.id) : null;
                if (cache) {
                    const orderEl = document.getElementById('profileOrderCount');
                    if (orderEl) orderEl.textContent = cache.ordersCount || 0;
                    const favEl = document.getElementById('profileFavoriteCount');
                    if (favEl) favEl.textContent = cache.favoritesCount || 0;
                    const couponEl = document.getElementById('profileCouponCount');
                    if (couponEl) couponEl.textContent = cache.couponsCount || 0;
                    const balanceEl = document.getElementById('profileBalanceValue');
                    if (balanceEl) balanceEl.textContent = '\uFFE5' + ((cache.balance || parseFloat(user.balance) || 0).toFixed(2));
                }
            }
        } catch(e) {}
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const ok = await loadProfileDataFromApi();
    if (!ok) {
        // 后端代理失败时不再回退 Supabase（已知会 401），直接用本地缓存渲染
        console.log('[profile] 后端接口未就绪，使用本地缓存渲染');
        await loadUserProfile(null, true);
        await loadStats(null, true);
    }

    document.querySelectorAll('.orders-modal .tabs .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.orders-modal .tabs .tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });
});
