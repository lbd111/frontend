// ============================================
// 生产环境：屏蔽调试日志，保持控制台整洁（仅保留 error）
// 如需临时开启，在控制台执行：localStorage.setItem('debug','1');location.reload()
// ============================================
(function () {
    if (typeof console !== 'undefined' && !localStorage.getItem('debug')) {
        console.log = function () {};
        console.warn = function () {};
        console.info = function () {};
        console.debug = function () {};
    }
})();

// ============================================
// Supabase 配置
// ============================================
window.SUPABASE_URL = 'https://cumcskaepjofogktmjzz.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bWNza2FlcGpvZm9na3Rtanp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODg4NTAsImV4cCI6MjA5OTc2NDg1MH0.Wc3GeFTr_LRRYj5bMrANyL8OfZW4pb0iTrfw4zunYN4';

// ============================================
// PostgREST 时钟偏差补偿（重要，勿删）
// --------------------------------------------
// 该 Supabase 项目的 PostgREST 实例时钟比它自己的 Auth 服务落后约 17 小时，
// 导致 Auth 刚签发的 access_token 在 PostgREST 看来永远是"未来签发"，
// 浏览器直连 REST 一律 401：{"code":"PGRST303","message":"JWT issued at future"}
// 这属于 Supabase 云端内部时钟不一致，前端无法自行规避。
//
// 因此把所有 /rest/v1 请求改道到自有后端的透明代理，由后端换发一个
// PostgREST 能接受的等价 token。登录/注册/登出等 /auth/v1 请求不受影响，
// 仍旧直连 Supabase。
// ============================================
window.SUPABASE_REST_PROXY = (typeof window.API_BASE !== 'undefined'
    ? window.API_BASE
    : 'https://api.skypw.dpdns.org') + '/api/sb';

(function () {
    var REST_ORIGIN = window.SUPABASE_URL + '/rest/v1';

    function rewrite(url) {
        return (typeof url === 'string' && url.indexOf(REST_ORIGIN) === 0)
            ? window.SUPABASE_REST_PROXY + url.slice(window.SUPABASE_URL.length)
            : null;
    }

    // 包装 fetch：仅改写 REST 流量，其余（auth/storage）原样直连
    window.supabaseProxyFetch = function (input, init) {
        try {
            if (typeof input === 'string') {
                var t = rewrite(input);
                if (t) return fetch(t, init);
            } else if (input && typeof input.url === 'string') {
                var t2 = rewrite(input.url);
                if (t2) return fetch(new Request(t2, input), init);
            }
        } catch (e) {
            console.warn('[supabase] 代理改写失败，回退直连:', e);
        }
        return fetch(input, init);
    };
})();

if (typeof window.supabaseClient === 'undefined') {
    window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
            storageKey: 'sky-auth-token'
        },
        global: {
            fetch: window.supabaseProxyFetch
        }
    });

    // 监听认证状态变化
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event, session ? 'has session' : 'no session');
    });

    console.log('Supabase 客户端已初始化（REST 经代理:', window.SUPABASE_REST_PROXY + '）');
}
