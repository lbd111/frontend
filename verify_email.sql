-- 将 sun499399598@163.com 的邮箱标记为已验证
UPDATE auth.users
SET 
    email_confirmed_at = NOW(),
    confirmed_at = NOW()
WHERE email = 'sun499399598@163.com';

-- 查看验证结果
SELECT id, email, email_confirmed_at, confirmed_at FROM auth.users WHERE email = 'sun499399598@163.com';
