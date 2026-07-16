// ============================================
// 光遇陪玩团 - 个人中心交互
// ============================================

// --- 菜单功能 ---
function showMyOrders() {
    const modal = document.getElementById('ordersModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function showFavorites() {
    alert('我的收藏功能\\n\\n这里将展示您收藏的陪玩伙伴列表。');
}

function showCoupons() {
    alert('优惠券中心\\n\\n您有 5 张可用优惠券。');
}

function showAddress() {
    alert('游戏区服管理\\n\\n管理您的游戏服务器信息。');
}

function showWallet() {
    window.location.href = 'recharge.html';
}

function showSettings() {
    alert('设置\\n\\n修改密码、通知设置等功能。');
}

function showHelp() {
    alert('帮助与反馈\\n\\n常见问题解答、意见反馈。');
}

function showAbout() {
    alert('关于光遇陪玩团\\n\\n版本: v1.0.0\\n温暖相遇，快乐同行');
}

// --- 关闭弹窗 ---
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// --- 加载用户信息 ---
function loadUserProfile() {
    try {
        const userStr = localStorage.getItem('skyUser');
        if (!userStr) return;

        const user = JSON.parse(userStr);
        if (!user || !user.name) return;

        // 填充用户名
        const nameEl = document.getElementById('userName');
        if (nameEl) nameEl.textContent = user.name;

        // 填充游戏ID
        const metaItems = document.querySelectorAll('.user-meta .meta-item');
        if (metaItems.length >= 1 && user.gameId) {
            metaItems[0].innerHTML = '<i class="fas fa-gamepad"></i> 游戏ID: ' + user.gameId;
        }

        // 填充注册时间
        if (metaItems.length >= 3 && user.registerTime) {
            metaItems[2].innerHTML = '<i class="fas fa-calendar"></i> 注册时间: ' + user.registerTime;
        }
    } catch (err) {
        console.error('[加载用户信息失败]', err);
    }
}

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    loadUserProfile();

    // 订单弹窗Tab切换
    document.querySelectorAll('.orders-modal .tabs .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.orders-modal .tabs .tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
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
});

