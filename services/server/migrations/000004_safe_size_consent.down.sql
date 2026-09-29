ALTER TABLE safe_body_consents DROP CONSTRAINT IF EXISTS safe_body_consents_ui_action_check;
ALTER TABLE safe_body_consents DROP CONSTRAINT IF EXISTS safe_body_consents_scene_check;
ALTER TABLE safe_body_consents DROP CONSTRAINT IF EXISTS safe_body_consents_policy_version_format;
ALTER TABLE safe_body_consents DROP COLUMN IF EXISTS ui_action;
ALTER TABLE safe_body_consents DROP COLUMN IF EXISTS policy_sha256;
ALTER TABLE safe_body_consents DROP COLUMN IF EXISTS scene;
ALTER TABLE safe_body_consents ADD CONSTRAINT safe_body_consents_policy_version_check CHECK (policy_version = 'body-data-v1');
