// ============================================
// Supabase 配置
// ============================================
window.SUPABASE_URL = 'https://cumcskaepjofogktmjzz.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bWNza2FlcGpvZm9na3Rtanp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODg4NTAsImV4cCI6MjA5OTc2NDg1MH0.Wc3GeFTr_LRRYj5bMrANyL8OfZW4pb0iTrfw4zunYN4';

if (typeof window.supabaseClient === 'undefined') {
    window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
            storageKey: 'sky-auth-token'
        }
    });
    
    // 监听认证状态变化
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event, session ? 'has session' : 'no session');
    });
    
    console.log('Supabase 客户端已初始化');
}
