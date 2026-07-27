// ============================================
// BJ陪玩团 - 点单大厅交互
// ============================================

let currentFilter = 'all';
window.currentCategory = 'all';

// --- 筛选陪玩 ---
function filterWizards() {
    // 接单模式下复用同一搜索框，调用接单列表的筛选/加载
    if (window.currentRoleMode === 'serve') {
        if (typeof window.serveFilterWizards === 'function') {
            window.serveFilterWizards();
        }
        return;
    }

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
        if (window.currentCategory !== 'all') {
            matchesCategory = category.includes(window.currentCategory);
        }

        const matchesGame = card.dataset.game === window.currentGame;
        card.style.display = (matchesSearch && matchesFilter && matchesCategory && matchesGame) ? '' : 'none';
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
    // 接单模式下复用同一分类筛选
    if (window.currentRoleMode === 'serve') {
        if (typeof window.selectServeCategory === 'function') {
            window.selectServeCategory(card, category);
        }
        return;
    }

    window.currentCategory = category;
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





// 计算订单总价
function calcOrderTotal() {
    const hoursInput = document.querySelector('#orderForm input[type="number"]');
    const totalPriceEl = document.getElementById('orderTotalPrice');
    if (hoursInput && totalPriceEl) {
        const hours = parseInt(hoursInput.value) || 1;
        const total = (currentWizardPrice * hours).toFixed(2);
        totalPriceEl.textContent = '￥' + total;
    }
}


// --- 当前游戏类型 ---
window.currentGame = 'sky';

// --- 切换游戏服务 ---
function switchGame(game, btn) {
    window.currentGame = game;
    document.querySelectorAll('.game-switch-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    // Show/hide the corresponding categories section
    const skyCat = document.getElementById('sky-categories');
    const kingCat = document.getElementById('king-categories');
    if (skyCat) skyCat.style.display = game === 'sky' ? '' : 'none';
    if (kingCat) kingCat.style.display = game === 'king' ? '' : 'none';

    // Reset category UI to "全部服务"
    document.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
    const visibleSection = game === 'sky' ? skyCat : kingCat;
    if (visibleSection) {
        const firstCard = visibleSection.querySelector('.category-card');
        if (firstCard) firstCard.classList.add('active');
    }

    // 接单模式下复用同一游戏筛选
    if (window.currentRoleMode === 'serve') {
        if (window.serveFilterState) {
            window.serveFilterState.game = game;
            window.serveFilterState.category = 'all';
        }
        if (typeof window.loadServeModeList === 'function') {
            window.loadServeModeList();
        }
        return;
    }

    const cards = document.querySelectorAll('.wizard-list-card');
    cards.forEach(card => {
        card.style.display = card.dataset.game === game ? '' : 'none';
    });

    // Reset category
    window.currentCategory = 'all';
    filterWizards();
}

