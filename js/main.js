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

function showOrderModal(name, price) {
    const modal = document.getElementById('orderModal');
    const wizardName = document.getElementById('orderWizardName');
    const wizardPrice = document.getElementById('orderWizardPrice');
    const totalPrice = document.getElementById('orderTotalPrice');

    if (modal && wizardName && wizardPrice) {
        wizardName.textContent = name;
        wizardPrice.textContent = '￥' + price.toFixed(2) + '/小时';
        currentWizardPrice = price;
        calcOrderTotal();
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
}

// --- 计算订单总价 ---
function calcOrderTotal() {
    const hoursInput = document.querySelector('#orderForm input[type=\"number\"]');
    const totalPrice = document.getElementById('orderTotalPrice');
    if (hoursInput && totalPrice) {
        const hours = parseInt(hoursInput.value) || 1;
        const total = hours * currentWizardPrice;
        totalPrice.textContent = '￥' + total.toFixed(2);
    }
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
    const toast = document.createElement('div');
    toast.className = 'notification-toast notification-' + type;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
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
        orderForm.addEventListener('submit', (e) => {
            if (e && e.preventDefault) e.preventDefault();
            closeOrderModal();
            orderForm.reset();
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
    }
    window.toggleUserMenu = toggleUserMenu;

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
        setTimeout(function() { window.location.reload(); }, 500);
    }
    window.handleLogout = handleLogout;

    document.addEventListener('click', function(e) {
        var avatar = document.querySelector('.user-avatar');
        var dropdown = document.getElementById('userDropdown');
        if (avatar && dropdown && !avatar.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });

    // --- 轮播图 ---
    let currentSlide = 0;
    function goToSlide(index) {
        const slides = document.querySelectorAll('.carousel-slide');
        const dots = document.querySelectorAll('.carousel-dots .dot');
        if (!slides.length) return;
        currentSlide = (index + slides.length) % slides.length;
        slides.forEach((s, i) => s.style.display = i === currentSlide ? 'block' : 'none');
        dots.forEach((d, i) => d.classList.toggle('active', i === currentSlide));
    }
    function nextSlide() { goToSlide(currentSlide + 1); }
    function prevSlide() { goToSlide(currentSlide - 1); }
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
});

// 全局函数
function updateNavUser() {
    try {
        var user = localStorage.getItem('skyUser');
        var navActions = document.querySelector('.nav-actions');
        if (!navActions) return;

        // 根据当前URL判断基础路径
        var currentPath = window.location.pathname;
        var basePath = '';
        if (currentPath.indexOf('/pages/') !== -1) {
            basePath = '';
        } else {
            basePath = 'pages/';
        }

        if (user) {
            var userData = JSON.parse(user);
            var userName = userData.username || userData.nickname || userData.name || '玩家';
            var displayName = userName.length > 6 ? userName.substring(0, 6) + '...' : userName;
            var authUrl = navActions.getAttribute('data-auth-url') || basePath + 'auth.html';

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
                    '<div class="user-dropdown" id="userDropdown">' +
                        '<a href="' + basePath + 'profile.html" class="dropdown-item"><i class="fas fa-user"></i> 个人中心</a>' +
                        '<a href="' + basePath + 'settings.html" class="dropdown-item"><i class="fas fa-cog"></i> 设置</a>' +
                        '<a href="' + basePath + 'recharge.html" class="dropdown-item"><i class="fas fa-wallet"></i> 充值中心</a>' +
                        '<div class="dropdown-divider"></div>' +
                        '<a href="#" class="dropdown-item logout-btn" onclick="handleLogout(event)"><i class="fas fa-sign-out-alt"></i> 退出登录</a>' +
                    '</div>' +
                '</div>';
        } else {
            var authUrl2 = navActions.getAttribute('data-auth-url') || basePath + 'auth.html';
            navActions.innerHTML =
                '<button class="btn-login" onclick="window.location.href=\'' + authUrl2 + '\'">登录 / 注册</button>';
        }
    } catch (err) {
        console.error('[更新导航栏失败]', err);
    }
}
window.updateNavUser = updateNavUser;

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
        if (!userStr) return false;
        const user = JSON.parse(userStr);
        
        const { data, error } = await window.supabaseClient
            .from('orders')
            .insert({
                user_id: user.id,
                wizard_id: orderData.wizardId,
                wizard_name: orderData.wizardName,
                hours: orderData.hours,
                total_price: orderData.totalPrice,
                status: '待支付'
            })
            .select()
            .single();
        
        if (error) {
            showNotification('下单失败：' + error.message, 'error');
            return false;
        }
        
        showNotification('订单创建成功！', 'success');
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
        
        return data || [];
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
        const user = JSON.parse(userStr);
        
        const { data, error } = await window.supabaseClient
            .from('favorites')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        
        return data || [];
    } catch (err) {
        console.error('加载收藏失败:', err);
        return [];
    }
}

async function addFavorite(wizardId, wizardName) {
    try {
        const userStr = localStorage.getItem('skyUser');
        if (!userStr) return false;
        const user = JSON.parse(userStr);
        
        const { error } = await window.supabaseClient
            .from('favorites')
            .insert({
                user_id: user.id,
                wizard_id: wizardId,
                wizard_name: wizardName
            });
        
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

        const { data: profiles, error } = await window.supabaseClient
            .from('profiles')
            .select('balance')
            .eq('id', user.id)
            .limit(1);

        const profile = profiles && profiles.length > 0 ? profiles[0] : null;

        const balance = profile ? parseFloat(profile.balance) || 0 : 0;

        // 更新 localStorage
        user.balance = balance;
        localStorage.setItem('skyUser', JSON.stringify(user));

        // 更新充值中心余额显示
        const rechargeEl = document.getElementById('balanceValue');
        if (rechargeEl) {
            rechargeEl.textContent = balance.toFixed(2);
        }

        // 更新个人中心余额显示
        const statCards = document.querySelectorAll('.stat-card');
        if (statCards && statCards[3]) {
            const v = statCards[3].querySelector('.stat-value');
            if (v) v.textContent = '\uffe5' + balance.toFixed(2);
        }

        return balance;
    } catch (err) {
        console.error('同步余额失败:', err);
        return null;
    }
}

window.syncBalanceFromDB = syncBalanceFromDB;
