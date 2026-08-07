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
        loadTransferRecords();
    }
}

function closeTransferModal() {
    const modal = document.getElementById('transferModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// 从后端拉取当前用户的充值/支付记录并渲染
async function loadTransferRecords() {
    const listEl = document.getElementById('recordsList');
    if (!listEl) return;

    listEl.innerHTML = '<div class="records-loading">加载中...</div>';

    let token = null;
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        token = session?.access_token;
    } catch (e) {
        console.error('获取 session 失败:', e);
    }
    if (!token) {
        listEl.innerHTML = '<div class="records-empty">请先登录后查看充值记录</div>';
        return;
    }

    try {
        const res = await fetch(window.API_BASE + '/api/payment-records', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok || data.code !== 1) {
            listEl.innerHTML = '<div class="records-empty">记录加载失败，请稍后重试</div>';
            return;
        }

        const records = data.records || [];
        if (!records.length) {
            listEl.innerHTML = '<div class="records-empty">暂无充值记录</div>';
            return;
        }

        listEl.innerHTML = records.map(r => {
            const date = formatDateTime(r.created_at || r.paid_at);
            const channelIcon = r.channel === 'alipay' ? 'fab fa-alipay' : 'fab fa-weixin';
            const channelName = r.channel === 'alipay' ? '支付宝' : '微信支付';
            const statusTag = r.status === 'paid'
                ? ''
                : ` <span class="record-status record-status-${r.status}">${r.status === 'pending' ? '待支付' : '失败'}</span>`;
            const sign = r.status === 'paid' ? '+' : '';
            return `<div class="record-item" data-order-no="${r.bj_order_no}">
                <div class="record-info">
                    <span class="record-date">${date}</span>
                    <span class="record-method"><i class="${channelIcon}"></i> ${channelName}${statusTag}</span>
                    <span class="record-orderno">订单号：${r.bj_order_no}</span>
                </div>
                <div class="record-right" style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                    <div class="record-amount">${sign}￥${parseFloat(r.amount).toFixed(2)}</div>
                    <button class="record-delete" title="删除此记录" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;background:transparent;color:#bdbdbd;border-radius:50%;cursor:pointer;font-size:0.85rem;padding:0;" onmouseover="this.style.background='#ffebee';this.style.color='#c62828';" onmouseout="this.style.background='transparent';this.style.color='#bdbdbd';" onclick="deleteTransferRecord('${r.bj_order_no}', this)">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        console.error('加载充值记录异常:', err);
        listEl.innerHTML = '<div class="records-empty">网络错误，无法连接服务器</div>';
    }
}

// 删除单条充值记录
async function deleteTransferRecord(bjOrderNo, btnEl) {
    if (!bjOrderNo) return;
    if (!confirm('确定要删除这条充值记录吗？')) return;

    let token = null;
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        token = session?.access_token;
    } catch (e) {
        console.error('获取 session 失败:', e);
    }
    if (!token) {
        showNotification('请先登录', 'error');
        return;
    }

    // 按钮临时禁用并显示删除中
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        const res = await fetch(window.API_BASE + '/api/payment-records/' + encodeURIComponent(bjOrderNo), {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();

        if (!res.ok || data.code !== 1) {
            showNotification(data.error || '删除失败', 'error');
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerHTML = '<i class="fas fa-trash-alt"></i>';
            }
            return;
        }

        // 删除成功后移除该行并刷新列表
        const row = document.querySelector(`.record-item[data-order-no="${bjOrderNo}"]`);
        if (row) {
            row.style.transition = 'all 0.25s ease';
            row.style.opacity = '0';
            row.style.transform = 'translateX(20px)';
            setTimeout(() => {
                row.remove();
                // 如果删完没有记录了，显示空状态
                if (!document.querySelector('.record-item')) {
                    const listEl = document.getElementById('recordsList');
                    if (listEl) listEl.innerHTML = '<div class="records-empty">暂无充值记录</div>';
                }
            }, 250);
        }
        showNotification('已删除', 'success');
    } catch (err) {
        console.error('删除充值记录异常:', err);
        showNotification('网络错误，删除失败', 'error');
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = '<i class="fas fa-trash-alt"></i>';
        }
    }
}

// 将 MySQL DATETIME / ISO 字符串格式化为 YYYY-MM-DD HH:mm
function formatDateTime(str) {
    if (!str) return '';
    // 兼容 "2026-08-07T13:40:09.000Z" 与 "2026-08-07 13:40:09"
    const d = new Date(str.replace(' ', 'T'));
    if (isNaN(d.getTime())) return str;
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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