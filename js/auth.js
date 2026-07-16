// ============================================
// 光遇陪玩团 - Supabase 认证模块（邮箱注册登录）
// ============================================

// 生成光之子编号
function generateGuangZhiZiName() {
    let maxNum = 0;
    const users = JSON.parse(localStorage.getItem('skyUserList') || '[]');
    users.forEach(u => {
        const match = u.username.match(/^光之子(\d+)$/);
        if (match) {
            const num = parseInt(match[1]);
            if (num > maxNum) maxNum = num;
        }
    });
    return '光之子' + (maxNum + 1);
}

// 保存用户名到用户列表
function saveUserName(username) {
    const users = JSON.parse(localStorage.getItem('skyUserList') || '[]');
    users.push({ username: username, time: new Date().toISOString() });
    localStorage.setItem('skyUserList', JSON.stringify(users));
}

// 检查登录状态
async function checkAuthStatus() {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session) {
            const user = {
                id: session.user.id,
                email: session.user.email,
                username: session.user.user_metadata?.username || generateGuangZhiZiName(),
                game_id: session.user.user_metadata?.game_id || ''
            };
            localStorage.setItem('skyUser', JSON.stringify(user));
            updateNavUser();
        } else {
            localStorage.removeItem('skyUser');
            updateNavUser();
        }
    } catch (err) {
        console.error('检查登录状态失败:', err);
    }
}

// 登录
async function handleLogin(email, password) {
    try {
        console.log("尝试登录邮箱:", email);
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            showNotification('登录失败：' + error.message, 'error');
            return false;
        }
        
        if (data.user) {
            // 生成光之子用户名
            const gzName = generateGuangZhiZiName();
            saveUserName(gzName);
            
            const user = {
                id: data.user.id,
                email: data.user.email,
                username: gzName,
                game_id: data.user.user_metadata?.game_id || '',
                register_time: new Date().toISOString()
            };
            localStorage.setItem('skyUser', JSON.stringify(user));
            updateNavUser();
            showNotification('登录成功！欢迎回来 ~', 'success');
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 1000);
            return true;
        }
        return false;
    } catch (err) {
        console.error('登录错误:', err);
        showNotification('登录失败，请重试', 'error');
        return false;
    }
}

// 注册（使用真实邮箱，注册后跳转回登录页）
async function handleRegister(email, gameId, password) {
    try {
        console.log("尝试注册邮箱:", email);
        const { data, error } = await window.supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    game_id: gameId
                }
            }
        });
        
        if (error) {
            showNotification('注册失败：' + error.message, 'error');
            return false;
        }
        
        if (data.user) {
            showNotification('注册成功！请使用邮箱和密码登录', 'success');
            setTimeout(() => {
                switchAuthTab('login');
            }, 2000);
            return true;
        }
        return false;
    } catch (err) {
        console.error('注册错误:', err);
        showNotification('注册失败，请重试', 'error');
        return false;
    }
}

// 退出登录
async function handleLogoutAction() {
    try {
        await window.supabaseClient.auth.signOut();
        localStorage.removeItem('skyUser');
        updateNavUser();
        showNotification('已退出登录', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 500);
    } catch (err) {
        console.error('退出登录错误:', err);
    }
}

// 显示通知
function showNotification(message, type) {
    const old = document.querySelector('.notification-toast');
    if (old) old.remove();
    
    const notif = document.createElement('div');
    notif.className = 'notification-toast notification-' + type;
    notif.innerHTML = '<div class="notification-content">' + message + '</div>';
    notif.style.cssText = 'position:fixed;top:80px;right:20px;padding:16px 24px;border-radius:12px;color:white;font-weight:600;z-index:10000;animation:slideInRight 0.3s ease;box-shadow:0 4px 20px rgba(0,0,0,0.15);';
    
    if (type === 'success') {
        notif.style.background = 'linear-gradient(135deg, #4CAF50, #66BB6A)';
    } else {
        notif.style.background = 'linear-gradient(135deg, #f44336, #e57373)';
    }
    
    document.body.appendChild(notif);
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transition = 'opacity 0.3s';
        setTimeout(() => notif.remove(), 3000);
    }, 3000);
}

// 页面加载时检查登录状态
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
});

// 暴露全局函数
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogoutAction = handleLogoutAction;
window.generateGuangZhiZiName = generateGuangZhiZiName;
