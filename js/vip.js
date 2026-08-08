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

        // 优先走后端代理，避免本地 file:// 打开时 Supabase REST 因 JWT iat future 401
        let profile = null;
        try {
            const token = typeof window.getSupabaseToken === 'function' ? window.getSupabaseToken() : null;
            if (token) {
                const res = await window.fetchWithTimeout(window.getApiBase() + '/api/profile-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({})
                }, 10000);
                if (res.ok) {
                    const result = await res.json();
                    if (result.code === 1 && result.data && result.data.profile) {
                        profile = result.data.profile;
                    }
                }
            }
        } catch (apiErr) {
            console.warn('vip loadMemberStatus api fallback:', apiErr);
        }

        // 后端失败则用本地缓存兜底
        if (!profile && user) {
            profile = {
                level: user.level,
                vip_expire_at: user.vip_expire_at,
                balance: user.balance
            };
        }

        const levelEl = document.getElementById('memberLevel');
        const statusInfo = document.querySelector('.status-info');
        const allBtns = document.querySelectorAll('.activate-vip-btn');
        const statusCard = document.querySelector('.status-actions');

        // 重置按钮状态
        allBtns.forEach(b => {
            b.style.display = '';
            b.disabled = false;
            b.onclick = function(){ showVipModal(); };
        });

        if (!profile || !profile.level) {
            if (levelEl) levelEl.textContent = '普通会员（未开通）';
            if (statusInfo) {
                var existing = statusInfo.querySelector('.vip-status-extra');
                if (existing) existing.remove();
            }
            return;
        }

        const isVip = profile.level.includes('VIP');
        const expireAt = profile.vip_expire_at;
        const now = new Date();
        const expired = isVip && expireAt && new Date(expireAt) < now;

        if (isVip && !expired) {
            if (levelEl) levelEl.textContent = 'VIP会员（已开通）';
            var expStr = '';
            try { expStr = new Date(expireAt).toLocaleDateString('zh-CN'); } catch(e) { expStr = '长期有效'; }
            if (statusInfo) {
                var existing = statusInfo.querySelector('.vip-status-extra');
                if (!existing) {
                    existing = document.createElement('p');
                    existing.className = 'vip-status-extra';
                    existing.style.cssText = 'margin:6px 0 0;color:#4CAF50;font-size:14px;';
                    statusInfo.appendChild(existing);
                }
                existing.innerHTML = '<i class="fas fa-check-circle"></i> 会员权益已生效<br><span style="color:#888;font-size:12px;">到期时间：' + expStr + '</span>';
            }
            allBtns.forEach(b => { b.style.display = 'none'; });
        } else if (expired) {
            if (levelEl) levelEl.textContent = 'VIP会员（已过期）';
            if (statusInfo) {
                var existing = statusInfo.querySelector('.vip-status-extra');
                if (!existing) {
                    existing = document.createElement('p');
                    existing.className = 'vip-status-extra';
                    existing.style.cssText = 'margin:6px 0 0;color:#f44336;font-size:14px;';
                    statusInfo.appendChild(existing);
                }
                existing.innerHTML = '<i class="fas fa-exclamation-circle"></i> 会员已过期，请重新开通';
            }
        } else {
            if (levelEl) levelEl.textContent = '普通会员（未开通）';
            if (statusInfo) {
                var existing = statusInfo.querySelector('.vip-status-extra');
                if (existing) existing.remove();
            }
        }
    } catch (err) {
        console.error('加载会员状态失败:', err);
    }
}


// --- 开通会员 ---
async function activateVip() {
    const userStr = localStorage.getItem('skyUser');
    if (!userStr) {
        showCardMessage('提示', '请先登录', 'error');
        return;
    }
    const user = JSON.parse(userStr);

    // 取 access_token 用于调用 BJ 支付中台
    let token = null;
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        token = session?.access_token;
    } catch (e) {
        console.error('获取 session 失败:', e);
    }
    if (!token) {
        showCardMessage('提示', '登录状态已过期，请重新登录', 'error');
        return;
    }

    // 显示自定义确认卡片
    const confirmMsg = '费用：￥' + VIP_PRICE_MONTHLY.toFixed(2) + '\n将跳转至微信/支付宝扫码支付\n\n开通后可享受：\n• 全部基础功能\n• 每周95折优惠券（无门槛）';
    const confirmed = await confirmVip(confirmMsg);
    if (!confirmed) return;

    try {
        const res = await fetch(window.API_BASE + '/api/checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                item: 'vip_month',
                amount: VIP_PRICE_MONTHLY,
                channel: 'wxpay'
            })
        });

        const data = await res.json();
        if (!res.ok || data.code !== 1) {
            showCardMessage('下单失败', data.error || data.detail?.msg || '请稍后重试', 'error');
            return;
        }

        // 跳转到 mpay 收银台
        window.location.href = data.payurl;
    } catch (err) {
        console.error('VIP 下单异常:', err);
        showCardMessage('网络错误', '无法连接支付服务器，请检查网络', 'error');
    }
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
