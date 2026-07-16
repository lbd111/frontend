// 登录注册页面交互

function switchAuthTab(tab) {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginPanel = document.getElementById('loginPanel');
    const registerPanel = document.getElementById('registerPanel');

    if (tab === 'login') {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginPanel.classList.add('active');
        registerPanel.classList.remove('active');
    } else {
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        registerPanel.classList.add('active');
        loginPanel.classList.remove('active');
    }
}

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        showNotification('请填写完整信息', 'error');
        return;
    }
    
    console.log('[登录] 发送请求到 http://localhost:3000/api/login');
    
    fetch('http://localhost:3000/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username: username, password: password })
    })
    .then(res => {
        console.log('[登录] 收到响应, status:', res.status);
        return res.json();
    })
    .then(data => {
        console.log('[登录] 响应数据:', data);
        if (data.success) {
            localStorage.setItem('skyUser', JSON.stringify(data.user));
            showNotification(data.message, 'success');
            updateNavUser();
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 1000);
        } else {
            showNotification(data.message, 'error');
        }
    })
    .catch(err => {
        console.error('[登录] 错误:', err);
        showNotification('后端服务未运行，请先启动 G:\\Skypw\\server.js', 'error');
    });
}

function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('regUsername').value;
    const gameId = document.getElementById('regGameId').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const agreed = document.getElementById('agreeTerms').checked;

    if (password !== confirmPassword) {
        showNotification('两次输入的密码不一致', 'error');
        return;
    }
    if (!agreed) {
        showNotification('请先同意用户协议', 'error');
        return;
    }

    console.log('[注册] 发送请求到 http://localhost:3000/api/register');
    
    fetch('http://localhost:3000/api/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            username: username,
            gameId: gameId,
            password: password
        })
    })
    .then(res => {
        console.log('[注册] 收到响应, status:', res.status);
        return res.json();
    })
    .then(data => {
        console.log('[注册] 响应数据:', data);
        if (data.success) {
            showNotification(data.message, 'success');
            updateNavUser();
            setTimeout(() => {
                switchAuthTab('login');
                document.getElementById('loginUsername').value = username;
            }, 1500);
        } else {
            showNotification(data.message, 'error');
        }
    })
    .catch(err => {
        console.error('[注册] 错误:', err);
        showNotification('后端服务未运行，请先启动 G:\\Skypw\\server.js', 'error');
    });
}

function showNotification(message, type) {
    const colors = { success: '#4CAF50', error: '#f44336', info: '#2196F3' };
    const bgColor = colors[type] || '#4FC3F7';
    const notification = document.createElement('div');
    notification.style.position = 'fixed';
    notification.style.top = '90px';
    notification.style.right = '20px';
    notification.style.zIndex = '9999';
    notification.style.padding = '16px 24px';
    notification.style.borderRadius = '12px';
    notification.style.color = 'white';
    notification.style.fontSize = '0.95rem';
    notification.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
    notification.style.background = bgColor;
    notification.style.animation = 'slideInRight 0.3s ease';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(function() {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100px)';
        notification.style.transition = 'all 0.3s ease';
        setTimeout(function() { notification.remove(); }, 300);
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    const user = localStorage.getItem('skyUser');
    if (user) {
        const userData = JSON.parse(user);
        showNotification('欢迎回来, ' + userData.name, 'success');
    }
});
