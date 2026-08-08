-- ============================================================================
-- profiles 表 RLS 收紧脚本（增量，幂等，只删除过度宽松的策略）
-- 适用场景：任意登录用户可 UPDATE 其他人的 profiles 行，或匿名用户可操作。
-- 执行后保留：自己改自己、管理员改所有、公开读取资料目录等既有正确策略。
-- 用法：整段粘贴到 Supabase 后台 → SQL Editor → Run。
-- ============================================================================

-- 删除「任意登录用户可 UPDATE 任意 profile」的宽松策略
DROP POLICY IF EXISTS "profiles_open_update" ON public.profiles;

-- 删除「任何人（含匿名）可 UPDATE 任意 profile」的宽松策略
DROP POLICY IF EXISTS "users_update_profile" ON public.profiles;

-- 删除「任意登录用户可 INSERT 任意 id 的 profile」的宽松策略
DROP POLICY IF EXISTS "profiles_open_insert" ON public.profiles;

-- 删除「任何人（含匿名）可 INSERT 任意 id 的 profile」的宽松策略
DROP POLICY IF EXISTS "users_insert_profile" ON public.profiles;

-- 执行后，profiles 的 INSERT/UPDATE 权限将只剩：
-- 1. admin_all_profiles (is_admin() 判断) —— 管理员可操作任意行
-- 2. 用户可插入自己的资料 / 用户可更新自己的资料 —— 普通用户只能操作自己的行
-- SELECT 读取策略未改动，资料目录/会员列表等公开读取逻辑不受影响。
