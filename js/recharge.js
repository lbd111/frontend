// ============================================
// BJ陪玩团 - 充值中心交互
// ============================================

let selectedRechargeAmount = 1;

// --- 选择充值方案 ---
function selectPlan(card, amount) {
    document.querySelectorAll('.plan-card').forEach(c => c.style.borderColor = '');
    card.style.borderColor = 'var(--primary)';
    selectedRechargeAmount = amount;
    updateRechargeModal(amount);
    showRechargeModal();
}

function selectCustomPlan(card) {
    showCustomAmountModal();
}

// --- 自定义金额弹窗 ---
function showCustomAmountModal() {
    const modal = document.getElementById('customAmountModal');
    const input = document.getElementById('customAmountInput');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 100);
        }
    }
}

function closeCustomAmountModal() {
    const modal = document.getElementById('customAmountModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function confirmCustomAmount() {
    const input = document.getElementById('customAmountInput');
    const amount = input ? input.value : '';
    if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
        selectedRechargeAmount = parseFloat(amount);
        updateRechargeModal(selectedRechargeAmount);
        closeCustomAmountModal();
        showRechargeModal();
    } else {
        showNotification('请输入有效的充值金额', 'error');
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
        const onclickAttr = firstCard.getAttribute('onclick');
        const match = onclickAttr && onclickAttr.match(/selectPlan\(this,\s*([\d.]+)\)/);
        if (match) {
            selectedRechargeAmount = parseFloat(match[1]);
        }
    }

    // 从数据库加载余额并更新页面
    syncBalanceFromDB();

    // 充值表单
    const rechargeForm = document.getElementById('rechargeForm');
    if (rechargeForm) {
        rechargeForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const userStr = localStorage.getItem('skyUser');
            if (!userStr) {
                showNotification('请先登录', 'error');
                return;
            }

            // 取 access_token
            let token = null;
            try {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                token = session?.access_token;
            } catch (err) {
                console.error('获取 session 失败:', err);
            }
            if (!token) {
                showNotification('登录状态已过期，请重新登录', 'error');
                return;
            }

            // 支付方式映射
            const paymentRadio = document.querySelector('input[name="payment"]:checked');
            const channelMap = { wechat: 'wxpay', alipay: 'alipay' };
            const channel = channelMap[paymentRadio?.value] || 'wxpay';

            try {
                const res = await fetch(window.API_BASE + '/api/checkout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        item: 'recharge',
                        amount: selectedRechargeAmount,
                        channel: channel
                    })
                });

                const data = await res.json();
                if (!res.ok || data.code !== 1) {
                    showNotification(data.error || data.detail?.msg || '下单失败，请重试', 'error');
                    return;
                }

                // 跳转到 mpay 收银台
                window.location.href = data.payurl;
            } catch (err) {
                console.error('充值下单异常:', err);
                showNotification('网络错误，无法连接支付服务器', 'error');
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