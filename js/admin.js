(function () {
    const ADMIN_EMAIL = 'admin@bjpw.com';
    const sb = window.supabaseClient;

    function getSkyUser() {
        try { return JSON.parse(localStorage.getItem('skyUser') || '{}'); } catch (e) { return {}; }
    }

    function requireAdmin() {
        const u = getSkyUser();
        if (!u.email || u.email !== ADMIN_EMAIL) {
            window.location.href = '../index.html';
            return false;
        }
        return true;
    }

    function adminToast(msg, type) {
        const box = document.getElementById('adminToast');
        const old = box.querySelector('.notification-toast');
        if (old) old.remove();
        const el = document.createElement('div');
        el.className = 'notification-toast notification-' + (type || 'success');
        el.textContent = msg;
        box.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 2600);
        setTimeout(() => { el.remove(); }, 3000);
    }

    function esc(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function money(n) { return '¥' + (Number(n || 0)).toFixed(2); }

    const SKILL_LABELS = {
        'tech': '技术', 'entertain': '娱乐', 'normal': '普陪', 'piano': '琴陪',
        'treehole': '树洞', 'three-love': '三恋', 'dragon-taming': '驯龙', 'substitute': '替身',
        'checkin': '打卡', 'blindbox': '盲盒', 'hang': '挂机陪', 'photo-edit': '代拍剪',
        'send-heart': '送心', 'sacrifice': '陪献祭', 'record': '录琴', 'sleep': '哄睡'
    };
    function skillLabels(arr) {
        if (!arr) return '';
        let list = arr;
        if (typeof arr === 'string') {
            const s = arr.trim();
            if (s.startsWith('[') && s.endsWith(']')) {
                try { list = JSON.parse(s); } catch (e) { list = s.slice(1, -1).split(',').map(x => x.trim().replace(/^"|"$/g, '')); }
            } else if (s.includes('、')) {
                list = s.split('、');
            } else if (s.includes(',')) {
                list = s.split(',').map(x => x.trim());
            } else {
                list = [s];
            }
        }
        if (!Array.isArray(list)) list = [list];
        return list.map(s => SKILL_LABELS[s] || s).join('、');
    }

    function appStatusTag(status) {
        const map = {
            'pending': ['tag-pending', '待审核'],
            'approved': ['tag-completed', '已通过'],
            'rejected': ['tag-cancelled', '已拒绝']
        };
        const key = String(status || 'pending');
        const m = map[key];
        if (m) return '<span class="admin-tag ' + m[0] + '">' + m[1] + '</span>';
        return '<span class="admin-tag tag-pending">' + esc(status) + '</span>';
    }

    function statusTag(status) {
        const map = {
            'pending': ['tag-pending', '待接单'],
            '待支付': ['tag-pending', '待支付'],
            'in_progress': ['tag-progress', '进行中'],
            'progress': ['tag-progress', '进行中'],
            'completed': ['tag-completed', '已完成'],
            'cancelled': ['tag-cancelled', '已取消'],
            'true': ['tag-active', '启用'],
            'false': ['tag-off', '禁用']
        };
        const key = String(status);
        const m = map[key];
        if (m) return '<span class="admin-tag ' + m[0] + '">' + m[1] + '</span>';
        return '<span class="admin-tag tag-pending">' + esc(status) + '</span>';
    }

    function fmtDate(s) {
        if (!s) return '-';
        const d = new Date(s);
        if (isNaN(d)) return esc(s);
        return d.toLocaleString('zh-CN', { hour12: false });
    }

    function avatarImg(url, name) {
        if (url) return '<img class="admin-avatar-cell" src="' + esc(url) + '" alt="">';
        return '<span class="admin-avatar-cell"><i class="fas fa-user"></i></span>';
    }

    function openModal(html) {
        const box = document.getElementById('adminModalBox');
        box.innerHTML = html;
        document.getElementById('adminModal').classList.add('active');
    }
    function closeModal() {
        document.getElementById('adminModal').classList.remove('active');
    }
    window.openModal = openModal;
    window.closeModal = closeModal;

    function openConfirmModal(message, onConfirm, okText, cancelText) {
        const ok = okText || '确定';
        const cancel = cancelText || '取消';
        window.__adminConfirmCallback = onConfirm;
        openModal(
            '<div class="admin-confirm-card">' +
            '<div class="admin-confirm-icon"><i class="fas fa-exclamation-circle"></i></div>' +
            '<h3>' + esc(message) + '</h3>' +
            '<div class="admin-form-actions">' +
            '<button class="btn btn-outline" onclick="closeModal()">' + esc(cancel) + '</button>' +
            '<button class="btn btn-primary" onclick="__runAdminConfirmCallback()">' + esc(ok) + '</button>' +
            '</div>' +
            '</div>'
        );
    }
    window.openConfirmModal = openConfirmModal;
    window.__runAdminConfirmCallback = function () {
        closeModal();
        const cb = window.__adminConfirmCallback;
        if (typeof cb === 'function') {
            try {
                const result = cb();
                if (result && typeof result.then === 'function') {
                    result.catch(function (err) {
                        console.error('admin confirm callback error:', err);
                        adminToast('操作失败：' + (err.message || JSON.stringify(err)), 'error');
                    });
                }
            } catch (err) {
                console.error('admin confirm callback sync error:', err);
                adminToast('操作失败：' + (err.message || JSON.stringify(err)), 'error');
            }
        }
    };

    window.toggleSkills = function (btn) {
        const cell = btn.parentElement;
        cell.classList.toggle('expanded');
        const icon = btn.querySelector('i');
        if (cell.classList.contains('expanded')) {
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        } else {
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        }
    };

    let userPage = 1;
    const USER_PAGE_SIZE = 15;

    function switchTab(tab) {
        document.querySelectorAll('.admin-menu li').forEach(li => {
            li.classList.toggle('active', li.getAttribute('data-tab') === tab);
        });
        document.querySelectorAll('.admin-section').forEach(sec => {
            sec.classList.toggle('active', sec.id === 'section-' + tab);
        });
        if (tab === 'dashboard') loadDashboard();
        else if (tab === 'users') loadUsers();
        else if (tab === 'wizards') loadWizards();
        else if (tab === 'orders') loadOrders();
        else if (tab === 'dispatch') loadDispatch();
        else if (tab === 'requests') loadRequests();
        else if (tab === 'applications') loadApplications();
        else if (tab === 'coupons') loadCoupons();
        else if (tab === 'content') loadContent();
    }

    async function countTable(table) {
        try {
            const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
            if (error) return '—';
            return count;
        } catch (e) { return '—'; }
    }

    async function loadDashboard() {
        const grid = document.getElementById('adminStats');
        grid.innerHTML = '<div class="admin-empty">加载中...</div>';
        const [users, wizards, orders, dispatch, coupons, requests] = await Promise.all([
            countTable('profiles'), countTable('wizards'), countTable('orders'),
            countTable('dispatch_orders'), countTable('coupons'), countTable('order_requests')
        ]);
        const cards = [
            { icon: 'fa-users', color: '#4FC3F7', num: users, label: '注册用户' },
            { icon: 'fa-gamepad', color: '#FF9800', num: wizards, label: '陪玩成员' },
            { icon: 'fa-receipt', color: '#66BB6A', num: orders, label: '订单总数' },
            { icon: 'fa-people-carry', color: '#AB47BC', num: dispatch, label: '派单总数' },
            { icon: 'fa-ticket', color: '#EF5350', num: coupons, label: '优惠券' },
            { icon: 'fa-clipboard-list', color: '#42A5F5', num: requests, label: '点单请求' }
        ];
        grid.innerHTML = cards.map(c =>
            '<div class="admin-stat-card"><div class="admin-stat-icon" style="background:' + c.color + '"><i class="fas ' + c.icon + '"></i></div>' +
            '<div class="admin-stat-info"><div class="admin-stat-num">' + esc(c.num) + '</div><div class="admin-stat-label">' + esc(c.label) + '</div></div></div>'
        ).join('');

        const recent = document.getElementById('dashboardRecent');
        recent.innerHTML = '<h3 style="margin:8px 0 14px;color:var(--text-dark)">最近订单</h3><div class="admin-table-wrap"><table class="admin-table" id="recentOrdersTable"></table></div>';
        try {
            const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(8);
            if (error) throw error;
            const t = document.getElementById('recentOrdersTable');
            if (!data || !data.length) { t.innerHTML = '<tr><td class="admin-empty">暂无订单</td></tr>'; return; }
            t.innerHTML = '<thead><tr><th>订单ID</th><th>板板</th><th>陪玩</th><th>金额</th><th>状态</th><th>时间</th></tr></thead><tbody>' +
                data.map(o => '<tr><td>' + esc(o.id) + '</td><td>' + esc(o.user_id) + '</td><td>' + esc(o.wizard_name || '') + '</td><td>' + money(o.total_price || o.price) + '</td><td>' + statusTag(o.status) + '</td><td>' + fmtDate(o.created_at) + '</td></tr>').join('') + '</tbody>';
        } catch (e) {
            recent.innerHTML = '<div class="admin-empty">最近订单加载失败：' + esc(e.message) + '</div>';
        }
    }

    async function loadUsers() {
        const t = document.getElementById('usersTable');
        t.innerHTML = '<tr><td class="admin-empty">加载中...</td></tr>';
        const kw = (document.getElementById('userSearch').value || '').trim();
        let query = sb.from('profiles').select('*', { count: 'exact' });
        if (kw) query = query.or('email.ilike.%' + kw + '%,nickname.ilike.%' + kw + '%');
        query = query.order('created_at', { ascending: false }).range((userPage - 1) * USER_PAGE_SIZE, userPage * USER_PAGE_SIZE - 1);
        try {
            const { data, error, count } = await query;
            if (error) throw error;
            if (!data || !data.length) { t.innerHTML = '<tr><td class="admin-empty">没有用户</td></tr>'; return; }
            t.innerHTML = '<thead><tr><th>头像</th><th>邮箱</th><th>昵称</th><th>余额</th><th>等级</th><th>管理员</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
                data.map(u => '<tr>' +
                    '<td>' + avatarImg(u.avatar_url) + '</td>' +
                    '<td>' + esc(u.email || '') + '</td>' +
                    '<td>' + esc(u.nickname || '') + '</td>' +
                    '<td>' + money(u.balance) + '</td>' +
                    '<td>' + esc(u.level || '普通玩家') + '</td>' +
                    '<td>' + (u.is_admin ? '<span class="admin-tag tag-admin">管理员</span>' : '-') + '</td>' +
                    '<td>' + statusTag(u.disabled ? 'false' : 'true') + '</td>' +
                    '<td><div class="admin-actions">' +
                    '<button class="admin-btn admin-btn-edit" onclick="editUser(\'' + esc(u.id) + '\')">编辑</button>' +
                    '<button class="admin-btn admin-btn-del" onclick="delRow(\'profiles\',\'' + esc(u.id) + '\',\'用户\')">删除</button>' +
                    '</div></td></tr>').join('') + '</tbody>';
            const totalPages = Math.max(1, Math.ceil((count || 0) / USER_PAGE_SIZE));
            document.getElementById('usersPager').innerHTML =
                '<button onclick="userPage=Math.max(1,userPage-1);loadUsers()" ' + (userPage <= 1 ? 'disabled' : '') + '>上一页</button>' +
                '<span>第 ' + userPage + ' / ' + totalPages + ' 页</span>' +
                '<button onclick="userPage=Math.min(' + totalPages + ',userPage+1);loadUsers()" ' + (userPage >= totalPages ? 'disabled' : '') + '>下一页</button>';
        } catch (e) {
            t.innerHTML = '<tr><td class="admin-empty">加载失败：' + esc(e.message) + '</td></tr>';
        }
    }

    window.editUser = async function (id) {
        try {
            const { data, error } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
            if (error) throw error;
            if (!data) { adminToast('未找到用户', 'error'); return; }
            const role = data.role || '板板';
            const avatar = data.avatar_url || '';
            const serverOptions = ['ios','android','pc'].map(v =>
                '<option value="' + v + '"' + ((data.server || '') === v ? ' selected' : '') + '>' + esc({ ios: 'iOS', android: 'Android', pc: '渠道服' }[v]) + '</option>'
            ).join('');
            const wzServerOptions = ['iOS QQ区','iOS 微信区','Android 微信区','Android QQ区'].map(v =>
                '<option value="' + esc(v) + '"' + ((data.wz_server || '') === v ? ' selected' : '') + '>' + esc(v) + '</option>'
            ).join('');
            openModal('<div class="admin-form">' +
                '<div class="admin-form-header">' +
                '<img class="admin-form-avatar" src="' + esc(avatar || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7') + '" alt="" onerror="this.src=\'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7\'">' +
                '<div class="admin-form-meta"><h2>编辑用户</h2><div class="admin-form-email">' + esc(data.email || '') + '</div><div class="admin-form-id">ID: ' + esc(id) + '</div></div>' +
                '</div>' +
                '<div class="form-group"><label>头像 URL</label><input id="euAvatar" value="' + esc(avatar) + '"></div>' +
                '<div class="form-row">' +
                '<div class="form-group"><label>昵称</label><input id="euNick" value="' + esc(data.nickname || '') + '"></div>' +
                '<div class="form-group"><label>邮箱</label><input id="euEmail" value="' + esc(data.email || '') + '" readonly></div>' +
                '</div>' +
                '<div class="form-row">' +
                '<div class="form-group"><label>余额</label><input id="euBalance" type="number" step="0.01" value="' + esc(data.balance || 0) + '"></div>' +
                '<div class="form-group"><label>等级</label><select id="euLevel"><option value="普通玩家"' + ((data.level || '普通玩家') === '普通玩家' ? ' selected' : '') + '>普通玩家</option><option value="VIP会员"' + (data.level === 'VIP会员' ? ' selected' : '') + '>VIP会员</option></select></div>' +
                '</div>' +
                '<div class="form-row">' +
                '<div class="form-group"><label>角色</label><select id="euRole"><option value="板板"' + (role === '板板' ? ' selected' : '') + '>板板</option><option value="陪陪"' + (role === '陪陪' ? ' selected' : '') + '>陪陪</option></select></div>' +
                '<div class="form-group"><label>注册时间</label><input id="euCreated" value="' + fmtDate(data.created_at) + '" readonly></div>' +
                '</div>' +
                '<div class="admin-form-section-title">游戏资料</div>' +
                '<div class="form-row">' +
                '<div class="form-group"><label>光遇ID</label><input id="euSkyId" value="' + esc(data.sky_id || '') + '"></div>' +
                '<div class="form-group"><label>光遇区服</label><select id="euSkyServer">' + serverOptions + '</select></div>' +
                '</div>' +
                '<div class="form-row">' +
                '<div class="form-group"><label>王者ID</label><input id="euWzId" value="' + esc(data.wangzhe_id || '') + '"></div>' +
                '<div class="form-group"><label>王者区服</label><select id="euWzServer"><option value="">请选择区服</option>' + wzServerOptions + '</select></div>' +
                '</div>' +
                '<div class="form-row">' +
                '<div class="form-group"><label>设为管理员</label><select id="euAdmin"><option value="false"' + (!data.is_admin ? ' selected' : '') + '>否</option><option value="true"' + (data.is_admin ? ' selected' : '') + '>是</option></select></div>' +
                '<div class="form-group"><label>禁用账号</label><select id="euDisabled"><option value="false"' + (!data.disabled ? ' selected' : '') + '>否</option><option value="true"' + (data.disabled ? ' selected' : '') + '>是</option></select></div>' +
                '</div>' +
                '<div class="admin-form-actions"><button class="btn btn-primary" onclick="saveUser(\'' + esc(id) + '\')">保存</button><button class="btn btn-outline" onclick="closeModal()">取消</button></div>' +
                '</div>');
        } catch (e) { adminToast('读取失败：' + e.message, 'error'); }
    };

    window.saveUser = async function (id) {
        const level = document.getElementById('euLevel').value;
        const payload = {
            avatar_url: document.getElementById('euAvatar').value,
            nickname: document.getElementById('euNick').value,
            balance: Number(document.getElementById('euBalance').value || 0),
            level: level,
            role: document.getElementById('euRole').value,
            sky_id: document.getElementById('euSkyId').value,
            server: document.getElementById('euSkyServer').value,
            wangzhe_id: document.getElementById('euWzId').value,
            wz_server: document.getElementById('euWzServer').value,
            is_admin: document.getElementById('euAdmin').value === 'true',
            disabled: document.getElementById('euDisabled').value === 'true'
        };
        try {
            if (level === '普通玩家') {
                payload.vip_expire_at = null;
                payload.vip_coupon_last_granted_at = null;
            } else if (level === 'VIP会员') {
                const { data: cur } = await sb.from('profiles').select('vip_expire_at').eq('id', id).single();
                const now = new Date().toISOString();
                if (!cur || !cur.vip_expire_at || cur.vip_expire_at < now) {
                    payload.vip_expire_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                }
            }
            const { error } = await sb.from('profiles').update(payload).eq('id', id);
            if (error) throw error;
            adminToast('用户已更新', 'success');
            closeModal();
            loadUsers();
        } catch (e) { adminToast('保存失败：' + e.message, 'error'); }
    };

    async function loadWizards() {
        const t = document.getElementById('wizardsTable');
        t.innerHTML = '<tr><td class="admin-empty">加载中...</td></tr>';
        const kw = (document.getElementById('wizardSearch').value || '').trim();
        let query = sb.from('wizards').select('*');
        if (kw) query = query.or('wizard_name.ilike.%' + kw + '%,game_type.ilike.%' + kw + '%');
        query = query.order('created_at', { ascending: false }).limit(100);
        try {
            const { data, error } = await query;
            if (error) throw error;
            if (!data || !data.length) { t.innerHTML = '<tr><td class="admin-empty">没有陪玩记录</td></tr>'; return; }
            t.innerHTML = '<thead><tr><th>陪玩名</th><th>关联用户</th><th>游戏</th><th>时薪</th><th>服务类型</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
                data.map(w => '<tr>' +
                    '<td>' + esc(w.wizard_name || '') + '</td>' +
                    '<td>' + esc(w.user_id || '') + '</td>' +
                    '<td>' + esc(w.game_type || '') + '</td>' +
                    '<td>' + money(w.price) + '</td>' +
                    '<td class="wrap">' + esc(Array.isArray(w.skills) ? w.skills.join('、') : (w.skills || '')) + '</td>' +
                    '<td>' + statusTag(w.is_active === false ? 'false' : 'true') + '</td>' +
                    '<td><div class="admin-actions">' +
                    '<button class="admin-btn admin-btn-edit" onclick="toggleWizard(\'' + esc(w.id) + '\',' + (w.is_active === false) + ')">' + (w.is_active === false ? '上架' : '下架') + '</button>' +
                    '<button class="admin-btn admin-btn-del" onclick="delRow(\'wizards\',\'' + esc(w.id) + '\',\'陪玩\')">删除</button>' +
                    '</div></td></tr>').join('') + '</tbody>';
        } catch (e) {
            t.innerHTML = '<tr><td class="admin-empty">加载失败：' + esc(e.message) + '</td></tr>';
        }
    }

    window.toggleWizard = async function (id, currentlyOff) {
        try {
            const { error } = await sb.from('wizards').update({ is_active: currentlyOff }).eq('id', id);
            if (error) throw error;
            adminToast(currentlyOff ? '已上架' : '已下架', 'success');
            loadWizards();
        } catch (e) { adminToast('操作失败：' + e.message, 'error'); }
    };

    window.openWizardEditor = async function (id) {
        let w = { wizard_name: '', user_id: '', game_type: '', price: 0, skills: '', bio: '', is_active: true };
        if (id) {
            try {
                const { data, error } = await sb.from('wizards').select('*').eq('id', id).maybeSingle();
                if (error) throw error;
                if (data) w = data;
            } catch (e) { adminToast('读取失败：' + e.message, 'error'); return; }
        }
        openModal('<div class="admin-form"><h2>' + (id ? '编辑陪玩' : '新增陪玩') + '</h2>' +
            '<div class="form-group"><label>陪玩名</label><input id="wzName" value="' + esc(w.wizard_name || '') + '"></div>' +
            '<div class="form-row"><div class="form-group"><label>关联用户ID</label><input id="wzUser" value="' + esc(w.user_id || '') + '"></div>' +
            '<div class="form-group"><label>游戏类型</label><input id="wzGame" value="' + esc(w.game_type || '') + '"></div></div>' +
            '<div class="form-row"><div class="form-group"><label>时薪(¥)</label><input id="wzPrice" type="number" step="0.01" value="' + esc(w.price || 0) + '"></div>' +
            '<div class="form-group"><label>状态</label><select id="wzActive"><option value="true"' + (w.is_active !== false ? ' selected' : '') + '>上架</option><option value="false"' + (w.is_active === false ? ' selected' : '') + '>下架</option></select></div></div>' +
            '<div class="form-group"><label>服务类型(逗号分隔)</label><input id="wzSkills" value="' + esc(Array.isArray(w.skills) ? w.skills.join(',') : (w.skills || '')) + '"></div>' +
            '<div class="form-group"><label>简介</label><textarea id="wzBio" rows="3">' + esc(w.bio || '') + '</textarea></div>' +
            '<div class="admin-form-actions"><button class="btn btn-primary" onclick="saveWizard(\'' + esc(id || '') + '\')">保存</button><button class="btn btn-outline" onclick="closeModal()">取消</button></div>' +
            '</div>');
    };

    window.saveWizard = async function (id) {
        const skillsRaw = document.getElementById('wzSkills').value;
        const payload = {
            wizard_name: document.getElementById('wzName').value,
            user_id: document.getElementById('wzUser').value,
            game_type: document.getElementById('wzGame').value,
            price: Number(document.getElementById('wzPrice').value || 0),
            is_active: document.getElementById('wzActive').value === 'true',
            skills: skillsRaw.split(',').map(s => s.trim()).filter(Boolean),
            bio: document.getElementById('wzBio').value
        };
        try {
            let error;
            if (id) {
                const r = await sb.from('wizards').update(payload).eq('id', id);
                error = r.error;
            } else {
                const r = await sb.from('wizards').insert(payload);
                error = r.error;
            }
            if (error) throw error;
            adminToast('陪玩已保存', 'success');
            closeModal();
            loadWizards();
        } catch (e) { adminToast('保存失败：' + e.message, 'error'); }
    };

    async function loadOrders() {
        const t = document.getElementById('ordersTable');
        t.innerHTML = '<tr><td class="admin-empty">加载中...</td></tr>';
        const status = document.getElementById('orderStatusFilter').value;
        let query = sb.from('orders').select('*').order('created_at', { ascending: false }).limit(100);
        if (status) query = query.eq('status', status);
        try {
            const { data, error } = await query;
            if (error) throw error;
            if (!data || !data.length) { t.innerHTML = '<tr><td class="admin-empty">没有订单</td></tr>'; return; }
            const statusOptions = ['待支付', '进行中', '已完成', '已取消'];
            t.innerHTML = '<thead><tr><th>订单ID</th><th>板板</th><th>陪玩</th><th>金额</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>' +
                data.map(o => {
                    const opts = statusOptions.map(s => '<option value="' + s + '"' + (o.status === s ? ' selected' : '') + '>' + s + '</option>').join('');
                    return '<tr>' +
                        '<td>' + esc(o.id) + '</td>' +
                        '<td>' + esc(o.user_id) + '</td>' +
                        '<td>' + esc(o.wizard_name || '') + '</td>' +
                        '<td>' + money(o.total_price || o.price) + '</td>' +
                        '<td><select onchange="setOrderStatus(\'' + esc(o.id) + '\', this.value)">' + opts + '</select></td>' +
                        '<td>' + fmtDate(o.created_at) + '</td>' +
                        '<td><div class="admin-actions"><button class="admin-btn admin-btn-del" onclick="delRow(\'orders\',\'' + esc(o.id) + '\',\'订单\')">删除</button></div></td>' +
                        '</tr>';
                }).join('') + '</tbody>';
        } catch (e) {
            t.innerHTML = '<tr><td class="admin-empty">加载失败：' + esc(e.message) + '</td></tr>';
        }
    }

    window.setOrderStatus = async function (id, status) {
        try {
            const { error } = await sb.from('orders').update({ status: status }).eq('id', id);
            if (error) throw error;
            adminToast('订单状态已更新', 'success');
        } catch (e) { adminToast('更新失败：' + e.message, 'error'); loadOrders(); }
    };

    async function loadDispatch() {
        const t = document.getElementById('dispatchTable');
        t.innerHTML = '<tr><td class="admin-empty">加载中...</td></tr>';
        const status = document.getElementById('dispatchStatusFilter').value;
        let query = sb.from('dispatch_orders').select('*').order('created_at', { ascending: false }).limit(100);
        if (status) query = query.eq('status', status);
        try {
            const { data, error } = await query;
            if (error) throw error;
            if (!data || !data.length) { t.innerHTML = '<tr><td class="admin-empty">没有派单</td></tr>'; return; }
            const statusOptions = ['pending', 'in_progress', 'completed', 'cancelled'];
            const statusLabel = { 'pending': '待接单', 'in_progress': '进行中', 'completed': '已完成', 'cancelled': '已取消' };
            t.innerHTML = '<thead><tr><th>派单ID</th><th>派单人</th><th>金额</th><th>人数</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>' +
                data.map(d => {
                    const opts = statusOptions.map(s => '<option value="' + s + '"' + (d.status === s ? ' selected' : '') + '>' + statusLabel[s] + '</option>').join('');
                    return '<tr>' +
                        '<td>' + esc(d.id) + '</td>' +
                        '<td>' + esc(d.user_id) + '</td>' +
                        '<td>' + money(d.price) + '</td>' +
                        '<td>' + esc(d.member_count || d.team_size || '-') + '</td>' +
                        '<td><select onchange="setDispatchStatus(\'' + esc(d.id) + '\', this.value)">' + opts + '</select></td>' +
                        '<td>' + fmtDate(d.created_at) + '</td>' +
                        '<td><div class="admin-actions"><button class="admin-btn admin-btn-view" onclick="viewDispatch(\'' + esc(d.id) + '\')">成员</button><button class="admin-btn admin-btn-del" onclick="delRow(\'dispatch_orders\',\'' + esc(d.id) + '\',\'派单\')">删除</button></div></td>' +
                        '</tr>';
                }).join('') + '</tbody>';
        } catch (e) {
            t.innerHTML = '<tr><td class="admin-empty">加载失败：' + esc(e.message) + '</td></tr>';
        }
    }

    window.setDispatchStatus = async function (id, status) {
        try {
            const { error } = await sb.from('dispatch_orders').update({ status: status }).eq('id', id);
            if (error) throw error;
            adminToast('派单状态已更新', 'success');
        } catch (e) { adminToast('更新失败：' + e.message, 'error'); loadDispatch(); }
    };

    window.viewDispatch = async function (id) {
        try {
            const { data, error } = await sb.from('dispatch_team_members').select('*').eq('dispatch_order_id', id);
            if (error) throw error;
            const rows = (data && data.length) ? data.map(m => '<li>' + esc(m.user_id) + (m.heart_qty ? ' （' + m.heart_qty + '心）' : '') + '</li>').join('') : '<li>暂无成员</li>';
            openModal('<div class="admin-form"><h2>派单成员</h2><ul style="padding-left:20px;line-height:2">' + rows + '</ul><div class="admin-form-actions"><button class="btn btn-primary" onclick="closeModal()">关闭</button></div></div>');
        } catch (e) { adminToast('读取失败：' + e.message, 'error'); }
    };

    async function loadRequests() {
        const t = document.getElementById('requestsTable');
        t.innerHTML = '<tr><td class="admin-empty">加载中...</td></tr>';
        try {
            const { data, error } = await sb.from('order_requests').select('*').order('created_at', { ascending: false }).limit(100);
            if (error) throw error;
            if (!data || !data.length) { t.innerHTML = '<tr><td class="admin-empty">没有点单请求</td></tr>'; return; }
            t.innerHTML = '<thead><tr><th>ID</th><th>板板</th><th>服务类型</th><th>订单编号</th><th>备注</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
                data.map(r => '<tr>' +
                    '<td>' + esc(r.id) + '</td>' +
                    '<td>' + esc(r.client_name || '') + '</td>' +
                    '<td class="wrap">' + esc(Array.isArray(r.skills) ? r.skills.join('、') : (r.skills || '')) + '</td>' +
                    '<td>' + esc(r.order_no || '') + '</td>' +
                    '<td class="wrap">' + esc(r.description || '') + '</td>' +
                    '<td>' + statusTag(r.status || '待接单') + '</td>' +
                    '<td><div class="admin-actions"><button class="admin-btn admin-btn-del" onclick="delRow(\'order_requests\',\'' + esc(r.id) + '\',\'点单请求\')">删除</button></div></td>' +
                    '</tr>').join('') + '</tbody>';
        } catch (e) {
            t.innerHTML = '<tr><td class="admin-empty">加载失败：' + esc(e.message) + '</td></tr>';
        }
    }

    async function loadApplications() {
        const t = document.getElementById('applicationsTable');
        t.innerHTML = '<tr><td class="admin-empty">加载中...</td></tr>';
        const status = document.getElementById('appStatusFilter').value;
        let query = sb.from('applications').select('*').order('apply_time', { ascending: false }).limit(200);
        if (status) query = query.eq('status', status);
        try {
            const { data, error } = await query;
            if (error) throw error;
            if (!data || !data.length) { t.innerHTML = '<tr><td class="admin-empty">没有申请记录</td></tr>'; return; }
            t.innerHTML = '<thead><tr><th>ID</th><th>游戏</th><th>申请人</th><th>游戏名字</th><th>游戏ID</th><th>服务器</th><th>微信号</th><th>擅长领域</th><th>状态</th><th>申请时间</th><th>操作</th></tr></thead><tbody>' +
                data.map(a => {
                    const isWz = String(a.game_type).toLowerCase().includes('wangzhe');
                    const gameLabel = isWz ? '王者荣耀' : '光·遇';
                    const gameName = isWz ? (a.wz_name || '') : (a.gyname || '');
                    const gameId = isWz ? (a.wz_game_id || '') : (a.game_id || '');
                    const server = isWz ? (a.wz_server || '') : (a.server || '');
                    const wechat = isWz ? (a.wz_wechat || '') : (a.wechat || '');
                    const skills = isWz ? (a.wz_skills || a.skills) : (a.skills || []);
                    const pending = a.status === 'pending';
                    return '<tr>' +
                        '<td>' + esc(a.id) + '</td>' +
                        '<td>' + esc(gameLabel) + '</td>' +
                        '<td>' + esc(a.username || '') + '<br><small>' + esc(a.user_email || '') + '</small></td>' +
                        '<td>' + esc(gameName) + '</td>' +
                        '<td>' + esc(gameId) + '</td>' +
                        '<td>' + esc(server) + '</td>' +
                        '<td>' + esc(wechat) + '</td>' +
                        '<td class="wrap skills-cell"><span class="skills-content">' + esc(skillLabels(skills)) + '</span><button class="skills-toggle" onclick="toggleSkills(this)" title="展开/收起"><i class="fas fa-chevron-down"></i></button></td>' +
                        '<td>' + appStatusTag(a.status || 'pending') + '</td>' +
                        '<td>' + fmtDate(a.apply_time) + '</td>' +
                        '<td><div class="admin-actions">' +
                        '<button class="admin-btn admin-btn-view" onclick="viewApplication(\'' + esc(a.id) + '\')">详情</button>' +
                        (pending ? '<button class="admin-btn admin-btn-edit" onclick="reviewApplication(\'' + esc(a.user_email || a.username || '') + '\', \'approved\')">通过</button>' +
                        '<button class="admin-btn admin-btn-del" onclick="reviewApplication(\'' + esc(a.user_email || a.username || '') + '\', \'rejected\')">拒绝</button>' : '') +
                        '</div></td></tr>';
                }).join('') + '</tbody>';
        } catch (e) {
            t.innerHTML = '<tr><td class="admin-empty">加载失败：' + esc(e.message) + '</td></tr>';
        }
    }

    window.viewApplication = async function (id) {
        try {
            const { data, error } = await sb.from('applications').select('*').eq('id', id).maybeSingle();
            if (error) throw error;
            if (!data) { adminToast('申请不存在', 'error'); return; }
            const isWz = String(data.game_type).toLowerCase().includes('wangzhe');
            const gameLabel = isWz ? '王者荣耀' : '光·遇';
            const gameIcon = isWz ? 'fa-chess-king' : 'fa-dove';
            const infoRows = [
                ['游戏名字', isWz ? (data.wz_name || '') : (data.gyname || '')],
                ['游戏ID', isWz ? (data.wz_game_id || '') : (data.game_id || '')],
                ['服务器', isWz ? (data.wz_server || '') : (data.server || '')],
                ['微信号', isWz ? (data.wz_wechat || '') : (data.wechat || '')],
                ['擅长领域', skillLabels(isWz ? (data.wz_skills || data.skills) : data.skills)],
                ['段位 / 战力', isWz ? ((data.wz_rank || '') + ' / ' + (data.wz_power || '')) : ('光翼 ' + (data.feathers || 0) + ' / 蜡烛 ' + (data.candles || 0))],
                ['截图', data.screenshot ? '<a class="admin-link" href="' + esc(data.screenshot) + '" target="_blank"><i class="fas fa-image"></i> 查看截图</a>' : '<span class="admin-muted">无</span>'],
                ['申请时间', fmtDate(data.apply_time)]
            ];
            const infoHtml = infoRows.map(f =>
                '<div class="admin-detail-item">' +
                '<span class="admin-detail-label">' + esc(f[0]) + '</span>' +
                '<span class="admin-detail-value">' + f[1] + '</span>' +
                '</div>'
            ).join('');
            const bio = isWz ? (data.wz_bio || data.bio || '') : (data.bio || '');
            const bioHtml = bio ? '<div class="admin-detail-bio"><span class="admin-detail-label">个人简介</span><p>' + esc(bio) + '</p></div>' : '';
            const html =
                '<div class="admin-detail-card">' +
                '<button class="admin-detail-close" onclick="closeModal()" title="关闭"><i class="fas fa-times"></i></button>' +
                '<div class="admin-detail-header">' +
                '<div class="admin-detail-avatar"><i class="fas ' + gameIcon + '"></i></div>' +
                '<div class="admin-detail-title">' +
                '<div class="admin-detail-name">' + esc(data.username || '未填写昵称') + '</div>' +
                '<div class="admin-detail-meta">' + esc(data.user_email || '') + '</div>' +
                '<div class="admin-detail-tags">' +
                '<span class="admin-tag tag-active">' + gameLabel + '</span>' +
                appStatusTag(data.status || 'pending') +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div class="admin-detail-body">' + infoHtml + '</div>' +
                bioHtml +
                '<div class="admin-detail-footer">' +
                '<span class="admin-detail-id">#' + esc(id) + '</span>' +
                '<button class="btn btn-primary" onclick="closeModal()">关闭</button>' +
                '</div>' +
                '</div>';
            openModal(html);
        } catch (e) { adminToast('读取失败：' + e.message, 'error'); }
    };

    window.reviewApplication = async function (emailOrName, action) {
        console.log('reviewApplication called', emailOrName, action);
        if (!emailOrName) { adminToast('该申请缺少邮箱/用户名，无法审核', 'error'); return; }
        const label = action === 'approved' ? '通过' : '拒绝';
        openConfirmModal('确定要' + label + '该申请？', async () => {
            console.log('reviewApplication confirm callback start', emailOrName, action);
            try {
                // 通过 RPC 函数按邮箱审核，绕过 applications 表 RLS 权限问题
                const { data: rpcResult, error: rpcErr } = await sb
                    .rpc('review_application_by_email', { app_email: emailOrName, new_status: action });
                console.log('reviewApplication rpc result', rpcResult, rpcErr);
                if (rpcErr) throw rpcErr;
                if (!rpcResult || !rpcResult.success) {
                    throw new Error((rpcResult && rpcResult.error) || '审核失败');
                }

                adminToast(action === 'approved' ? '申请已通过，用户身份已设为陪陪' : '申请已拒绝', 'success');
                loadApplications();
            } catch (e) {
                console.error('reviewApplication error:', e);
                let msg = e.message || JSON.stringify(e);
                if (msg.includes('row-level security') || msg.includes('permission denied') || msg.includes('violates row-level')) {
                    msg += '（请确认已在 Supabase 执行 admin_rls.sql 并刷新页面）';
                }
                adminToast('审核失败：' + msg, 'error');
            }
        });
    };

    async function loadCoupons() {
        const t = document.getElementById('couponsTable');
        t.innerHTML = '<tr><td class="admin-empty">加载中...</td></tr>';
        try {
            const { data, error } = await sb.from('coupons').select('*').order('created_at', { ascending: false }).limit(100);
            if (error) throw error;
            if (!data || !data.length) { t.innerHTML = '<tr><td class="admin-empty">没有优惠券</td></tr>'; return; }

            const userIds = Array.from(new Set(data.map(c => c.user_id).filter(Boolean)));
            let emailMap = {};
            if (userIds.length) {
                const { data: profiles, error: pe } = await sb.from('profiles').select('id,email').in('id', userIds);
                if (!pe && profiles) {
                    profiles.forEach(p => { if (p.id) emailMap[p.id] = p.email || ''; });
                }
            }

            t.innerHTML = '<thead><tr><th>ID</th><th>用户</th><th>金额</th><th>使用条件</th><th>过期日期</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
                data.map(c => '<tr>' +
                    '<td>' + esc(c.id) + '</td>' +
                    '<td>' + esc(emailMap[c.user_id] || c.user_id || '-') + '</td>' +
                    '<td>' + money(c.amount) + '</td>' +
                    '<td>' + esc(c.condition || '') + '</td>' +
                    '<td>' + esc(c.expire_date || '') + '</td>' +
                    '<td>' + statusTag(c.used ? 'cancelled' : 'active') + '</td>' +
                    '<td><div class="admin-actions"><button class="admin-btn admin-btn-del" onclick="delRow(\'coupons\',\'' + esc(c.id) + '\',\'优惠券\')">删除</button></div></td>' +
                    '</tr>').join('') + '</tbody>';
        } catch (e) {
            t.innerHTML = '<tr><td class="admin-empty">加载失败：' + esc(e.message) + '</td></tr>';
        }
    }

    window.openCouponEditor = function () {
        openModal('<div class="admin-form"><h2>发放优惠券</h2>' +
            '<div class="form-group"><label>用户邮箱</label><input id="cpEmail" placeholder="输入接收用户的邮箱"></div>' +
            '<div class="form-row"><div class="form-group"><label>金额(¥)</label><input id="cpAmount" type="number" step="0.01" value="5"></div>' +
            '<div class="form-group"><label>过期日期</label><input id="cpExpire" type="date"></div></div>' +
            '<div class="form-group"><label>使用条件</label><input id="cpCond" placeholder="如：满20元可用"></div>' +
            '<div class="admin-form-actions"><button class="btn btn-primary" onclick="saveCoupon()">发放</button><button class="btn btn-outline" onclick="closeModal()">取消</button></div>' +
            '</div>');
    };

    window.saveCoupon = async function () {
        const email = document.getElementById('cpEmail').value.trim();
        const amount = Number(document.getElementById('cpAmount').value || 0);
        const expire = document.getElementById('cpExpire').value;
        const condition = document.getElementById('cpCond').value;
        if (!email) { adminToast('请填写用户邮箱', 'error'); return; }
        try {
            const { data: prof, error: pe } = await sb.from('profiles').select('id').eq('email', email).maybeSingle();
            if (pe) throw pe;
            if (!prof) { adminToast('该邮箱未注册', 'error'); return; }
            const { error } = await sb.from('coupons').insert({
                user_id: prof.id, amount: amount, condition: condition,
                expire_date: expire || null, used: false
            });
            if (error) throw error;
            adminToast('优惠券已发放给 ' + email, 'success');
            closeModal();
            loadCoupons();
        } catch (e) { adminToast('发放失败：' + e.message, 'error'); }
    };

    const DEFAULT_CAROUSEL = [
        { title: '温暖相遇，快乐同行', desc: '专业陪玩团队，让你的光遇之旅不再孤单', link: 'pages/order.html', img: './images/xct1.jpg' },
        { title: '15种专业服务', desc: '技术陪玩、树洞倾听、琴陪录歌、三恋陪伴', link: 'pages/members.html', img: './images/xct2.jpg' },
        { title: '加入我们的团队', desc: '成为陪玩伙伴，用温暖照亮他人的天空', link: 'pages/join.html', img: './images/xct3.jpg' }
    ];

    let carouselData = JSON.parse(JSON.stringify(DEFAULT_CAROUSEL));

    async function loadContent() {
        const box = document.getElementById('contentEditor');
        box.innerHTML = '<div class="admin-empty">加载中...</div>';
        try {
            const { data, error } = await sb.from('site_config').select('value').eq('key', 'carousel').maybeSingle();
            if (!error && data && data.value) {
                carouselData = data.value;
            } else {
                carouselData = JSON.parse(JSON.stringify(DEFAULT_CAROUSEL));
            }
        } catch (e) {
            carouselData = JSON.parse(JSON.stringify(DEFAULT_CAROUSEL));
        }
        renderContentEditor();
    }

    function renderContentEditor() {
        const box = document.getElementById('contentEditor');
        box.innerHTML = carouselData.map((s, i) =>
            '<div class="content-slide-card"><h4>轮播图 ' + (i + 1) + '</h4>' +
            '<div class="form-row"><div class="form-group"><label>标题</label><input data-i="' + i + '" data-f="title" value="' + esc(s.title || '') + '"></div>' +
            '<div class="form-group"><label>副标题/描述</label><input data-i="' + i + '" data-f="desc" value="' + esc(s.desc || '') + '"></div></div>' +
            '<div class="form-row"><div class="form-group"><label>跳转链接</label><input data-i="' + i + '" data-f="link" value="' + esc(s.link || '') + '"></div>' +
            '<div class="form-group"><label>图片地址</label><input data-i="' + i + '" data-f="img" value="' + esc(s.img || '') + '"></div></div>' +
            '</div>'
        ).join('');
        box.querySelectorAll('input[data-i]').forEach(inp => {
            inp.addEventListener('input', () => {
                carouselData[Number(inp.getAttribute('data-i'))][inp.getAttribute('data-f')] = inp.value;
            });
        });
    }

    window.saveContent = async function () {
        try {
            const { error } = await sb.from('site_config').upsert({ key: 'carousel', value: carouselData });
            if (error) throw error;
            adminToast('首页内容已保存', 'success');
        } catch (e) {
            adminToast('保存失败：' + e.message + '（请确认已在 Supabase 执行 admin_rls.sql 创建 site_config 表）', 'error');
        }
    };

    window.delRow = async function (table, id, label) {
        openConfirmModal('确定删除该' + label + '？此操作不可恢复', async () => {
            try {
                const { error } = await sb.from(table).delete().eq('id', id);
                if (error) throw error;
                adminToast(label + '已删除', 'success');
                switchTab(document.querySelector('.admin-section.active').id.replace('section-', ''));
            } catch (e) { adminToast('删除失败：' + e.message, 'error'); }
        });
    };

    window.adminLogout = async function () {
        try { await sb.auth.signOut(); } catch (e) {}
        localStorage.removeItem('skyUser');
        window.location.href = '../index.html';
    };

    function init() {
        if (!requireAdmin()) return;
        const u = getSkyUser();
        document.getElementById('adminName').textContent = u.nickname || u.email || '管理员';
        document.querySelectorAll('.admin-menu li').forEach(li => {
            li.addEventListener('click', () => switchTab(li.getAttribute('data-tab')));
        });
        switchTab('dashboard');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
