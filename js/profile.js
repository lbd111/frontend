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

function showMyOrders() {
    const modal = document.getElementById('ordersModal');
    if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
}

function showCoupons() {
    const modal = document.getElementById('couponsModal');
    if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; loadCouponsList(); }
}

function closeCouponsModal() {
    const modal = document.getElementById('couponsModal');
    if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
}

function showAddress() {
    const modal = document.getElementById('serverModal');
    if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
}

function closeServerModal() {
    const modal = document.getElementById('serverModal');
    if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
}

function selectServer(server) {
    const labels = { ios: 'iOS', android: 'Android', pc: 'PC模拟器' };
    const el = document.getElementById('serverValue');
    if (el) el.textContent = labels[server] || server;
    const user = JSON.parse(localStorage.getItem('skyUser') || '{}');
    user.server = server;
    localStorage.setItem('skyUser', JSON.stringify(user));
    closeServerModal();
    showNotification('服务器已设置为: ' + labels[server], 'success');
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
        const { data, error } = await query;
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
async function loadCouponsList() {
    const userStr = localStorage.getItem('skyUser');
    if (!userStr) {
        const list = document.getElementById('dynamicCouponsList');
        if (list) list.innerHTML = '<div class="coupon-empty"><i class="fas fa-ticket-alt"></i><p>请先登录</p></div>';
        return;
    }
    const user = JSON.parse(userStr);

    const { data: coupons, error } = await window.supabaseClient
        .from('coupons')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    const list = document.getElementById('dynamicCouponsList');
    if (!list) return;

    if (error || !coupons || coupons.length === 0) {
        list.innerHTML = '<div class="coupon-empty"><i class="fas fa-ticket-alt"></i><p>暂无优惠券</p></div>';
        return;
    }

    let html = '';
    coupons.forEach(c => {
        const amount = c.amount || 0;
        const condition = c.condition || '';
        const expireDate = c.expire_date || '长期有效';
        const used = c.used || false;
        const statusClass = used ? 'used' : 'active';
        const statusText = used ? '已使用' : '未使用';
        html += '<div class="coupon-item ' + statusClass + '">' +
            '<div class="coupon-left">' +
            '<div class="coupon-amount">￥' + amount.toFixed(2) + '</div>' +
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

async function loadUserProfile() {
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

        const filters = ['id=eq.' + user.id];
        const result = await supabaseGet('profiles', filters);
        console.log('Profile result:', result);
        
        if (result.data && result.data.length > 0) {
            const profile = result.data[0];
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
                const labels = { ios: 'iOS', android: 'Android', pc: 'PC模拟器' };
                serverEl.textContent = labels[profile.server] || profile.server;
            }

            const regTimeEl = document.getElementById('regTimeValue');
            if (regTimeEl) {
                regTimeEl.textContent = profile.created_at ? new Date(profile.created_at).toLocaleDateString('zh-CN') : '--';
            }

            user.server = profile.server;
            user.username = profile.nickname || displayName;
            if(profile.avatar_url) user.avatar = profile.avatar_url;
            localStorage.setItem('skyUser', JSON.stringify(user));
        
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
    }
}

async function loadStats() {
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

        const orders = await supabaseGet('orders', ['user_id=eq.' + user.id]);
        const ordersCount = orders.data ? orders.data.length : 0;

        const coupons = await supabaseGet('coupons', ['user_id=eq.' + user.id, 'used=eq.false']);
        const couponsCount = coupons.data ? coupons.data.length : 0;

        const favorites = await supabaseGet('favorites', ['user_id=eq.' + user.id]);
        const favoritesCount = favorites.data ? favorites.data.length : 0;

        const balance = await syncBalanceFromDB();

        const statCards = document.querySelectorAll('.stat-card');
        if (statCards[0]) { const v = statCards[0].querySelector('.stat-value'); if (v) v.textContent = ordersCount; }
        if (statCards[1]) { const v = statCards[1].querySelector('.stat-value'); if (v) v.textContent = favoritesCount; }
        if (statCards[2]) { const v = statCards[2].querySelector('.stat-value'); if (v) v.textContent = couponsCount; }
        if (statCards[3]) { const v = statCards[3].querySelector('.stat-value'); if (v) v.textContent = '\uFFE5' + (balance || 0).toFixed(2); }

        console.log('统计数据加载完成');
    } catch (err) {
        console.error('加载统计失败:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadUserProfile();
    loadStats();

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
