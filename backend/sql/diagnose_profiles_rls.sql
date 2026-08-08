-- ============================================================================
-- profiles 表 RLS 策略诊断（只读，不修改任何数据，可安全重复执行）
-- 单语句版本：Supabase SQL Editor 默认只显示最后一条语句结果，故合并为一条。
-- 用法：整段粘贴到 Supabase 后台 → SQL Editor → Run，把结果表格截图发回。
-- ============================================================================

select
    (select c.relrowsecurity
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'profiles')           as rls_enabled,
    pol.polname                                                       as policy_name,
    case pol.polcmd
        when 'r' then 'SELECT'
        when 'a' then 'INSERT'
        when 'w' then 'UPDATE'
        when 'd' then 'DELETE'
        when '*' then 'ALL'
    end                                                               as command,
    coalesce(
        (select string_agg(rolname, ', ')
         from pg_roles where oid = any(pol.polroles)),
        'PUBLIC'
    )                                                                 as roles,
    pg_get_expr(pol.polqual, pol.polrelid)                            as using_expr,
    pg_get_expr(pol.polwithcheck, pol.polrelid)                       as with_check_expr
from pg_policy pol
where pol.polrelid = 'public.profiles'::regclass
order by pol.polcmd, pol.polname;
