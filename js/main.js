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
let currentCoupon = null;
let availableCoupons = [];
let allCoupons = [];
let couponAutoSelectEnabled = true;
let currentOrderWizardName = '';



async function showOrderModal(name, price, avatar, skills) {

    const modal = document.getElementById('orderModal');

    const wizardName = document.getElementById('orderWizardName');

    const wizardPrice = document.getElementById('orderWizardPrice');

    const totalPrice = document.getElementById('orderTotalPrice');

    const avatarEl = document.querySelector('.order-wizard-avatar');

    const serviceTypeSelect = document.getElementById('orderServiceType');


    if (modal && wizardName && wizardPrice) {

        currentOrderWizardName = name || '';

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
            const remarkEl = document.getElementById('orderRemark');
            const totalPriceEl = document.getElementById('orderTotalPrice');

            const serviceType = serviceTypeEl ? serviceTypeEl.value.trim() : '';
            const server = serverEl ? serverEl.value.trim() : '';
            const hours = hoursEl ? (parseInt(hoursEl.value) || 1) : 1;
            const appointmentTime = timeEl ? timeEl.value.trim() : '';
            const remark = remarkEl ? remarkEl.value.trim() : '';

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

            const orderData = {
                wizardName: currentOrderWizardName,
                serviceType: serviceType,
                server: server,
                hours: hours,
                appointmentTime: appointmentTime,
                remark: remark,
                totalPrice: finalPrice,
                couponId: couponId
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
                '<a href="#" class="dropdown-item" onclick="toggleNotification(event)" id="notifToggle"><i class="fas fa-bell"></i> 消息通知</a>' +
                '<div class="dropdown-divider"></div>' +
                '<a href="#" class="dropdown-item logout-btn" onclick="handleLogout(event)"><i class="fas fa-sign-out-alt"></i> 退出登录</a>' +
            '</div>' +
            '<div class="notification-panel" id="notificationPanel" style="display:none;position:absolute;top:110%;right:0;background:white;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.12);min-width:280px;padding:0;z-index:2000;">' +
                '<div class="notif-header" style="display:flex;align-items:center;gap:8px;padding:10px 18px;border-bottom:1px solid #eee;font-weight:600;color:#333;font-size:0.9rem;"><i class="fas fa-bell"></i> 消息通知</div>' +
                '<div class="notif-list">' +
                    '<div class="notif-item unread" style="display:flex;gap:10px;padding:10px 18px;border-bottom:1px solid #f5f5f5;">' +
                        '<div class="notif-dot" style="width:8px;height:8px;border-radius:50%;background:#ff4757;flex-shrink:0;margin-top:6px;"></div>' +
                        '<div class="notif-content">' +
                            '<div class="notif-title" style="font-weight:600;color:#333;font-size:0.85rem;">欢迎加入BJ陪玩团</div>' +
                            '<div class="notif-text" style="color:#666;font-size:0.8rem;margin-top:2px;">恭喜成为我们的新成员，开始你的陪玩之旅吧！</div>' +
                            '<div class="notif-time" style="color:#999;font-size:0.75rem;margin-top:4px;">今天</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="notif-item" style="display:flex;gap:10px;padding:10px 18px;border-bottom:1px solid #f5f5f5;">' +
                        '<div class="notif-dot" style="width:8px;height:8px;border-radius:50%;background:#ccc;flex-shrink:0;margin-top:6px;"></div>' +
                        '<div class="notif-content">' +
                            '<div class="notif-title" style="font-weight:600;color:#333;font-size:0.85rem;">系统公告</div>' +
                            '<div class="notif-text" style="color:#666;font-size:0.8rem;margin-top:2px;">新版UI界面即将上线，敬请期待新功能</div>' +
                            '<div class="notif-time" style="color:#999;font-size:0.75rem;margin-top:4px;">1小时前</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="notif-item" style="display:flex;gap:10px;padding:10px 18px;">' +
                        '<div class="notif-dot" style="width:8px;height:8px;border-radius:50%;background:#ccc;flex-shrink:0;margin-top:6px;"></div>' +
                        '<div class="notif-content">' +
                            '<div class="notif-title" style="font-weight:600;color:#333;font-size:0.85rem;">VIP特权</div>' +
                            '<div class="notif-text" style="color:#666;font-size:0.8rem;margin-top:2px;">开通VIP享专属陪玩折扣和优先匹配服务</div>' +
                            '<div class="notif-time" style="color:#999;font-size:0.75rem;margin-top:4px;">3天前</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
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

        // 先用 localStorage 数据立刻渲染，避免空白
        renderNavActions(userData);

        // 如果资料不完整（缺头像/昵称看起来是默认值），异步从 Supabase 拉取最新资料
        var looksDefault = !userData.avatar || !userData.username || userData.username === '用户' || (userData.email && userData.username === userData.email.split('@')[0]);
        if (userData.id && window.supabaseClient && looksDefault) {
            try {
                var res = await window.supabaseClient.from('profiles').select('nickname, avatar_url').eq('id', userData.id).maybeSingle();
                if (res.data) {
                    var changed = false;
                    if (res.data.nickname && res.data.nickname !== userData.username && res.data.nickname !== userData.nickname) {
                        userData.username = res.data.nickname;
                        userData.nickname = res.data.nickname;
                        changed = true;
                    }
                    if (res.data.avatar_url && res.data.avatar_url !== userData.avatar) {
                        userData.avatar = res.data.avatar_url;
                        changed = true;
                    }
                    if (changed) {
                        localStorage.setItem('skyUser', JSON.stringify(userData));
                        renderNavActions(userData);
                    }
                }
            } catch (e) {
                console.warn('[updateNavUser] 拉取最新资料失败:', e);
            }
        }
    } catch (err) {
        console.error('[导航更新异常]', err);
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

        if (!userStr) {
            showNotification('请先登录', 'error');
            return false;
        }

        const user = JSON.parse(userStr);
        if (!user || !user.id) {
            showNotification('请先登录', 'error');
            return false;
        }

        // 1. Deduct balance
        const { data: profile, error: balanceErr } = await window.supabaseClient
            .from('profiles')
            .select('balance')
            .eq('id', user.id)
            .single();

        if (balanceErr) throw balanceErr;

        const currentBalance = parseFloat(profile && profile.balance) || 0;
        const finalPrice = parseFloat(orderData.totalPrice) || 0;

        if (currentBalance < finalPrice) {
            showNotification('余额不足，请前往充值中心充值', 'error');
            return false;
        }

        const newBalance = currentBalance - finalPrice;

        const { error: updateErr } = await window.supabaseClient
            .from('profiles')
            .update({ balance: newBalance })
            .eq('id', user.id);

        if (updateErr) throw updateErr;

        // Update localStorage balance
        user.balance = newBalance;
        localStorage.setItem('skyUser', JSON.stringify(user));

        // 2. Mark coupon as used if any
        if (orderData.couponId) {
            try {
                await window.supabaseClient
                    .from('coupons')
                    .update({ used: true })
                    .eq('id', orderData.couponId)
                    .eq('user_id', user.id);
            } catch(couponErr) {
                console.error('标记优惠券已用失败:', couponErr);
                // Do not block order creation on coupon update failure
            }
        }

        // 3. Create order record (only use columns known to exist)
        const { error } = await window.supabaseClient
            .from('orders')
            .insert({
                user_id: user.id,
                wizard_id: orderData.wizardName || null,
                wizard_name: orderData.wizardName || '',
                hours: orderData.hours || 1,
                total_price: finalPrice,
                status: '待支付'
            });

        if (error) {
            // Rollback balance if order insert failed
            try {
                await window.supabaseClient
                    .from('profiles')
                    .update({ balance: currentBalance })
                    .eq('id', user.id);
            } catch(rollbackErr) {
                console.error('订单创建失败后回滚余额失败:', rollbackErr);
            }
            showNotification('下单失败：' + error.message, 'error');
            return false;
        }

        showNotification('下单成功，已扣除余额 ¥' + finalPrice.toFixed(2), 'success');

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


