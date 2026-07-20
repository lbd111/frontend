// ============================================
// BJ陪玩团 - Supabase 认证模块
// ============================================

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

function saveUserName(username) {
    const users = JSON.parse(localStorage.getItem('skyUserList') || '[]');
    users.push({ username: username, time: new Date().toISOString() });
    localStorage.setItem('skyUserList', JSON.stringify(users));
}

async function getCurrentSession() {
    try {
        const { data: { session }, error } = await window.supabaseClient.auth.getSession();
        if (error) {
            console.error('获取 session 失败:', error);
            return null;
        }
        return session;
    } catch (err) {
        console.error('获取 session 异常:', err);
        return null;
    }
}

async function checkAuthStatus() {
    try {
        const session = await getCurrentSession();
        if (session) {
            // 默认使用邮箱前缀作为显示名称
            const displayName = session.user.email?.split('@')[0] || '玩家';

            let avatar = '';
            try {
                const pr = await window.supabaseClient.from('profiles').select('avatar_url').eq('id', session.user.id).single();
                if (pr.data?.avatar_url) avatar = pr.data.avatar_url;
            } catch(e) {}
            
            const user = {
                id: session.user.id,
                email: session.user.email,
                username: displayName,
                game_id: session.user.user_metadata?.game_id || '',
                avatar: avatar
            };
            localStorage.setItem('skyUser', JSON.stringify(user));
            if (typeof updateNavUser === 'function') updateNavUser();
        } else {
            localStorage.removeItem('skyUser');
            if (typeof updateNavUser === 'function') updateNavUser();
        }
    } catch (err) {
        console.error('检查登录状态失败:', err);
    }
}

async function handleLogin(email, password) {
    try {
        console.log('尝试登录邮箱:', email);
        
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            const msg = error.message.toLowerCase();
            if (msg.includes('invalid') || msg.includes('password') || msg.includes('credentials')) {
                showNotification('密码错误，请重试', 'error');
            } else if (msg.includes('user not found') || msg.includes('no user') || msg.includes('does not exist')) {
                showNotification('账号不存在，请先注册', 'error');
            } else {
                showNotification('登录失败：' + error.message, 'error');
            }
            return false;
        }
        
        if (data.user) {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 先从数据库查最新的 nickname
            var displayName = data.user.email?.split('@')[0] || '玩家';
            try {
                var profileRes = await window.supabaseClient.from("profiles").select("nickname,avatar_url").eq("id", data.user.id).single();
                if (profileRes.data && profileRes.data.nickname) {
                    displayName = profileRes.data.nickname;
                }
            } catch(e) {}
            
            const user = {
                id: data.user.id,
                email: data.user.email,
                username: displayName,
                game_id: data.user.user_metadata?.game_id || '',
                avatar: profileRes.data?.avatar_url || ''
            };
            localStorage.setItem('skyUser', JSON.stringify(user));
            if (typeof updateNavUser === 'function') updateNavUser();
            showNotification('登录成功！欢迎回来~', 'success');
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

async function handleRegister(email, gameId, password) {
    try {
        console.log('尝试注册邮箱:', email);
        
        const { data, error } = await window.supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    game_id: gameId,
                    username: email.split('@')[0]
                }
            }
        });
        
        if (error) {
            const errMsg = error.message.toLowerCase();
            if (errMsg.includes('already') || errMsg.includes('taken') || errMsg.includes('exist') || errMsg.includes('registered')) {
                showNotification('该邮箱已注册账号，请直接登录', 'error');
            } else {
                showNotification('注册失败：' + error.message, 'error');
            }
            return false;
        }
        
        if (data.user) {
            try {
                await window.supabaseClient
                    .from('profiles')
                    .insert({
                        id: data.user.id,
                        email: email,
                        nickname: email.split('@')[0],
                        game_id: gameId,
                        level: '普通玩家',
                        balance: 0.00,
                        avatar_url: '',
                        bio: '',
                        server: ''
                    });
            } catch (profileErr) {
                console.log('Profile creation skipped:', profileErr);
            }
            
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

async function handleLogoutAction() {
    try {
        await window.supabaseClient.auth.signOut();
        localStorage.removeItem('skyUser');
        localStorage.removeItem('skyUserList');
        if (typeof updateNavUser === 'function') updateNavUser();
        showNotification('已退出登录', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 500);
    } catch (err) {
        console.error('退出登录错误:', err);
    }
}

function showNotification(message, type) {
    const old = document.querySelector('.notification-toast');
    if (old) old.remove();
    
    const notif = document.createElement('div');
    notif.className = 'notification-toast notification-' + type;
    notif.innerHTML = '<div class=\"notification-content\">' + message + '</div>';
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

document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
});

window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogoutAction = handleLogoutAction;
window.generateGuangZhiZiName = generateGuangZhiZiName;
window.getCurrentSession = getCurrentSession;
