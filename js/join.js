// ============================================
// 光遇陪玩团 - 加入团队 (Supabase)
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // 上传区域拖放效果
    const uploadArea = document.querySelector('.upload-area-inline');
    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--primary)';
            uploadArea.style.background = 'var(--primary-light)';
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.borderColor = '';
            uploadArea.style.background = '';
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '';
            uploadArea.style.background = '';
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const hint = uploadArea.querySelector('.upload-hint');
                hint.textContent = '已选择 ' + files.length + ' 个文件';
                hint.style.color = '#4CAF50';
            }
        });

        document.getElementById('fileInput').addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                const hint = uploadArea.querySelector('.upload-hint');
                hint.textContent = '已选择 ' + files.length + ' 个文件';
                hint.style.color = '#4CAF50';
            }
        });
    }

    // 提交申请
    const joinForm = document.getElementById('joinForm');
    if (joinForm) {
        joinForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // 检查是否登录
            const skyUser = localStorage.getItem('skyUser');
            if (!skyUser) {
                window.location.href = '../pages/auth.html';
                return;
            }

            // 检查协议是否勾选
            const agreeCheckbox = document.getElementById('agreeTerms');
            if (!agreeCheckbox || !agreeCheckbox.checked) {
                return;
            }

            const userObj = JSON.parse(skyUser);

            // 收集表单数据
            const formData = new FormData(joinForm);
            const data = {};
            formData.forEach((value, key) => { data[key] = value; });

            // 收集复选框（擅长领域）
            const checkedSkills = [];
            joinForm.querySelectorAll('input[name="skills"]:checked').forEach(cb => {
                checkedSkills.push(cb.value);
            });
            data.skills = checkedSkills;

            // 附加用户名
            data.username = userObj.email ? userObj.email.split('@')[0] : 'user';
            data.applyTime = new Date().toLocaleString('zh-CN');

            const fileInput = document.getElementById('fileInput');
            let screenshotUrl = '';

            try {
                // 第一步：上传截图到 Supabase Storage
                if (fileInput && fileInput.files.length > 0) {
                    const file = fileInput.files[0];
                    const fileName = data.username + '_' + data.gameId + '_' + Date.now() + '_' + file.name;
                    const { error: uploadError } = await window.supabaseClient.storage
                        .from('screenshots')
                        .upload(fileName, file);
                    
                    if (!uploadError) {
                        const { data: urlData } = window.supabaseClient.storage
                            .from('screenshots')
                            .getPublicUrl(fileName);
                        screenshotUrl = urlData.publicUrl;
                        data.screenshot = screenshotUrl;
                        console.log('截图已上传:', screenshotUrl);
                    }
                }

                // 第二步：保存申请数据到 Supabase
                const { error: dbError } = await supabase
                    .from('applications')
                    .insert([data]);

                if (dbError) {
                    console.error('数据库错误:', dbError);
                    return;
                }

                joinForm.reset();
                if (uploadArea) {
                    const hint = uploadArea.querySelector('.upload-hint');
                    if (hint) {
                        hint.textContent = '支持 JPG、PNG 格式，不超过 5MB';
                        hint.style.color = '';
                    }
                }
            } catch (err) {
                console.error('提交失败:', err);
                }
        });
    }

    // 点击弹窗外部关闭
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });
});
