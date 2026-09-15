-- 微信/支付宝伪匿名登录不强制手机号；C 端禁止真名与身份证。

ALTER TABLE users ALTER COLUMN phone_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN phone_enc DROP NOT NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_hash_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_hash_uidx
    ON users (phone_hash)
    WHERE phone_hash IS NOT NULL;
