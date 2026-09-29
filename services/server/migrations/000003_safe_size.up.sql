-- 独立闭环，不向旧 body_profiles / rec_fit_details 的明文列写入。
CREATE TABLE safe_body_consents (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    policy_version VARCHAR(32) NOT NULL CHECK (policy_version = 'body-data-v1'),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX safe_body_consent_active ON safe_body_consents(user_id) WHERE revoked_at IS NULL;
CREATE INDEX safe_body_consent_owner ON safe_body_consents(user_id, id);

CREATE TABLE safe_body_profiles (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    consent_id UUID NOT NULL REFERENCES safe_body_consents(id),
    payload_enc BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX safe_body_profile_owner ON safe_body_profiles(user_id);

CREATE TABLE safe_size_charts (
    product_id UUID NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id),
    chart JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
);
