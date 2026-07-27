// ============================================
// BJ陪玩团 - 主交互脚本
// ============================================

let currentWizardPrice = 0;

function toggleMenu() {    const menu = document.getElementById('navMenu')
const hamburger = document.getElementById('hamburger')
    if (menu && hamburger) {        menu.classList.toggle('open')
    hamburger.classList.toggle('active')
    }
}

function showLoginModal() {    const modal = document.getElementById('loginModal')
    if (modal) {        modal.classList.add('active')
    document.body.style.overflow = 'hidden'
    }
}

function closeLoginModal() {    const modal = document.getElementById('loginModal')
    if (modal) {        modal.classList.remove('active')
    document.body.style.overflow = ''
    }
}

function switchTab(tab) {    const tabs = document.querySelectorAll('.modal-tabs .tab')
const loginForm = document.getElementById('loginForm')
const registerForm = document.getElementById('registerForm')
tabs.forEach(t => t.classList.remove('active'))
    if (tab === 'login') {        tabs[0].classList.add('active')
    loginForm.style.display = 'block'
    registerForm.style.display = 'none'
    }
    else {        tabs[1].classList.add('active')
    loginForm.style.display = 'none'
    registerForm.style.display = 'block'
    }
}

function showOrderModal(name, price, avatar, skills) {

    const modal = document.getElementById('orderModal')
const wizardName = document.getElementById('orderWizardName')
const wizardPrice = document.getElementById('orderWizardPrice')
const totalPrice = document.getElementById('orderTotalPrice')
const avatarEl = document.querySelector('.order-wizard-avatar')
const serviceTypeSelect = document.getElementById('orderServiceType')
    if (modal && wizardName && wizardPrice) {

        wizardName.textContent = name
    wizardPrice.textContent = '￥' + price.toFixed(2) + '/小时'
    // Update avatar in modal
        if (avatar) {
            const av = String(avatar).replace(/^"|"$/g, '')
        avatarEl.innerHTML = '<img src="' + av + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">'
        }
        else {
            avatarEl.innerHTML = '<i class="fas fa-user-circle"></i>'
        }
    currentWizardPrice = price
    calcOrderTotal()
    // --- 动态填充服务类型下拉框 ---
        if (serviceTypeSelect && skills) {
            var rawSkills = ''
            try { rawSkills = JSON.parse(skills)
            }
            catch(e) { rawSkills = []
            }
            if (!Array.isArray(rawSkills) || rawSkills.length === 0) {
                rawSkills = []
            }
        // skillMap: 将Supabase中的原始技能标签映射为下拉框显示文本
            }
        
        // 清空原有选项（保留第一个"请选择服务类型"）
            while (serviceTypeSelect.options.length > 1) {
                serviceTypeSelect.remove(1)
            }
        // 去重后生成新选项
            }
        
        for (var i = 0
        i < rawSkills.length
            i++) {
                var raw = String(rawSkills[i]).trim()
            if (!raw || seen[raw]) continue
            seen[raw] = true
            var opt = document.createElement('option')
            opt.value = raw
            opt.textContent = skillMap[raw] || raw
            serviceTypeSelect.appendChild(opt)
            }
        }
    modal.classList.add('active')
    document.body.style.overflow = 'hidden'
    }
}

function calcOrderTotal() {    const hoursInput = document.querySelector('#orderForm input[type=\"number\"]')
const totalPrice = document.getElementById('orderTotalPrice')
    if (hoursInput && totalPrice) {        const hours = parseInt(hoursInput.value) || 1
    const total = hours * currentWizardPrice
    totalPrice.textContent = '￥' + total.toFixed(2)
    }
}

    }
    }
    else {
    // 显示下载选择        const choice = confirm('您想下载哪个平台的APP？\\n\\n确定 = Android\\n取消 = iOS');        if (choice) {            downloadApp('android');        } else {            downloadApp('ios');        }    }}// --- 通知系统（全局） ---
        function showNotification(message, type) {    const toast = document.createElement('div')
        toast.className = 'notification-toast notification-' + type
        toast.textContent = message
        document.body.appendChild(toast)
        setTimeout(() => toast.remove(), 3000)
        }
    // --- 表单提交 ---document.addEventListener('DOMContentLoaded', () => {    // 登录表单    const loginForm = document.getElementById('loginForm');    if (loginForm) {        loginForm.addEventListener('submit', (e) => {            if (e && e.preventDefault) e.preventDefault();            closeLoginModal();        });
    }
// 注册表单    const registerForm = document.getElementById('registerForm');    if (registerForm) {        registerForm.addEventListener('submit', (e) => {            if (e && e.preventDefault) e.preventDefault();            closeLoginModal();        });
}

function searchWizards(keyword) {        console.log('搜索陪玩师:', keyword)
}

function toggleUserMenu() {            var dropdown = document.getElementById('userDropdown')
    if (dropdown) {                dropdown.classList.toggle('show')
    }
// 同时关闭通知面板            var panel = document.getElementById('notificationPanel');            if (panel) {                panel.style.display = 'none';            }        }        window.toggleUserMenu = toggleUserMenu;
        function toggleNotification(e) {            if (e) {                e.stopPropagation()
        e.preventDefault()
        }
    var panel = document.getElementById('notificationPanel')
            if (panel) {                if (panel.style.display === 'none' || panel.style.display === '') {                    panel.style.display = 'block'
            }
            else {                    panel.style.display = 'none'
            }
        }
    }
window.toggleNotification = toggleNotification
    async 
function handleLogout(e) {            if (e && e.preventDefault) e.preventDefault()
        try { await window.supabaseClient.auth.signOut()
        }
        }
    localStorage.removeItem('skyUser')
    localStorage.removeItem('skyUserList')
    var keys = Object.keys(localStorage)
    for (var i = 0
    i < keys.length
            i++) {                if (keys[i].startsWith('sb-') || keys[i].indexOf('supabase') !== -1) {                    localStorage.removeItem(keys[i])
            }
        }
    showNotification('已退出登录', 'success')
    updateNavUser()
    var dd = document.getElementById('userDropdown')
    if (dd) dd.classList.remove('show')
    var np = document.getElementById('notificationPanel')
    if (np) np.style.display = 'none'
        setTimeout(function() { window.location.reload()
        }
    , 500)
    }
window.handleLogout = handleLogout
    document.addEventListener('click', function(e) {        var avatar = document.querySelector('.user-avatar')
    var dropdown = document.getElementById('userDropdown')
    var notifPanel = document.getElementById('notificationPanel')
        if (avatar && dropdown && !avatar.contains(e.target)) {            dropdown.classList.remove('show')
        }
        if (notifPanel && !notifPanel.contains(e.target)) {            notifPanel.style.display = 'none'
        }
    }
)
// --- 轮播图 ---    let currentSlide = 0;
    function goToSlide(index) {        const slides = document.querySelectorAll('.carousel-slide')
    const dots = document.querySelectorAll('.carousel-dots .dot')
    if (!slides.length) return
    currentSlide = (index + slides.length) % slides.length
    slides.forEach((s, i) => s.style.display = i === currentSlide ? 'block' : 'none')
    dots.forEach((d, i) => d.classList.toggle('active', i === currentSlide))
    }
    function nextSlide() { goToSlide(currentSlide + 1)
    }
    function prevSlide() { goToSlide(currentSlide - 1)
    }
    function startInterval() { slideInterval = setInterval(nextSlide, 5000)
    }
    function resetInterval() { clearInterval(slideInterval)
    startInterval()
    }
let slideInterval
startInterval()
// 初始化轮播    goToSlide(0);    // --- 优惠券弹窗 ---
    function closeCouponsModal() {        var modal = document.getElementById('couponsModal')
        if (modal) { modal.classList.remove('active')
        document.body.style.overflow = ''
        }
    }
// 设置弹窗
    function showSettings() {        var modal = document.getElementById('settingsModal')
        if (modal) { modal.classList.add('active')
        document.body.style.overflow = 'hidden'
        }
    }
    function closeSettingsModal() {        var modal = document.getElementById('settingsModal')
        if (modal) { modal.classList.remove('active')
        document.body.style.overflow = ''
        }
    }
// 更新导航栏用户信息    updateNavUser();});// 全局函数
        function updateNavUser() {    try {        var user = localStorage.getItem('skyUser')
        var navActions = document.querySelector('.nav-actions')
        if (!navActions) return
        // 计算基础URL路径        var currentPath = window.location.pathname;        var basePath = '';        if (currentPath.indexOf('/pages/') !== -1) {            basePath = '';        } else {            basePath = 'pages/';        }        if (user) {            var userData = JSON.parse(user);            var userName = userData.username || userData.nickname || userData.name || '用户';            var displayName = userName.length > 6 ? userName.substring(0, 6) + '...' : userName;            var authUrl = navActions.getAttribute('data-auth-url') || basePath + 'auth.html';            var avatarHtml = '';            if (userData.avatar) {                avatarHtml = '<img src="' + userData.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';            } else {                avatarHtml = '<i class="fas fa-user-circle"></i>';            }            navActions.innerHTML =                '<div class="user-avatar" onclick="toggleUserMenu()" title="' + userName + '">' +                    '<div class="nav-avatar-img" style="width:32px;height:32px;border-radius:50%;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#4facfe,#00f2fe);vertical-align:middle;margin-right:6px;">' + avatarHtml + '</div>' +                    '<span class="user-name">' + displayName + '</span>' +                ' <a href="' + basePath + 'orders.html" class="publish-btn" title="上架我的陪玩"><i class="fas fa-plus-circle"></i></a>' +                    '<div class="user-dropdown" id="userDropdown">' +                        '<a href="' + basePath + 'profile.html" class="dropdown-item"><i class="fas fa-user"></i> 个人中心</a>' +                        '<a href="' + basePath + 'settings.html" class="dropdown-item"><i class="fas fa-cog"></i> 设置</a>' +                        '<a href="' + basePath + 'recharge.html" class="dropdown-item"><i class="fas fa-wallet"></i> 充值中心</a>' +                        '<div class="dropdown-divider"></div>' +                        '<a href="#" class="dropdown-item" onclick="toggleNotification(event)" id="notifToggle"><i class="fas fa-bell"></i> 消息通知</a>' +                        '<div class="dropdown-divider"></div>' +                        '<a href="#" class="dropdown-item logout-btn" onclick="handleLogout(event)"><i class="fas fa-sign-out-alt"></i> 退出登录</a>' +                    '</div>' +                    '<div class="notification-panel" id="notificationPanel" style="display:none;position:absolute;top:110%;right:0;background:white;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.12);min-width:280px;padding:0;z-index:2000;">' +                        '<div class="notif-header" style="display:flex;align-items:center;gap:8px;padding:10px 18px;border-bottom:1px solid #eee;font-weight:600;color:#333;font-size:0.9rem;"><i class="fas fa-bell"></i> 消息通知</div>' +                        '<div class="notif-list">' +                            '<div class="notif-item unread" style="display:flex;gap:10px;padding:10px 18px;border-bottom:1px solid #f5f5f5;">' +                                '<div class="notif-dot" style="width:8px;height:8px;border-radius:50%;background:#ff4757;flex-shrink:0;margin-top:6px;"></div>' +                                '<div class="notif-content">' +                                    '<div class="notif-title" style="font-weight:600;color:#333;font-size:0.85rem;">欢迎加入BJ陪玩团</div>' +                                    '<div class="notif-text" style="color:#666;font-size:0.8rem;margin-top:2px;">恭喜成为我们的新成员，开始你的陪玩之旅吧！</div>' +                                    '<div class="notif-time" style="color:#999;font-size:0.75rem;margin-top:4px;">今天</div>' +                                '</div>' +                            '</div>' +                            '<div class="notif-item" style="display:flex;gap:10px;padding:10px 18px;border-bottom:1px solid #f5f5f5;">' +                                '<div class="notif-dot" style="width:8px;height:8px;border-radius:50%;background:#ccc;flex-shrink:0;margin-top:6px;"></div>' +                                '<div class="notif-content">' +                                    '<div class="notif-title" style="font-weight:600;color:#333;font-size:0.85rem;">系统公告</div>' +                                    '<div class="notif-text" style="color:#666;font-size:0.8rem;margin-top:2px;">新版UI界面即将上线，敬请期待新功能</div>' +                                    '<div class="notif-time" style="color:#999;font-size:0.75rem;margin-top:4px;">1小时前</div>' +                                '</div>' +                            '</div>' +                            '<div class="notif-item" style="display:flex;gap:10px;padding:10px 18px;">' +                                '<div class="notif-dot" style="width:8px;height:8px;border-radius:50%;background:#ccc;flex-shrink:0;margin-top:6px;"></div>' +                                '<div class="notif-content">' +                                    '<div class="notif-title" style="font-weight:600;color:#333;font-size:0.85rem;">VIP特权</div>' +                                    '<div class="notif-text" style="color:#666;font-size:0.8rem;margin-top:2px;">开通VIP享专属陪玩折扣和优先匹配服务</div>' +                                    '<div class="notif-time" style="color:#999;font-size:0.75rem;margin-top:4px;">3天前</div>' +                                '</div>' +                            '</div>' +                        '</div>' +                    '</div>' +                '</div>';        } else {            var authUrl2 = navActions.getAttribute('data-auth-url') || basePath + 'auth.html';            navActions.innerHTML =                '<button class="btn-login" id="loginBtn">登录 / 注册</button>';            // Attach click handler after button is inserted            setTimeout(function() {                var lb = document.getElementById('loginBtn');                if (lb) {                    lb.addEventListener('click', function() {                        window.location.href = authUrl2;                    });
        }
    }
, 0)
}

    function loadOrders() {    try {        const userStr = localStorage.getItem('skyUser')
    if (!userStr) return []
    const user = JSON.parse(userStr)
        }
        }
    )
    return data || []
    }
    catch (err) {        console.error('加载订单失败:', err)
    return []
    }
}

    function createOrder(orderData) {    try {        const userStr = localStorage.getItem('skyUser')
    if (!userStr) return false
    const user = JSON.parse(userStr)
        }
        }
    )            .select()            .single()
        if (error) {            showNotification('下单失败：' + error.message, 'error')
        return false
        }
    showNotification('订单创建成功！', 'success')
    return true
    }
    catch (err) {        console.error('创建订单错误:', err)
    showNotification('下单失败，请重试', 'error')
    return false
    }
}

    function loadCoupons() {    try {        const userStr = localStorage.getItem('skyUser')
    if (!userStr) return []
    const user = JSON.parse(userStr)
        }
        }
    )
    return data || []
    }
    catch (err) {        console.error('加载优惠券失败:', err)
    return []
    }
}

    function grantWeeklyCoupon(userId) {    try {        const today = new Date().toISOString().split('T')[0]
        }
        }
    )
    return !error
    }
    catch (err) {        console.error('发放优惠券失败:', err)
    return false
    }
}

    function loadFavorites() {    try {        const userStr = localStorage.getItem('skyUser')
    if (!userStr) return []
    const user = JSON.parse(userStr)
        }
        }
    )
    return data || []
    }
    catch (err) {        console.error('加载收藏失败:', err)
    return []
    }
}

    function addFavorite(wizardId, wizardName) {    try {        const userStr = localStorage.getItem('skyUser')
    if (!userStr) return false
    const user = JSON.parse(userStr)
        }
        }
    )
        if (error) {            showNotification('收藏失败', 'error')
        return false
        }
    showNotification('收藏成功！', 'success')
    return true
    }
    catch (err) {        console.error('收藏错误:', err)
    return false
    }
}

        }
    = await window.supabaseClient            .from('favorites')            .delete()            .eq('id', favoriteId)
        if (error) {            showNotification('取消收藏失败', 'error')
        return false
        }
    showNotification('已取消收藏', 'success')
    return true
    }
    catch (err) {        console.error('取消收藏错误:', err)
    return false
    }
}
