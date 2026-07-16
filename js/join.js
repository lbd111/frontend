// ============================================
// 光遇陪玩团 - 加入团队交互
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
                alert('请先阅读并同意用户服务协议和隐私政策');
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
            data.username = userObj.name;

            // 第一步：先提交表单数据到后端
            try {
                const response = await fetch('http://localhost:3000/api/join-application', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (!result.success) {
                    alert('提交失败：' + result.message);
                    return;
                }

                // 第二步：如果有截图，单独上传到 gameimage 文件夹
                const fileInput = document.getElementById('fileInput');
                if (fileInput && fileInput.files.length > 0) {
                    const fileFormData = new FormData();
                    fileFormData.append('screenshot', fileInput.files[0]);
                    fileFormData.append('username', data.username);
                    fileFormData.append('gameId', data.gameId);

                    await fetch('http://localhost:3000/api/upload-screenshot', {
                        method: 'POST',
                        body: fileFormData
                    }).catch(err => console.error('上传截图失败:', err));
                }

                alert('申请已提交！管理员将在24小时内审核您的资料，请耐心等待。审核结果将通过微信通知您。');
                joinForm.reset();
                const uploadArea = document.querySelector('.upload-area-inline');
                if (uploadArea) {
                    const hint = uploadArea.querySelector('.upload-hint');
                    if (hint) {
                        hint.textContent = '支持 JPG、PNG 格式，不超过 5MB';
                        hint.style.color = '';
                    }
                }
            } catch (err) {
                alert('网络错误，请确保后端服务已启动');
                console.error(err);
            }
        });
    }
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
