DROP INDEX IF EXISTS users_phone_hash_uidx;

UPDATE users SET phone_hash = '' WHERE phone_hash IS NULL;
UPDATE users SET phone_enc = ''::bytea WHERE phone_enc IS NULL;

ALTER TABLE users ALTER COLUMN phone_hash SET NOT NULL;
ALTER TABLE users ALTER COLUMN phone_enc SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_phone_hash_key UNIQUE (phone_hash);
