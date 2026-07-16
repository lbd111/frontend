// ============================================
// 光遇陪玩团 - 移动端交互
// ============================================

// --- 侧边栏 ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

// --- Banner轮播 ---
let currentBanner = 0;
const totalBanners = 3;

function initBanner() {
    const wrapper = document.getElementById('bannerWrapper');
    const dots = document.querySelectorAll('.dot');

    if (!wrapper || dots.length === 0) return;

    // 自动轮播
    setInterval(() => {
        currentBanner = (currentBanner + 1) % totalBanners;
        updateBanner();
    }, 4000);

    // 点击指示点
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            currentBanner = index;
            updateBanner();
        });
    });

    // 触摸滑动
    let startX = 0;
    wrapper.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
    });

    wrapper.addEventListener('touchend', (e) => {
        const endX = e.changedTouches[0].clientX;
        const diff = startX - endX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) {
                currentBanner = (currentBanner + 1) % totalBanners;
            } else {
                currentBanner = (currentBanner - 1 + totalBanners) % totalBanners;
            }
            updateBanner();
        }
    });
}

function updateBanner() {
    const wrapper = document.getElementById('bannerWrapper');
    const dots = document.querySelectorAll('.dot');
    if (wrapper) {
        wrapper.style.transform = 'translateX(-' + (currentBanner * 100) + '%)';
    }
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentBanner);
    });
}

// --- 通知 ---
function showNotifications() {
    alert('📬 通知\\n\\n1. 您的订单 #20260714 已完成\\n2. 新优惠券已到账\\n3. 系统维护通知：7月16日');
}

// --- 底部导航激活 ---
document.addEventListener('DOMContentLoaded', () => {
    initBanner();

    // 底部导航激活状态
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('.bottom-nav .nav-item').forEach(i => i.classList.remove('active'));
            if (!this.classList.contains('nav-item-center')) {
                this.classList.add('active');
            }
        });
    });

    // 点击弹窗外部关闭
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // 表单提交
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('登录成功！欢迎回来~');
            closeLoginModal();
        });
    }

    const orderForm = document.getElementById('orderForm');
    if (orderForm) {
        orderForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('订单已提交！陪玩伙伴将尽快与您联系~');
            closeOrderModal();
        });
    }
});
