-- 补齐同意证据，并允许后续政策版本，而不重写已经执行过的 000003。
ALTER TABLE safe_body_consents DROP CONSTRAINT IF EXISTS safe_body_consents_policy_version_check;
ALTER TABLE safe_body_consents ADD CONSTRAINT safe_body_consents_policy_version_format CHECK (policy_version ~ '^body-data-v[0-9]+$');
ALTER TABLE safe_body_consents ADD COLUMN IF NOT EXISTS scene VARCHAR(32) NOT NULL DEFAULT 'body_data';
ALTER TABLE safe_body_consents ADD COLUMN IF NOT EXISTS policy_sha256 VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE safe_body_consents ADD COLUMN IF NOT EXISTS ui_action VARCHAR(64) NOT NULL DEFAULT 'separate_unchecked_checkbox';
ALTER TABLE safe_body_consents DROP CONSTRAINT IF EXISTS safe_body_consents_scene_check;
ALTER TABLE safe_body_consents ADD CONSTRAINT safe_body_consents_scene_check CHECK (scene = 'body_data');
ALTER TABLE safe_body_consents DROP CONSTRAINT IF EXISTS safe_body_consents_ui_action_check;
ALTER TABLE safe_body_consents ADD CONSTRAINT safe_body_consents_ui_action_check CHECK (ui_action = 'separate_unchecked_checkbox');
