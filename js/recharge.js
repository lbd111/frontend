// ============================================
// 光遇陪玩团 - 充值中心交互
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

    // 充值表单
    const rechargeForm = document.getElementById('rechargeForm');
    if (rechargeForm) {
        rechargeForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const balanceEl = document.getElementById('balanceValue');
            if (balanceEl) {
                const current = parseFloat(balanceEl.textContent.replace('¥','').trim()) || 0;
                balanceEl.textContent = '¥' + (current + selectedRechargeAmount).toFixed(2);
            }
            closeRechargeModal();
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




