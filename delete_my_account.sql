-- ============================================================
-- 注销账号：数据库安全函数（替代 Edge Function）
-- 作用：删除当前登录用户的所有关联数据 + auth.users 记录
-- 安全：SECURITY DEFINER（以函数拥有者权限执行），但只允许删除「当前登录用户自己」
-- 部署：在 Supabase SQL Editor 执行本文件一次即可（可重复执行，幂等）
-- ============================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
begin
    -- 未登录 / 会话过期则拒绝
    if v_uid is null then
        raise exception '未登录或登录已过期';
    end if;

    -- 1. 清理 auth 系统表的关联记录（session/refresh_token/identities/mfa_factors）
    --    使用 exception when others 容错：这些表存在且结构可能随版本变化
    begin
        delete from auth.sessions where user_id = v_uid;
    exception when others then null;
    end;

    begin
        delete from auth.refresh_tokens
        where session_id in (select id from auth.sessions where user_id = v_uid);
    exception when others then null;
    end;

    begin
        delete from auth.identities where user_id = v_uid;
    exception when others then null;
    end;

    begin
        delete from auth.mfa_factors where user_id = v_uid;
    exception when others then null;
    end;

    -- 2. 清理业务表关联数据
    begin
        delete from public.dispatch_team_members where user_id = v_uid;
    exception when others then null;
    end;

    begin
        delete from public.dispatch_orders where user_id = v_uid;
    exception when others then null;
    end;

    begin
        delete from public.orders where user_id = v_uid;
    exception when others then null;
    end;

    begin
        delete from public.order_requests where user_id = v_uid;
    exception when others then null;
    end;

    begin
        delete from public.coupons where user_id = v_uid;
    exception when others then null;
    end;

    begin
        delete from public.transactions where user_id = v_uid;
    exception when others then null;
    end;

    begin
        delete from public.wallets where user_id = v_uid;
    exception when others then null;
    end;

    begin
        delete from public.wizards where user_id = v_uid;
    exception when others then null;
    end;

    -- 3. 删除个人资料（在 auth.users 之前，避免外键约束）
    begin
        delete from public.profiles where id = v_uid;
    exception when others then null;
    end;

    -- 4. 最后删除 Supabase Auth 用户
    delete from auth.users where id = v_uid;
end;
$$;

-- 授权：登录用户可调用
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.delete_my_account() to anon;
