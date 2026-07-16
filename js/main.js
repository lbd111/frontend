// ============================================
// 光遇陪玩团 - 主交互脚本
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
        alert('正在准备Android安装包...\n\n请使用HBuilderX编译生成APK文件');
    } else if (platform === 'ios') {
        alert('正在准备iOS安装包...\n\n请使用HBuilderX编译生成IPA文件');
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

// --- 表单提交 ---
document.addEventListener('DOMContentLoaded', () => {
    // 登录表单
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('登录成功！欢迎回来~');
            closeLoginModal();
        });
    }

    // 注册表单
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('注册成功！欢迎加入光遇陪玩团~');
            closeLoginModal();
        });
    }

    // 订单表单
    const orderForm = document.getElementById('orderForm');
    if (orderForm) {
        orderForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('订单已提交！陪玩伙伴将尽快与您联系~');
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

    // 滚动动画
    updateNavUser();
    initScrollAnimations();

    // 生成星星粒子
    createParticles();
});

// --- 滚动动画 ---
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-in').forEach(el => {
        observer.observe(el);
    });
}

// --- 星星粒子效果 ---
function createParticles() {
    const hero = document.querySelector('.hero');
    if (!hero) return;

    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'particles';
    hero.appendChild(particlesContainer);

    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.width = (Math.random() * 6 + 2) + 'px';
        particle.style.height = particle.style.width;
        particle.style.animationDuration = (Math.random() * 10 + 8) + 's';
        particle.style.animationDelay = (Math.random() * 5) + 's';
        particlesContainer.appendChild(particle);
    }
}

// --- 平滑滚动到锚点 ---
document.querySelectorAll('a[href^=\"#\"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href === '#') return;

        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
            const offsetTop = target.offsetTop - 70;
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        }
    });
});

// --- 数字动画 ---
function animateNumbers() {
    const stats = document.querySelectorAll('.stat-number');
    stats.forEach(stat => {
        const text = stat.textContent;
        const num = parseInt(text.replace(/[^0-9]/g, ''));
        const suffix = text.replace(/[0-9]/g, '');
        let current = 0;
        const increment = num / 60;
        const timer = setInterval(() => {
            current += increment;
            if (current >= num) {
                current = num;
                clearInterval(timer);
            }
            stat.textContent = Math.floor(current) + suffix;
        }, 20);
    });
}

// --- 当英雄区域可见时启动数字动画 ---
const heroObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            setTimeout(animateNumbers, 800);
            heroObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.3 });

const heroSection = document.querySelector('.hero');
if (heroSection) {
    heroObserver.observe(heroSection);
}

// --- 搜索功能（预留） ---
function searchWizards(keyword) {
    console.log('搜索:', keyword);
    // TODO: 实现搜索逻辑
}

// --- 通知系统（预留） ---
function showNotification(message, type) {
    const colors = { success: '#4CAF50', error: '#f44336', info: '#2196F3' };
    const bgColor = colors[type] || '#4FC3F7';
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.top = '90px';
    notification.style.right = '20px';
    notification.style.padding = '16px 24px';
    notification.style.background = bgColor;
    notification.style.color = 'white';
    notification.style.borderRadius = '12px';
    notification.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
    notification.style.zIndex = '3000';
    notification.style.animation = 'slideInRight 0.3s ease';
    document.body.appendChild(notification);
    setTimeout(function() {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100px)';
        notification.style.transition = 'all 0.3s ease';
        setTimeout(function() { notification.remove(); }, 300);
    }, 3000);
}

// --- 本地存储工具 ---
const Storage = {
    get(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch { return null; }
    },
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },
    remove(key) {
        localStorage.removeItem(key);
    }
};

// --- 导航栏用户状态更新 ---
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
            var userName = userData.name || '玩家';
            var displayName = userName.length > 6 ? userName.substring(0, 6) + '...' : userName;
            var authUrl = navActions.getAttribute('data-auth-url') || basePath + 'auth.html';

            navActions.innerHTML =
                '<div class="user-avatar" onclick="toggleUserMenu()" title="' + userName + '">' +
                    '<i class="fas fa-user-circle"></i>' +
                    '<span class="user-name">' + displayName + '</span>' +
                    '<div class="user-dropdown" id="userDropdown">' +
                        '<a href="' + basePath + 'profile.html" class="dropdown-item"><i class="fas fa-user"></i> 个人中心</a>' +
                        '<a href="' + basePath + 'javascript:void(0)" class="dropdown-item" onclick="showMyOrders()"><i class="fas fa-list"></i> 我的订单</a>' +
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

function toggleUserMenu() {
    var dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

function handleLogout(e) {
    e.preventDefault();
    localStorage.removeItem('skyUser');
    showNotification('已退出登录', 'info');
    updateNavUser();
    var dd = document.getElementById('userDropdown');
    if (dd) dd.classList.remove('show');
}

document.addEventListener('click', function(e) {
    var avatar = document.querySelector('.user-avatar');
    var dropdown = document.getElementById('userDropdown');
    if (avatar && dropdown && !avatar.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});
// --- 添加滑入动画样式 ---
const style = document.createElement('style');
style.textContent = '@keyframes slideInRight { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }';
document.head.appendChild(style);

console.log('%c光遇陪玩团 %c前端系统已加载', 'color: #4FC3F7; font-size: 20px; font-weight: bold;', 'color: #FFD54F; font-size: 14px;');







