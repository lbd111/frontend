-- 修复 /api/notifications 报 500（permission denied for table notifications）
-- 原因：service_role 没有 notifications 表的 SELECT 权限
-- 在 Supabase Dashboard → SQL Editor 中执行以下语句：

GRANT SELECT ON public.notifications TO service_role;

-- 如果其他后端接口也报类似权限错误，可统一授权：
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
