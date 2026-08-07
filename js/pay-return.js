// BJ陪玩团 - 支付回跳轮询页
(function() {
    const params = new URLSearchParams(window.location.search);
    const bjOrderNo = params.get('bj_order_no');

    const iconEl = document.getElementById('returnIcon');
    const titleEl = document.getElementById('returnTitle');
    const descEl = document.getElementById('returnDesc');
    const detailEl = document.getElementById('returnDetail');
    const actionsEl = document.getElementById('returnActions');

    const itemMap = {
        vip_month: '月度 VIP 会员',
        recharge: '账户余额充值'
    };

    if (!bjOrderNo) {
        showError('缺少订单号', '无法确认支付结果，请返回支付页面重试。');
        return;
    }

    document.getElementById('detailOrderNo').textContent = bjOrderNo.slice(0, 12) + '...';

    let attempts = 0;
    const maxAttempts = 30; // 最多轮询 30 次
    const interval = 3000;  // 每 3 秒一次，总计约 90 秒

    async function checkStatus() {
        if (stopped) return;
        attempts++;

        let token = null;
        try {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            token = session?.access_token;
        } catch (e) {
            console.error('获取 session 失败:', e);
        }

        if (!token) {
            showError('登录状态已过期', '请重新登录后查看订单状态。');
            return;
        }

        abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController && abortController.abort(), 10000);

        try {
            const res = await fetch(window.API_BASE + '/api/orders/status/' + encodeURIComponent(bjOrderNo), {
                headers: { 'Authorization': 'Bearer ' + token },
                signal: abortController.signal
            });
            clearTimeout(timeoutId);

            let data = null;
            try {
                data = await res.json();
            } catch (jsonErr) {
                console.error('解析订单状态响应失败:', jsonErr);
                data = { code: 0, error: '服务器响应异常' };
            }

            if (stopped) return;

            if (!res.ok || data.code !== 1) {
                if (attempts >= maxAttempts) {
                    showError('查询失败', data.error || '无法获取订单状态，请联系客服。');
                } else {
                    scheduleNext();
                }
                return;
            }

            const order = data.order;
            document.getElementById('detailItem').textContent = itemMap[order.item_type] || order.item_type;
            document.getElementById('detailAmount').textContent = '￥' + parseFloat(order.amount).toFixed(2);

            if (order.status === 'paid') {
                showSuccess(order);
                return;
            }

            // 继续轮询
            if (attempts >= maxAttempts) {
                showPending('尚未收到支付结果', '如果您已完成付款，权益将在到账后自动发放，请稍后到个人中心查看。');
                return;
            }

            scheduleNext();
        } catch (err) {
            clearTimeout(timeoutId);
            // 页面停止轮询或请求被取消时，静默忽略，不打印错误
            if (stopped || err.name === 'AbortError') return;
            console.error('轮询异常:', err);
            if (attempts >= maxAttempts) {
                showError('网络异常', '无法连接支付服务器，请稍后到个人中心查看余额/会员状态。');
                return;
            }
            scheduleNext();
        } finally {
            if (abortController) {
                abortController = null;
            }
        }
    }

    function scheduleNext() {
        if (stopped || timer) return;
        timer = setTimeout(() => {
            timer = null;
            checkStatus();
        }, interval);
    }

    async function showSuccess(order) {
        iconEl.className = 'pay-return-icon success';
        iconEl.innerHTML = '<i class="fas fa-check"></i>';
        titleEl.textContent = order.item_type === 'vip_month' ? 'VIP 开通成功' : '充值成功';
        descEl.textContent = order.item_type === 'vip_month'
            ? '会员权益已到账，每周 95 折优惠券已发放。'
            : '充值金额已到账，可前往个人中心查看余额。';
        detailEl.style.display = 'block';
        actionsEl.style.display = 'flex';
        stopPolling();

        // 刷新 localStorage 余额/会员信息并同步导航栏
        try {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (session?.access_token) {
                const { data: profile } = await window.supabaseClient
                    .from('profiles')
                    .select('balance, level, vip_expire_at, nickname, avatar_url')
                    .eq('id', session.user.id)
                    .maybeSingle();
                if (profile) {
                    const userStr = localStorage.getItem('skyUser');
                    const user = userStr ? JSON.parse(userStr) : {};
                    user.balance = parseFloat(profile.balance) || 0;
                    if (profile.level) user.level = profile.level;
                    if (profile.vip_expire_at) user.vip_expire_at = profile.vip_expire_at;
                    if (profile.nickname) { user.nickname = profile.nickname; user.username = profile.nickname; }
                    if (profile.avatar_url) user.avatar = profile.avatar_url;
                    localStorage.setItem('skyUser', JSON.stringify(user));
                    if (typeof window.updateNavUser === 'function') window.updateNavUser();
                }
            }
        } catch (e) {
            console.error('刷新余额失败:', e);
        }
    }

    function showPending(title, desc) {
        iconEl.className = 'pay-return-icon loading';
        iconEl.innerHTML = '<i class="fas fa-hourglass-half"></i>';
        titleEl.textContent = title;
        descEl.textContent = desc;
        detailEl.style.display = 'block';
        actionsEl.style.display = 'flex';
        stopPolling();
    }

    function showError(title, desc) {
        iconEl.className = 'pay-return-icon error';
        iconEl.innerHTML = '<i class="fas fa-times"></i>';
        titleEl.textContent = title;
        descEl.textContent = desc;
        detailEl.style.display = 'block';
        actionsEl.style.display = 'flex';
        stopPolling();
    }

    let timer = null;
    let abortController = null;
    let stopped = false;

    function startPolling() {
        stopped = false;
        checkStatus();
    }

    function stopPolling() {
        stopped = true;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (abortController) {
            abortController.abort();
            abortController = null;
        }
    }

    startPolling();
})();
