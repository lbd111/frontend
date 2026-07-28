// 陪玩成员页面交互
let approvedMembers = [];
let currentMemberGame = 'sky';
let currentMemberCategory = 'all';

const SKILL_LABELS = {
    'tech': '技术',
    'entertain': '娱乐',
    'normal': '普陪',
    'piano': '琴陪',
    'treehole': '树洞',
    'three-love': '三恋',
    'dragon-taming': '驯龙',
    'substitute': '替身',
    'checkin': '打卡',
    'blindbox': '盲盒',
    'hang': '挂机陪',
    'photo-edit': '换情头',
    'send-heart': '送心',
    'sacrifice': '献祭',
    'record': '录歌',
    'sleep': '哄睡'
};

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getRelativeTime(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const created = new Date(timestamp).getTime();
    const diff = now - created;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return minutes + '分钟前';
    if (hours < 24) return hours + '小时前';
    return days + '天前';
}

function switchGame(game, btn) {
    currentMemberGame = game;
    currentMemberCategory = 'all';

    document.querySelectorAll('.game-switch-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const skySection = document.getElementById('sky-categories');
    const kingSection = document.getElementById('king-categories');
    if (skySection) skySection.style.display = game === 'sky' ? 'block' : 'none';
    if (kingSection) kingSection.style.display = game === 'king' ? 'block' : 'none';

    // reset active category to "all" in visible section
    const visibleSection = game === 'sky' ? skySection : kingSection;
    if (visibleSection) {
        visibleSection.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
        const allBtn = visibleSection.querySelector('.category-card');
        if (allBtn) allBtn.classList.add('active');
    }

    renderApprovedMembers();
}

function selectCategory(el, category) {
    currentMemberCategory = category;
    const section = el.closest('.categories-section');
    if (section) {
        section.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
    }
    el.classList.add('active');
    renderApprovedMembers();
}

function filterMembers() {
    renderApprovedMembers();
}

function showMemberDetail(memberId) {
    const m = approvedMembers.find(x => x.id === memberId);
    if (!m) return;

    const modal = document.getElementById('memberDetailModal');
    const content = document.getElementById('memberDetailContent');
    if (!modal || !content) return;

    const avatarInner = m.avatar
        ? '<img src="' + m.avatar + '" alt="">'
        : '<i class="fas fa-user-circle"></i>';
    const avatarHtml = '<div class="detail-avatar-wrap"><div class="detail-avatar">' + avatarInner + '</div></div>';
    const gameBadgeClass = m.game === 'king' ? 'king' : 'sky';
    const gameBadgeIcon = m.game === 'king' ? 'fa-gamepad' : 'fa-star';

    const skillsHtml = (m.skills && m.skills.length > 0)
        ? m.skills.map(s => '<span class="detail-skill-tag">' + escapeHtml(SKILL_LABELS[s] || s) + '</span>').join('')
        : '<span class="detail-empty">暂无服务类型</span>';

    const screenshotHtml = m.screenshot
        ? '<div class="detail-screenshot"><img src="' + m.screenshot + '" alt="游戏截图"></div>'
        : '<span class="detail-empty">暂无游戏截图</span>';

    const skyRows = [];
    if (m.skyName) {
        skyRows.push('<div class="detail-row"><span class="detail-label">光遇昵称</span><span class="detail-value">' + escapeHtml(m.skyName) + '</span></div>');
    }
    if (m.skyServer) {
        skyRows.push('<div class="detail-row"><span class="detail-label">光遇区服</span><span class="detail-value">' + escapeHtml(m.skyServer) + '</span></div>');
    } else if (m.skyGameId) {
        skyRows.push('<div class="detail-row"><span class="detail-label">光遇ID</span><span class="detail-value">' + escapeHtml(m.skyGameId) + '</span></div>');
    }

    const hasWzInfo = m.wzName || m.wzGameId || m.wzServer || m.wzWechat || m.wzRank;
    let wzSectionHtml = '';
    if (hasWzInfo) {
        const wzRows = [];
        if (m.wzName) wzRows.push('<div class="detail-row"><span class="detail-label">王者昵称</span><span class="detail-value">' + escapeHtml(m.wzName) + '</span></div>');
        if (m.wzGameId) wzRows.push('<div class="detail-row"><span class="detail-label">王者ID</span><span class="detail-value">' + escapeHtml(m.wzGameId) + '</span></div>');
        if (m.wzServer) wzRows.push('<div class="detail-row"><span class="detail-label">王者区服</span><span class="detail-value">' + escapeHtml(m.wzServer) + '</span></div>');
        if (m.wzWechat) wzRows.push('<div class="detail-row"><span class="detail-label">王者微信</span><span class="detail-value">' + escapeHtml(m.wzWechat) + '</span></div>');
        if (m.wzRank) wzRows.push('<div class="detail-row"><span class="detail-label">王者段位</span><span class="detail-value">' + escapeHtml(m.wzRank) + '</span></div>');
        wzSectionHtml = '<div class="detail-section"><div class="detail-section-title"><i class="fas fa-gamepad"></i> 王者信息</div>' + wzRows.join('') + '</div>';
    }

    content.innerHTML =
        '<div class="detail-header">' +
            avatarHtml +
            '<div class="detail-title">' +
                '<h3>' + escapeHtml(m.displayName) + '</h3>' +
                '<span class="detail-game-badge ' + gameBadgeClass + '"><i class="fas ' + gameBadgeIcon + '"></i> ' + escapeHtml(m.gameTypeLabel) + '</span>' +
            '</div>' +
        '</div>' +
        '<div class="detail-section">' +
            skyRows.join('') +
            '<div class="detail-row"><span class="detail-label">服务类型</span><div class="detail-value-tags">' + skillsHtml + '</div></div>' +
        '</div>' +
        wzSectionHtml +
        '<div class="detail-section">' +
            '<div class="detail-section-title"><i class="fas fa-user-edit"></i> 个人简介</div>' +
            '<p class="detail-bio">' + escapeHtml(m.bio || '暂无简介') + '</p>' +
        '</div>' +
        '<div class="detail-section">' +
            '<div class="detail-section-title"><i class="fas fa-image"></i> 游戏截图</div>' +
            '<div class="detail-screenshots">' + screenshotHtml + '</div>' +
        '</div>';

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

async function loadApprovedMembers() {
    const grid = document.getElementById('membersGrid');
    if (grid) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>加载中...</p></div>';
    }

    try {
        if (!window.supabaseClient) {
            throw new Error('Supabase 客户端未初始化');
        }

        const { data, error } = await window.supabaseClient
            .from('applications')
            .select('id, username, gyname, game_id, server, wechat, skills, game_type, bio, screenshot, apply_time, user_id, wz_name, wz_game_id, wz_server, wz_wechat, wz_rank, wz_bio, wz_skills')
            .eq('status', 'approved')
            .order('apply_time', { ascending: false });

        if (error) throw error;

        const apps = data || [];

        // 批量查询头像和评分
        const userIds = apps.map(a => a.user_id).filter(Boolean);
        const profileMap = {};
        if (userIds.length > 0) {
            try {
                const { data: profs } = await window.supabaseClient
                    .from('profiles')
                    .select('id, avatar_url, rating')
                    .in('id', userIds);
                (profs || []).forEach(p => { profileMap[p.id] = p; });
            } catch (e) {
                console.warn('获取头像失败:', e);
            }
        }

        approvedMembers = apps.map(app => {
            const p = profileMap[app.user_id] || {};
            let skills = [];
            if (app.skills) {
                if (Array.isArray(app.skills)) {
                    skills = app.skills;
                } else {
                    try { skills = JSON.parse(app.skills); } catch (e) {}
                }
            }
            const game = (app.game_type && String(app.game_type).includes('wangzhe')) ? 'king' : 'sky';
            const isWz = game === 'king';
            const displayName = app.username || '未知陪玩';
            const gameTypeLabel = isWz ? '王者荣耀' : '光·遇';
            const personalBio = isWz ? (app.wz_bio || app.bio || '') : (app.bio || app.wz_bio || '');
            let wzSkills = [];
            if (app.wz_skills) {
                if (Array.isArray(app.wz_skills)) wzSkills = app.wz_skills;
                else { try { wzSkills = JSON.parse(app.wz_skills); } catch (e) {} }
            }
            const serviceSkills = isWz && wzSkills.length > 0 ? wzSkills : skills;
            return {
                id: app.id,
                username: app.username || '',
                displayName: displayName,
                avatar: p.avatar_url || '',
                rating: p.rating,
                skills: serviceSkills,
                categories: ['all'].concat(serviceSkills),
                game: game,
                gameTypeLabel: gameTypeLabel,
                skyName: app.gyname || '',
                skyServer: app.server || '',
                skyGameId: app.game_id || '',
                wzName: app.wz_name || '',
                wzGameId: app.wz_game_id || '',
                wzServer: app.wz_server || '',
                wzWechat: app.wz_wechat || '',
                wzRank: app.wz_rank || '',
                bio: personalBio,
                apply_time: app.apply_time,
                online: true,
                screenshot: app.screenshot || ''
            };
        });

        renderApprovedMembers();
    } catch (err) {
        console.error('加载陪玩成员失败:', err);
        if (grid) {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>加载失败，请刷新重试</p></div>';
        }
    }
}

function renderApprovedMembers() {
    const grid = document.getElementById('membersGrid');
    if (!grid) return;

    const searchEl = document.getElementById('memberSearch');
    const search = searchEl ? searchEl.value.toLowerCase() : '';

    const filtered = approvedMembers.filter(m => {
        if (currentMemberGame && currentMemberGame !== 'all' && m.game !== currentMemberGame) return false;
        if (currentMemberCategory !== 'all') {
            const cats = m.categories || [];
            if (!cats.includes(currentMemberCategory)) return false;
        }
        if (search) {
            const name = (m.displayName || '').toLowerCase();
            const bio = (m.bio || '').toLowerCase();
            const skills = (m.skills || []).join(',').toLowerCase();
            if (!name.includes(search) && !bio.includes(search) && !skills.includes(search)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>没有找到符合条件的陪玩成员</p></div>';
        return;
    }

    grid.innerHTML = filtered.map(m => {
        const avatarHtml = m.avatar
            ? '<img src="' + m.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" alt="">'
            : '<i class="fas fa-user-circle"></i>';

        const skillsHtml = (m.skills && m.skills.length > 0)
            ? m.skills.map(s => '<span class="skill">' + escapeHtml(SKILL_LABELS[s] || s) + '</span>').join('')
            : '<span class="skill">陪玩</span>';

        const ratingHtml = (m.rating !== undefined && m.rating !== null)
            ? '<i class="fas fa-star"></i> ' + m.rating
            : '暂无评分';

        const priceHtml = m.price
            ? '<span class="price-num">' + m.price + '</span><span class="price-unit">元/小时</span>'
            : '<span style="font-size:0.85rem;color:#999;">面议</span>';

        const categoriesAttr = JSON.stringify(m.categories || ['all']).replace(/"/g, '&quot;');
        const safeName = escapeHtml(m.displayName);
        const safeBio = escapeHtml(m.bio || '欢迎来找我玩~');

        return '<div class="wizard-list-card" data-member-id="' + (m.id || '') + '" data-name="' + safeName + '" data-online="true" data-game="' + m.game + '" data-category="' + categoriesAttr + '" data-level="normal" data-rating="' + (m.rating || '') + '">' +
            '<div class="card-header" style="position:relative;">' +
                '<div class="card-avatar">' + avatarHtml + '<span class="online-badge"></span></div>' +
                '<div class="card-info"><h3>' + safeName + '</h3><div class="card-tags"><span class="tag tag-normal">在线</span></div></div>' +
                '<span class="card-time" style="position:absolute;top:20px;right:20px;font-size:0.75rem;color:#999;background:rgba(255,255,255,0.9);padding:2px 8px;border-radius:8px;">' + getRelativeTime(m.apply_time) + '</span>' +
            '</div>' +
            '<div class="card-body">' +
                '<div class="card-rating" style="font-size:0.8rem;color:#999;">' + ratingHtml + '</div>' +
                '<div class="card-skills">' + skillsHtml + '</div>' +
                '<p class="card-desc">' + safeBio + '</p>' +
            '</div>' +
            '<div class="card-footer">' +
                '<div class="card-price">' + priceHtml + '</div>' +
                '<button class="btn btn-primary btn-small" onclick="showMemberDetail(\'' + (m.id || '') + '\')">' +
                    '<i class="fas fa-eye"></i> 查看详细' +
                '</button>' +
            '</div>' +
        '</div>';
    }).join('');
}

function closeMemberDetail() {
    const modal = document.getElementById('memberDetailModal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
}

// 点击弹窗外部关闭
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    loadApprovedMembers();
});
