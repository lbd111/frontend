// ============================================
// 光遇陪玩团 - 点单大厅交互
// ============================================

let currentFilter = 'all';
let currentCategory = 'all';

// --- 筛选陪玩 ---
function filterWizards() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const cards = document.querySelectorAll('.wizard-list-card');

    cards.forEach(card => {
        const name = card.querySelector('.card-info h3').textContent.toLowerCase();
        const desc = card.querySelector('.card-desc').textContent.toLowerCase();
        const skills = card.querySelector('.card-skills').textContent.toLowerCase();
        const matchesSearch = name.includes(searchTerm) || desc.includes(searchTerm) || skills.includes(searchTerm);

        const online = card.dataset.online;
        const type = card.dataset.type;
        let matchesFilter = true;

        if (currentFilter === 'online') matchesFilter = online === 'true';
        else if (currentFilter === 'vip') matchesFilter = type === 'vip';
        else if (currentFilter === 'master') matchesFilter = type === 'master';

        const category = card.dataset.category;
        let matchesCategory = true;
        if (currentCategory !== 'all') {
            matchesCategory = category.includes(currentCategory);
        }

        card.style.display = (matchesSearch && matchesFilter && matchesCategory) ? '' : 'none';
    });

    checkEmptyState();
}

// --- 设置筛选 ---
function setFilter(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    filterWizards();
}

// --- 选择分类 ---
function selectCategory(card, category) {
    currentCategory = category;
    document.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    filterWizards();
}

// --- 排序 ---
function sortWizards() {
    const sortBy = document.getElementById('sortSelect').value;
    const grid = document.getElementById('wizardList');
    const cards = Array.from(grid.querySelectorAll('.wizard-list-card'));

    cards.sort((a, b) => {
        switch (sortBy) {
            case 'price-low':
                return parseFloat(a.dataset.price) - parseFloat(b.dataset.price);
            case 'price-high':
                return parseFloat(b.dataset.price) - parseFloat(a.dataset.price);
            case 'rating':
                return parseFloat(b.dataset.rating) - parseFloat(a.dataset.rating);
            case 'orders':
                return parseInt(b.dataset.orders) - parseInt(a.dataset.orders);
            default:
                return 0;
        }
    });

    cards.forEach(card => grid.appendChild(card));
}

// --- 检查空状态 ---
function checkEmptyState() {
    const visibleCards = document.querySelectorAll('.wizard-list-card:not([style*=\"display: none\"])');
    const grid = document.getElementById('wizardList');
    let emptyState = document.querySelector('.empty-state');

    if (visibleCards.length === 0 && !emptyState) {
        emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = '<i class=\"fas fa-search\"></i><p>没有找到匹配的陪玩伙伴，试试其他筛选条件吧~</p>';
        grid.appendChild(emptyState);
    } else if (visibleCards.length > 0 && emptyState) {
        emptyState.remove();
    }
}

// --- 加载更多 ---
function loadMore() {
    const btn = event.target.closest('.btn');
    btn.innerHTML = '<i class=\"fas fa-spinner fa-spin\"></i> 加载中...';
    setTimeout(() => {
        btn.innerHTML = '<i class=\"fas fa-check\"></i> 已全部加载';
        btn.disabled = true;
        btn.style.opacity = '0.6';
    }, 1500);
}

// --- 初始化 ---
document.addEventListener('DOMContentLoaded', () => {
    filterWizards();
});
