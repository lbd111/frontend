// ============================================
// Supabase 配置
// ============================================
window.SUPABASE_URL = 'https://cumcskaepjofogktmjzz.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bWNza2FlcGpvZm9na3Rtanp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODg4NTAsImV4cCI6MjA5OTc2NDg1MH0.Wc3GeFTr_LRRYj5bMrANyL8OfZW4pb0iTrfw4zunYN4';

// 防止重复初始化
if (typeof window.supabaseClient === 'undefined') {
    window.supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    console.log('Supabase 客户端已初始化');
}
