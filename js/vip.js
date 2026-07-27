// ============================================
// BJ陪玩团 - 会员中心交互
// --- 卡片式提示框 ---
function showCardMessage(title, message, type) {
    // Remove existing overlay if any
    const existing = document.getElementById('cardMsgOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cardMsgOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
    
    const bgColor = type === 'success' ? '#4CAF50' : (type === 'error' ? '#f44336' : '#4facfe');
    const icon = type === 'success' ? '&#10004;' : (type === 'error' ? '&#10008;' : '&#9888;');
    
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:20px;padding:30px;max-width:380px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.2);text-align:center;">
            <div style="width:56px;height:56px;border-radius:50%;background:${bgColor};display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px;color:white;">${icon}</div>
            <h3 style="margin:0 0 10px;color:#1a1a2e;font-size:18px;">${title}</h3>
            <p style="margin:0 0 24px;color:#666;font-size:14px;line-height:1.7;white-space:pre-line;">${message}</p>
            <button id="cardMsgOkBtn" style="background:${bgColor};color:white;border:none;border-radius:10px;padding:10px 40px;font-size:15px;font-weight:600;cursor:pointer;width:100%;">确 定</button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    overlay.querySelector('#cardMsgOkBtn').addEventListener('click', () => {
        overlay.remove();
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}
// ============================================

const VIP_PRICE_MONTHLY = 9.9;

// --- 会员开通弹窗 ---
function showVipModal(plan) {
    const modal = document.getElementById('vipModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeVipModal() {
    const modal = document.getElementById('vipModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// --- 自定义确认对话框（卡片样式） ---
function confirmVip(message) {
    // Remove existing overlay if any
    const existing = document.getElementById('vipConfirmOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'vipConfirmOverlay';
    overlay.className = 'modal-overlay active';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
    
    overlay.innerHTML = `
        <div class="modal vip-confirm-card" style="background:#fff;border-radius:20px;padding:30px;max-width:380px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.2);text-align:center;">
            <div style="font-size:40px;margin-bottom:10px;">👑</div>
            <h3 style="margin:0 0 15px;color:#1a1a2e;font-size:20px;">确认开通 VIP 会员？</h3>
            <div style="background:#f8f9fa;border-radius:12px;padding:15px;margin-bottom:20px;text-align:left;line-height:1.8;color:#333;white-space:pre-line;">${message}</div>
            <div style="display:flex;gap:12px;">
                <button id="vipCancelBtn" style="flex:1;padding:12px 20px;border:2px solid #ddd;border-radius:12px;background:#fff;color:#666;font-size:15px;cursor:pointer;">取消</button>
                <button id="vipConfirmBtn" style="flex:1;padding:12px 20px;border:none;border-radius:12px;background:linear-gradient(135deg,#FFD700,#FFA500);color:#fff;font-size:15px;font-weight:bold;cursor:pointer;">确认开通</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    return new Promise((resolve) => {
        overlay.querySelector('#vipCancelBtn').addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
        overlay.querySelector('#vipConfirmBtn').addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(false);
            }
        });
    });
}

// --- 加载用户会员状态 ---
async function loadMemberStatus() {
    try {
        const userStr = localStorage.getItem('skyUser');
        if (!userStr) return;
        const user = JSON.parse(userStr);

        const { data: profile, error } = await window.supabaseClient
            .from('profiles')
            .select('level, vip_expire_at, balance')
            .eq('id', user.id)
            .single();

        const levelEl = document.getElementById('memberLevel');
        const statusCard = document.querySelector('.status-actions');
        const allBtns = document.querySelectorAll('#activateVipBtn');
        
        if (!profile || !profile.level) {
            if (levelEl) levelEl.textContent = '普通会员（未开通）';
            if (statusCard) statusCard.innerHTML = '';
            allBtns.forEach(b => { b.style.display = ''; b.disabled = false; b.onclick = function(){ showVipModal(); }; });
            return;
        }

        const isVip = profile.level.includes('VIP');
        const expireAt = profile.vip_expire_at;
        const now = new Date();
        const expired = isVip && expireAt && new Date(expireAt) < now;

        if (isVip && !expired) {
            if (levelEl) levelEl.textContent = 'VIP会员（已开通）';
            if (statusCard) {
                var expStr = '';
                try { expStr = new Date(expireAt).toLocaleDateString('zh-CN'); } catch(e) { expStr = '长期有效'; }
                statusCard.innerHTML = '<span style="color:#4CAF50;font-size:14px;"><i class="fas fa-check-circle"></i> 会员权益已生效</span><br><span style="color:#888;font-size:12px;margin-top:4px;display:inline-block;">到期时间：' + expStr + '</span>';
            }
            allBtns.forEach(b => { b.style.display = 'none'; });
        } else if (expired) {
            if (levelEl) levelEl.textContent = 'VIP会员（已过期）';
            if (statusCard) {
                statusCard.innerHTML = '<span style="color:#f44336;font-size:14px;"><i class="fas fa-exclamation-circle"></i> 会员已过期，请重新开通</span>';
            }
            allBtns.forEach(b => { b.style.display = ''; b.disabled = false; b.onclick = function(){ showVipModal(); }; });
        } else {
            if (levelEl) levelEl.textContent = '普通会员（未开通）';
            if (statusCard) statusCard.innerHTML = '';
            allBtns.forEach(b => { b.style.display = ''; b.disabled = false; b.onclick = function(){ showVipModal(); }; });
        }
    } catch (err) {
        console.error('加载会员状态失败:', err);
    }
}


// --- 开通会员 ---
async function activateVip() {
    console.log('activateVip called');
    console.log('localStorage skyUser:', localStorage.getItem('skyUser'));
    console.log('window.supabaseClient:', typeof window.supabaseClient);
    const userStr = localStorage.getItem('skyUser');
    if (!userStr) {
        showCardMessage('提示', '请先登录', 'error');
        return;
    }
    const user = JSON.parse(userStr);

    // 检查余额
    const { data: profile } = await window.supabaseClient
        .from('profiles')
        .select('balance')
        .eq('id', user.id)
        .single();

    const currentBalance = parseFloat(profile?.balance) || 0;

    if (currentBalance < VIP_PRICE_MONTHLY) {
        showCardMessage('余额不足', '需要 ￥' + VIP_PRICE_MONTHLY.toFixed(2) + '，当前余额 ￥' + currentBalance.toFixed(2) + '\n请先前往充值中心充值', 'error');
        return;
    }

    // 显示自定义确认卡片
    const confirmMsg = '费用：￥' + VIP_PRICE_MONTHLY.toFixed(2) + '\\n将从账户余额扣除\\n\\n开通后可享受：\\n• 全部基础功能\\n• 每周95折优惠券（无门槛）';
    const confirmed = await confirmVip(confirmMsg);
    if (!confirmed) return;

    // 扣款 + 开通
    const newBalance = (currentBalance - VIP_PRICE_MONTHLY).toFixed(2);

    const { error: updateErr } = await window.supabaseClient
        .from('profiles')
        .update({ level: "VIP会员", balance: newBalance, vip_expire_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() })
        .eq('id', user.id);

    if (updateErr) {
        showCardMessage('开通失败', updateErr.message, 'error');
        return;
    }

    // 更新 localStorage
    user.level = 'VIP会员';

    user.vip_expire_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem('skyUser', JSON.stringify(user));

    // 发放首周优惠券
    try {
        await window.supabaseClient
            .from('coupons')
            .insert({
                user_id: user.id,

                amount: 0.05,
                condition: '无门槛',
                used: false
            });
    } catch (e) {
        console.log('优惠券发放跳过:', e);
    }

    closeVipModal();
    loadMemberStatus();
    showCardMessage('开通成功', 'VIP会员开通成功！\n已发放首周95折优惠券（无门槛）', 'success');
}

// --- 表单提交（直接执行，不依赖DOMContentLoaded） ---
(function() {
    const vipForm = document.getElementById('vipForm');
    if (vipForm) {
        vipForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await activateVip();
        });
    }
    loadMemberStatus();
})();

// --- Global exports ---
window.showVipModal = showVipModal;
window.closeVipModal = closeVipModal;
window.activateVip = activateVip;
window.confirmVip = confirmVip;
