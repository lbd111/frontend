// ============================================
// BJ陪玩团 - 充值中心交互
// ============================================

let selectedRechargeAmount = 50;

// --- 选择充值方案 ---
function selectPlan(card, amount) {
    document.querySelectorAll('.plan-card').forEach(c => c.style.borderColor = '');
    card.style.borderColor = 'var(--primary)';
    selectedRechargeAmount = amount;
    updateRechargeModal(amount);
}

function selectCustomPlan(card) {
    const amount = prompt('请输入充值金额（元）：');
    if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
        selectedRechargeAmount = parseFloat(amount);
        updateRechargeModal(selectedRechargeAmount);
    }
}

// --- 更新充值弹窗 ---
function updateRechargeModal(amount) {
    const el = document.getElementById('selectedAmount');
    if (el) {
        el.textContent = '￥' + amount.toFixed(2);
    }
}

// --- 充值弹窗 ---
function showRechargeModal() {
    const modal = document.getElementById('rechargeModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeRechargeModal() {
    const modal = document.getElementById('rechargeModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// --- 转账记录弹窗 ---
function showTransferModal() {
    const modal = document.getElementById('transferModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeTransferModal() {
    const modal = document.getElementById('transferModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// --- 表单提交 ---
document.addEventListener('DOMContentLoaded', () => {
    // 默认选中第一个方案
    const firstCard = document.querySelector('.plan-card:not(.custom)');
    if (firstCard) {
        firstCard.style.borderColor = 'var(--primary)';
    }

    // 从数据库加载余额并更新页面
    syncBalanceFromDB();

    // 充值表单
    const rechargeForm = document.getElementById('rechargeForm');
    if (rechargeForm) {
        rechargeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const success = await updateBalance(selectedRechargeAmount);
            
            if (success) {
                // 重新同步余额
                await syncBalanceFromDB();
                closeRechargeModal();
                showNotification('充值成功！账户余额已更新', 'success');
            } else {
                showNotification('充值失败，请重试', 'error');
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
});