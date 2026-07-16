// 陪玩成员页面交互
let currentMemberFilter = 'all';
let currentMemberLevel = 'all';

function filterMembers() {
    const search = document.getElementById('memberSearch').value.toLowerCase();
    const cards = document.querySelectorAll('.member-card');
    let visibleCount = 0;

    cards.forEach(card => {
        const name = card.dataset.name.toLowerCase();
        const bio = card.querySelector('.mc-bio').textContent.toLowerCase();
        const skills = card.dataset.skills.toLowerCase();
        const online = card.dataset.online;
        const level = card.dataset.level;

        const matchSearch = name.includes(search) || bio.includes(search) || skills.includes(search);
        const matchStatus = currentMemberFilter === 'all' ||
            (currentMemberFilter === 'online' && online === 'true') ||
            (currentMemberFilter === 'offline' && online === 'false');
        const matchLevel = currentMemberLevel === 'all' || level === currentMemberLevel;

        card.style.display = (matchSearch && matchStatus && matchLevel) ? '' : 'none';
        if (matchSearch && matchStatus && matchLevel) visibleCount++;
    });

    let emptyState = document.querySelector('.empty-state');
    if (visibleCount === 0 && !emptyState) {
        emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = '<i class="fas fa-search"></i><p>没有找到匹配的陪玩成员，试试其他筛选条件吧~</p>';
        document.getElementById('membersGrid').appendChild(emptyState);
    } else if (visibleCount > 0 && emptyState) {
        emptyState.remove();
    }
}

function setMemberFilter(filter, btn) {
    currentMemberFilter = filter;
    btn.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterMembers();
}

function setMemberLevel(level, btn) {
    currentMemberLevel = level;
    btn.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterMembers();
}

function sortMembers() {
    const sortBy = document.getElementById('memberSort').value;
    const grid = document.getElementById('membersGrid');
    const cards = Array.from(grid.querySelectorAll('.member-card'));

    cards.sort((a, b) => {
        switch(sortBy) {
            case 'rating': return parseFloat(b.dataset.rating) - parseFloat(a.dataset.rating);
            case 'orders': return parseInt(b.dataset.orders) - parseInt(a.dataset.orders);
            case 'price-low': return parseFloat(a.dataset.price) - parseFloat(b.dataset.price);
            case 'price-high': return parseFloat(b.dataset.price) - parseFloat(a.dataset.price);
            default: return 0;
        }
    });
    cards.forEach(c => grid.appendChild(c));
}

function showMemberDetail(name) {
    const card = document.querySelector(".member-card[data-name='" + name + "']");
    if (!card) return;
    
    const rating = card.dataset.rating;
    const orders = card.dataset.orders;
    const price = card.dataset.price;
    const bio = card.querySelector('.mc-bio').textContent;
    const skillNames = card.querySelectorAll('.mc-skill');
    const specs = card.querySelectorAll('.specialty');
    
    var skillsHtml = '';
    skillNames.forEach(function(s) { skillsHtml += '<span class="mc-skill">' + s.textContent + '</span>'; });
    
    var specsHtml = '';
    specs.forEach(function(s) { specsHtml += '<li>' + s.textContent + '</li>'; });

    const content = document.getElementById('memberDetailContent');
    content.innerHTML = 
        '<div class="detail-avatar"><i class="fas fa-user-circle"></i></div>' +
        '<h3 class="detail-name">' + name + '</h3>' +
        '<div class="detail-rating"><i class="fas fa-star"></i> ' + rating + '</div>' +
        '<div class="detail-stats">' +
            '<div class="detail-stat"><span class="ds-val">' + orders + '</span><span class="ds-label">完成订单</span></div>' +
            '<div class="detail-stat"><span class="ds-val">￥' + price + '</span><span class="ds-label">每小时</span></div>' +
        '</div>' +
        '<p class="detail-bio">' + bio + '</p>' +
        '<h4>擅长技能</h4>' +
        '<div class="detail-skills">' + skillsHtml + '</div>' +
        '<h4>专长标签</h4>' +
        '<ul class="detail-specs">' + specsHtml + '</ul>' +
        '<button class="btn btn-primary" onclick="closeMemberDetail(); showOrderModal(\x27' + name + '\x27, ' + price + ')">' +
            '<i class="fas fa-cart-plus"></i> 立即点单' +
        '</button>'
    ;
    
    const modal = document.getElementById('memberDetailModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeMemberDetail() {
    const modal = document.getElementById('memberDetailModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function loadMoreMembers() {
    const btn = event.target.closest('.btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载中...';
    setTimeout(() => {
        btn.innerHTML = '<i class="fas fa-check"></i> 已全部加载';
        btn.disabled = true;
        btn.style.opacity = '0.6';
    }, 1500);
}

// 点击弹窗外部关闭
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
    }
});

document.addEventListener('DOMContentLoaded', () => { filterMembers(); });

