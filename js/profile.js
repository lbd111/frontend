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
    }

function showCoupons() {
    }

function showAddress() {
    }

function showWallet() {
    window.location.href = 'recharge.html';
}

function showSettings() {
    }

function showHelp() {
    }

function showAbout() {
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
        if (!userStr) {
            console.log('localStorage 中没有 skyUser');
            return;
        }

        const user = JSON.parse(userStr);
        console.log('加载用户数据:', user);

        // 填充用户名
        const nameEl = document.getElementById('userName');
        if (nameEl) {
            nameEl.textContent = user.username || user.name || '玩家';
        }

        // 填充游戏ID
        const gameIdEl = document.getElementById('gameIdValue');
        if (gameIdEl) {
            gameIdEl.textContent = user.game_id || user.gameId || '未设置';
        }

        // 填充注册时间
        const regTimeEl = document.getElementById('regTimeValue');
        if (regTimeEl) {
            const regTime = user.register_time || user.registerTime || new Date().toLocaleDateString('zh-CN');
            regTimeEl.textContent = regTime;
        }

        console.log('用户信息加载完成');
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
