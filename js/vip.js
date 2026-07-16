// ============================================
// 光遇陪玩团 - 会员中心交互
// ============================================

// --- 会员开通弹窗 ---
function showVipModal(plan) {
    const modal = document.getElementById('vipModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // 预选对应套餐
        if (plan) {
            const radios = document.querySelectorAll('input[name=\"plan\"]');
            radios.forEach(r => r.checked = false);
        }
    }
}

function closeVipModal() {
    const modal = document.getElementById('vipModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// --- 价格计算 ---
document.addEventListener('DOMContentLoaded', () => {
    const prices = { month: 29.9, quarter: 79.9, year: 259.9 };
    const radios = document.querySelectorAll('input[name=\"plan\"]');

    radios.forEach(radio => {
        radio.addEventListener('change', () => {
            const total = document.getElementById('vipTotalPrice');
            if (total) {
                total.textContent = '￥' + prices[radio.value].toFixed(2);
            }
        });
    });

    // 开通会员表单
    const vipForm = document.getElementById('vipForm');
    if (vipForm) {
        vipForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const plan = document.querySelector('input[name=\"plan\"]:checked').value;
            const planNames = { month: '月度', quarter: '季度', year: '年度' };
            alert('会员开通成功！\\n' + planNames[plan] + '会员已生效~');
            closeVipModal();
        });
    }
});
