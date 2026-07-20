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
    data.username = userObj.username || userObj.email.split('@')[0] || 'user';
    data.user_email = userObj.email || "";
    data.user_id = userObj.id || "";
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
