// 下载页面交互

function startDownload(platform) {
    const names = {
        windows: 'Windows客户端',
        android: 'Android安装包',
        ios: 'iOS安装包'
    };
    
    // 模拟下载
    const btn = event.target.closest('.btn-download-btn');
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 准备下载...';
    btn.disabled = true;
    
    setTimeout(() => {
        btn.innerHTML = '<i class="fas fa-check"></i> 下载已开始';
        btn.style.background = 'linear-gradient(135deg, #4CAF50, #2E7D32)';
        
        setTimeout(() => {
            btn.innerHTML = original;
            btn.disabled = false;
            btn.style.background = '';
        }, 3000);
    }, 1500);
}

function toggleFaq(btn) {
    const answer = btn.nextElementSibling;
    const isOpen = btn.classList.contains('active');
    
    // 关闭所有
    document.querySelectorAll('.faq-question').forEach(q => {
        q.classList.remove('active');
        q.nextElementSibling.style.maxHeight = '0';
    });
    
    if (!isOpen) {
        btn.classList.add('active');
        answer.style.maxHeight = answer.scrollHeight + 'px';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 检查浏览器类型并高亮推荐
    const isWin = navigator.platform.indexOf('Win') > -1;
    if (isWin) {
        const featured = document.querySelector('.download-card.featured');
        if (featured) {
            featured.style.borderColor = '#4CAF50';
        }
    }
});




