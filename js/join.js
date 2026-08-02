// ============================================
// BJ陪玩团 - 加入团队
// ============================================

// Game type tab switching
function switchGameType(type) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.tab-btn[data-type="' + type + '"]').classList.add('active');
    
    var skyForm = document.getElementById('joinForm');
    var wzForm = document.getElementById('wangzheJoinForm');
    
    if (type === 'sky') {
        skyForm.style.display = 'block';
        wzForm.style.display = 'none';
    } else {
        skyForm.style.display = 'none';
        wzForm.style.display = 'block';
    }
}

// Toggle skill checkbox selection
function toggleSkill(el) {
    el.classList.toggle('selected');
}

// Preview uploaded image
function previewImage(input) {
    var preview = input.nextElementSibling;
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = '<img src="' + e.target.result + '" style="max-width:200px;max-height:150px;border-radius:8px;margin-top:8px;">';
        };
        reader.readAsDataURL(input.files[0]);
    }
}


// Toast notification (card-style)
function showToast(message, type) {
    // Remove existing toast
    var existing = document.querySelector('.join-toast');
    if (existing) existing.remove();
    
    var toast = document.createElement('div');
    toast.className = 'join-toast';
    toast.textContent = message;
    
    var bgColor = type === 'success' ? 'linear-gradient(135deg, #4CAF50, #66BB6A)' :
                  type === 'error' ? 'linear-gradient(135deg, #f44336, #e57373)' :
                  'linear-gradient(135deg, #2196F3, #64B5F6)';
    
    toast.style.cssText = 'position:fixed;top:80px;right:20px;padding:16px 24px;border-radius:12px;color:white;font-weight:600;z-index:10000;animation:slideInRight 0.3s ease;box-shadow:0 4px 20px rgba(0,0,0,0.15);background:' + bgColor + ';font-family:Microsoft YaHei UI,sans-serif;font-size:0.95rem;max-width:320px;';
    
    document.body.appendChild(toast);
    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
}


document.addEventListener('DOMContentLoaded', () => {
    // Upload area drag-drop for sky
    setupUploadArea('fileInput', 'joinForm');
    // Upload area drag-drop for wangzhe
    setupUploadArea('wzFileInput', 'wangzheJoinForm');

    // Submit sky form
    var joinForm = document.getElementById('joinForm');
    if (joinForm) {
        joinForm.addEventListener('submit', function(e) {
            e.preventDefault();
            submitApplication('sky', joinForm, 'fileInput', 'agreeTerms');
        });
    }

    // Submit wangzhe form
    var wzForm = document.getElementById('wangzheJoinForm');
    if (wzForm) {
        wzForm.addEventListener('submit', function(e) {
            e.preventDefault();
            submitApplication('wangzhe', wzForm, 'wzFileInput', 'wzAgreeTerms');
        });
    }

    // Click outside modal to close
    document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });

    // 加载用户资料并预填/锁定游戏资料，同时检查申请状态
    loadProfileAndPrefill();
});

function setupUploadArea(fileInputId, formId) {
    var form = document.getElementById(formId);
    if (!form) return;
    var uploadArea = form.querySelector('.upload-area-inline');
    var fileInput = document.getElementById(fileInputId);
    if (!uploadArea || !fileInput) return;

    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary)';
        uploadArea.style.background = 'var(--primary-light)';
    });
    uploadArea.addEventListener('dragleave', function() {
        uploadArea.style.borderColor = '';
        uploadArea.style.background = '';
    });
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.style.borderColor = '';
        uploadArea.style.background = '';
        var files = e.dataTransfer.files;
        if (files.length > 0) {
            var hint = uploadArea.querySelector('.upload-hint');
            if (hint) hint.textContent = '已选择 ' + files.length + ' 个文件';
        }
    });
    fileInput.addEventListener('change', function(e) {
        var files = e.target.files;
        if (files.length > 0) {
            var hint = uploadArea.querySelector('.upload-hint');
            if (hint) hint.textContent = '已选择 ' + files.length + ' 个文件';
        }
    });
}

function setFieldLocked(el, value) {
    if (!el) return;
    el.value = value || '';
    if (value && String(value).trim() !== '') {
        el.setAttribute('readonly', 'readonly');
        if (el.tagName === 'SELECT') {
            el.setAttribute('disabled', 'disabled');
        }
        el.style.background = '#f0f4f8';
        el.style.color = '#666';
        el.style.cursor = 'not-allowed';
        el.title = '该信息已在个人资料中填写，不可修改';
    }
}

async function loadProfileAndPrefill() {
    try {
        var sessionRes = await window.supabaseClient.auth.getSession();
        var currentUser = sessionRes.data && sessionRes.data.session ? sessionRes.data.session.user : null;
        if (!currentUser || !currentUser.id) {
            return;
        }

        // 加载用户资料
        var { data: profiles, error: profileError } = await window.supabaseClient
            .from('profiles')
            .select('sky_id, wangzhe_id, server, wz_server')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (profileError) {
            console.warn('加载用户资料失败:', profileError);
        }

        var profile = profiles || {};

        // 预填光遇资料
        var skyGameIdEl = document.getElementById('skyGameId');
        var skyServerEl = document.getElementById('skyServer');
        setFieldLocked(skyGameIdEl, profile.sky_id);
        setFieldLocked(skyServerEl, profile.server);

        // 预填王者资料
        var wzGameIdEl = document.getElementById('wzGameId');
        var wzServerEl = document.getElementById('wzServer');
        setFieldLocked(wzGameIdEl, profile.wangzhe_id);
        setFieldLocked(wzServerEl, profile.wz_server);

        // 检查已有申请状态
        await checkApplicationStatus(currentUser.id);
    } catch (err) {
        console.error('初始化申请页失败:', err);
    }
}

async function checkApplicationStatus(userId) {
    try {
        var { data: applications, error } = await window.supabaseClient
            .from('applications')
            .select('status, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.warn('查询申请状态失败:', error);
            return;
        }

        var banner = document.getElementById('applicationStatusBanner');
        var bannerText = document.getElementById('applicationStatusText');
        var skySubmit = document.querySelector('#joinForm button[type="submit"]');
        var wzSubmit = document.querySelector('#wangzheJoinForm button[type="submit"]');

        var latest = applications && applications.length > 0 ? applications[0] : null;
        if (latest && latest.status !== 'approved') {
            var statusText = {
                'pending': '待审核',
                'rejected': '已拒绝'
            }[latest.status] || latest.status;
            if (banner) banner.style.display = 'block';
            if (bannerText) {
                bannerText.textContent = '您已有一条' + statusText + '的申请，审核通过前无法提交新申请。';
            }
            if (skySubmit) {
                skySubmit.disabled = true;
                skySubmit.style.opacity = '0.6';
                skySubmit.style.cursor = 'not-allowed';
            }
            if (wzSubmit) {
                wzSubmit.disabled = true;
                wzSubmit.style.opacity = '0.6';
                wzSubmit.style.cursor = 'not-allowed';
            }
        } else {
            if (banner) banner.style.display = 'none';
        }
    } catch (err) {
        console.error('检查申请状态失败:', err);
    }
}

async function submitApplication(gameType, form, fileInputId, agreeCheckboxId) {
    var agreeCheckbox = document.getElementById(agreeCheckboxId);
    if (!agreeCheckbox || !agreeCheckbox.checked) {
        showToast('请先同意用户协议', 'error');
        return;
    }

    var skyUser = localStorage.getItem('skyUser');
    if (!skyUser) {
        showToast('请先登录', 'error');
        window.location.href = '../pages/auth.html';
        return;
    }

    var userObj = JSON.parse(skyUser);

    // 优先从 Supabase session 获取真实 uid/email，避免 localStorage 丢失或过期
    var userId = '';
    var userEmail = '';
    try {
        var sessionRes = await window.supabaseClient.auth.getSession();
        var currentUser = sessionRes.data.session?.user;
        if (currentUser && currentUser.id) {
            userId = currentUser.id;
            userEmail = currentUser.email || '';
            userObj.id = currentUser.id;
            userObj.user_id = currentUser.id;
            userObj.email = userEmail || userObj.email || '';
        }
    } catch (e) {
        console.warn('获取 session 失败，使用 localStorage 缓存', e);
    }

    if (!userId) userId = userObj.id || userObj.user_id || '';
    if (!userEmail) userEmail = userObj.email || '';

    if (!userId) {
        showToast('登录状态已失效，请重新登录', 'error');
        window.location.href = '../pages/auth.html';
        return;
    }

    // 检查是否已有未审核/被拒绝的申请，避免重复提交
    try {
        var { data: existingApps, error: checkError } = await window.supabaseClient
            .from('applications')
            .select('status')
            .eq('user_id', userId)
            .neq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(1);

        if (checkError) {
            console.warn('检查历史申请失败:', checkError);
        } else if (existingApps && existingApps.length > 0) {
            var latestStatus = existingApps[0].status;
            var statusText = {
                'pending': '待审核',
                'rejected': '已拒绝'
            }[latestStatus] || latestStatus;
            showToast('您已有一条' + statusText + '的申请，审核通过前无法重复提交', 'error');
            return;
        }
    } catch (e) {
        console.warn('重复提交检查异常:', e);
    }

    var data = {};

    // Collect form fields with column name mapping
    var formData = new FormData(form);
    // Map form field names to database column names
    var fieldMap = {
        'gameId': 'game_id',
        'gyname': 'gyname',
        'server': 'server',
        'wechat': 'wechat',
        'feathers': 'feathers',
        'candles': 'candles',
        'bio': 'bio'
    };
    formData.forEach(function(value, key) {
        var dbKey = fieldMap[key] || key;
        data[dbKey] = value;
    });

    // Collect checked skills
    var skillsName = gameType === 'sky' ? 'skills' : 'wz_skills';
    var checkedSkills = [];
    form.querySelectorAll('input[name="' + skillsName + '"]:checked').forEach(function(cb) {
        checkedSkills.push(cb.value);
    });
    data.skills = checkedSkills;

    // Metadata
    data.game_type = gameType;
    data.username = userObj.username || (userEmail ? userEmail.split('@')[0] : 'user');
    data.user_email = userEmail;
    data.user_id = userId;
    data.apply_time = new Date().toISOString();
    data.status = 'pending';

    // Map wangzhe form fields to database columns
    if (gameType === 'wangzhe') {
        data.wz_name = data.wz_name || '';
        data.wz_game_id = data.wz_game_id || '';
        data.wz_server = data.wz_server || '';
        data.wz_wechat = data.wz_wechat || '';
        data.wz_rank = data.wz_rank || '';
        data.wz_power = data.wz_power || '';
        data.wz_bio = data.wz_bio || '';
        data.wz_skills = checkedSkills;
    }
    
    // Only delete fields that don't exist in schema


    // Upload screenshots to Supabase Storage (authenticated user only)
    var fileInput = document.getElementById(fileInputId);
    if (fileInput && fileInput.files.length > 0) {
        for (var i = 0; i < fileInput.files.length; i++) {
            try {
                var file = fileInput.files[i];
                // Use user's auth ID to organize files per user
                var session = await window.supabaseClient.auth.getSession();
                var userId = session.data.session?.user?.id || 'anonymous';
                var fileName = userId + '/applications/' + Date.now() + '_' + i + '_' + file.name;
                var { data: uploadData, error: uploadError } = await window.supabaseClient.storage
                    .from('screenshots')
                    .upload(fileName, file);
                if (!uploadError && uploadData) {
                    var { data: urlData } = window.supabaseClient.storage
                        .from('screenshots')
                        .getPublicUrl(fileName);
                    if (urlData && urlData.publicUrl) {
                        data.screenshot = urlData.publicUrl;
                    }
                }
            } catch (err) {
                console.warn('Screenshot upload failed:', err);
            }
        }
    }

    // Insert into Supabase
    try {
        var { error: dbError } = await window.supabaseClient
            .from('applications')
            .insert([data]);

        if (dbError) {
            console.error('Database error:', dbError);
            showToast('提交失败: ' + dbError.message, 'error');
            return;
        }

        showToast('申请提交成功！我们将在1-3个工作日内审核。', 'success');
        form.reset();
        // Reset upload hints
        var uploadArea = form.querySelector('.upload-area-inline');
        if (uploadArea) {
            var hint = uploadArea.querySelector('.upload-hint');
            if (hint) hint.textContent = '支持 JPG、PNG 格式，不超过 5MB';
        }
    } catch (err) {
        console.error('Submit error:', err);
        showToast('提交失败: ' + err.message, 'error');
    }
}