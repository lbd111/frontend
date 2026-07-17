// ============================================
// 光遇陪玩团 - 个人中心交互
// ============================================

function showMyOrders() {
    const modal = document.getElementById('ordersModal');
    if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
}

function showCoupons() {
    const modal = document.getElementById('couponsModal');
    if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
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
    const session = await window.supabaseClient.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return { data: [], error: 'No token' };
    
    let url = window.SUPABASE_URL + '/rest/v1/' + table;
    if (filters && filters.length > 0) {
        url += '?' + filters.join('&');
    }
    url += '&select=*';
    
    const headers = {
        'apikey': window.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + token,
            };
    
    try {
        const response = await fetch(url, { method: 'GET', headers });
        if (!response.ok) {
            console.error('GET failed:', response.status, url);
            return { data: [], error: response.statusText };
        }
        const data = await response.json();
        return { data, error: null };
    } catch (err) {
        console.error('GET error:', err);
        return { data: [], error: err.message };
    }
}

async function supabaseInsert(table, record) {
    const session = await window.supabaseClient.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return { error: 'No token' };
    
    const url = window.SUPABASE_URL + '/rest/v1/' + table + '?select=*';
    const headers = {
        'apikey': window.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
            };
    
    try {
        const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(record) });
        if (!response.ok) {
            const errText = await response.text();
            console.error('INSERT failed:', response.status, errText);
            return { error: errText };
        }
        const data = await response.json();
        return { data, error: null };
    } catch (err) {
        return { error: err.message };
    }
}

async function loadUserProfile() {
    try {
        const userStr = localStorage.getItem('skyUser');
        if (!userStr) return;
        const user = JSON.parse(userStr);
        console.log('加载用户数据:', user);

        const filters = ['id=eq.' + user.id];
        const result = await supabaseGet('profiles', filters);
        console.log('Profile result:', result);
        
        if (result.data && result.data.length > 0) {
            const profile = result.data[0];
            console.log('Profile data:', profile);

            // 默认使用邮箱前缀作为用户名
            const displayName = user.email ? user.email.split('@')[0] : (user.username || '玩家');

            const nameEl = document.getElementById('userName');
            if (nameEl) nameEl.textContent = displayName;

            const gameIdEl = document.getElementById('gameIdValue');
            if (gameIdEl) gameIdEl.textContent = profile.game_id || '未设置';

            const levelEl = document.getElementById('levelValue');
            if (levelEl) levelEl.textContent = profile.level || '普通会员';

            const serverEl = document.getElementById('serverValue');
            if (serverEl && profile.server) {
                const labels = { ios: 'iOS', android: 'Android', pc: 'PC模拟器' };
                serverEl.textContent = labels[profile.server] || profile.server;
            }

            const regTimeEl = document.getElementById('regTimeValue');
            if (regTimeEl) {
                regTimeEl.textContent = profile.created_at ? new Date(profile.created_at).toLocaleDateString('zh-CN') : '--';
            }

            // 同步服务器信息到 localStorage
            user.server = profile.server;
            localStorage.setItem('skyUser', JSON.stringify(user));
        } else {
            console.log('No profile found, using localStorage data');
            const nameEl = document.getElementById('userName');
            const displayName = user.email ? user.email.split('@')[0] : (user.username || '玩家');
            if (nameEl) nameEl.textContent = displayName;
            const gameIdEl = document.getElementById('gameIdValue');
            if (gameIdEl) gameIdEl.textContent = user.game_id || '未设置';
            const levelEl = document.getElementById('levelValue');
            if (levelEl) levelEl.textContent = user.level || '普通会员';
            const regTimeEl = document.getElementById('regTimeValue');
            if (regTimeEl) {
                regTimeEl.textContent = user.register_time ? new Date(user.register_time).toLocaleString('zh-CN').replace(/\//g, '-') : new Date().toLocaleDateString('zh-CN');
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
        if (!userStr) return;
        const user = JSON.parse(userStr);

        const orders = await supabaseGet('orders', ['user_id=eq.' + user.id]);
        const ordersCount = orders.data ? orders.data.length : 0;

        const coupons = await supabaseGet('coupons', ['user_id=eq.' + user.id, 'used=eq.false']);
        const couponsCount = coupons.data ? coupons.data.length : 0;

        const favorites = await supabaseGet('favorites', ['user_id=eq.' + user.id]);
        const favoritesCount = favorites.data ? favorites.data.length : 0;

        // 余额统一通过 syncBalanceFromDB 加载，确保数据源一致
        const balance = await syncBalanceFromDB();

        const statCards = document.querySelectorAll('.stat-card');
        if (statCards[0]) { const v = statCards[0].querySelector('.stat-value'); if (v) v.textContent = ordersCount; }
        if (statCards[1]) { const v = statCards[1].querySelector('.stat-value'); if (v) v.textContent = favoritesCount; }
        if (statCards[2]) { const v = statCards[2].querySelector('.stat-value'); if (v) v.textContent = couponsCount; }
        if (statCards[3]) { const v = statCards[3].querySelector('.stat-value'); if (v) v.textContent = '\uffe5' + (balance || 0).toFixed(2); }

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