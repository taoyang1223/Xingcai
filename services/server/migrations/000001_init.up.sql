-- FitMe MVP 核心表，对应《02-数据库设计》。跨模块不建外键。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- identity
CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    uid           VARCHAR(32)  NOT NULL UNIQUE,
    phone_hash    VARCHAR(64)  NOT NULL UNIQUE,
    phone_enc     BYTEA        NOT NULL,
    nickname      VARCHAR(64),
    avatar_url    VARCHAR(512),
    gender        SMALLINT     NOT NULL DEFAULT 0,
    birth_year    SMALLINT,
    status        SMALLINT     NOT NULL DEFAULT 1,
    registered_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_auths (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT       NOT NULL,
    provider   VARCHAR(16)  NOT NULL,
    open_id    VARCHAR(128) NOT NULL,
    credential BYTEA,
    UNIQUE (provider, open_id)
);

CREATE TABLE IF NOT EXISTS consents (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT       NOT NULL,
    scene          VARCHAR(32)  NOT NULL,
    policy_version VARCHAR(16)  NOT NULL,
    granted        BOOLEAN      NOT NULL,
    granted_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    revoked_at     TIMESTAMPTZ,
    client_ip      INET,
    device_info    JSONB,
    UNIQUE (user_id, scene, policy_version)
);
CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(user_id, scene);

-- body
CREATE TABLE IF NOT EXISTS body_profiles (
    id         BIGSERIAL PRIMARY KEY,
    uid        VARCHAR(32)  NOT NULL UNIQUE,
    user_id    BIGINT       NOT NULL,
    name       VARCHAR(32)  NOT NULL DEFAULT '我',
    relation   VARCHAR(16)  NOT NULL DEFAULT 'self',
    gender     SMALLINT     NOT NULL,
    age_range  VARCHAR(16),
    height_cm  NUMERIC(4,1) NOT NULL,
    weight_kg  NUMERIC(4,1) NOT NULL,
    body_shape VARCHAR(16),
    source     VARCHAR(16)  NOT NULL,
    is_default BOOLEAN      NOT NULL DEFAULT false,
    version    INT          NOT NULL DEFAULT 1,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_body_profiles_user ON body_profiles(user_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS body_measurements (
    id                BIGSERIAL PRIMARY KEY,
    profile_id        BIGINT      NOT NULL,
    profile_version   INT         NOT NULL,
    measures_enc      BYTEA       NOT NULL,
    confidence        JSONB       NOT NULL,
    corrected_by_user JSONB,
    provider_code     VARCHAR(32),
    measured_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (profile_id, profile_version)
);

CREATE TABLE IF NOT EXISTS body_model_assets (
    id              BIGSERIAL PRIMARY KEY,
    profile_id      BIGINT       NOT NULL,
    profile_version INT          NOT NULL,
    mesh_key        VARCHAR(256) NOT NULL,
    format          VARCHAR(16)  NOT NULL,
    lod             SMALLINT     NOT NULL DEFAULT 0,
    size_bytes      INT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS body_measure_jobs (
    id              BIGSERIAL PRIMARY KEY,
    job_uid         VARCHAR(32)  NOT NULL UNIQUE,
    user_id         BIGINT       NOT NULL,
    profile_id      BIGINT,
    consent_id      BIGINT       NOT NULL,
    status          VARCHAR(16)  NOT NULL,
    provider_code   VARCHAR(32),
    photo_keys      JSONB,
    photo_purged_at TIMESTAMPTZ,
    error_code      VARCHAR(32),
    cost_ms         INT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON body_measure_jobs(status, created_at);

-- catalog
CREATE TABLE IF NOT EXISTS cat_categories (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(32) NOT NULL UNIQUE,
    name        VARCHAR(32) NOT NULL,
    parent_code VARCHAR(32),
    body_part   VARCHAR(16) NOT NULL,
    sort        INT DEFAULT 0,
    enabled     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS cat_field_templates (
    id              BIGSERIAL PRIMARY KEY,
    category_code   VARCHAR(32) NOT NULL,
    version         INT         NOT NULL,
    required_fields JSONB       NOT NULL,
    optional_fields JSONB       NOT NULL,
    alias_dict      JSONB       NOT NULL,
    measure_mode    JSONB       NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'draft',
    published_at    TIMESTAMPTZ,
    UNIQUE (category_code, version)
);

CREATE TABLE IF NOT EXISTS cat_brands (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(64)  NOT NULL UNIQUE,
    name        VARCHAR(128) NOT NULL,
    platform    VARCHAR(16),
    shop_id     VARCHAR(64),
    trust_score NUMERIC(3,2) DEFAULT 0.50,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cat_products (
    id               BIGSERIAL PRIMARY KEY,
    uid              VARCHAR(32)  NOT NULL UNIQUE,
    platform         VARCHAR(16)  NOT NULL,
    platform_item_id VARCHAR(64)  NOT NULL,
    brand_id         BIGINT,
    category_code    VARCHAR(32),
    title            VARCHAR(512),
    cover_url        VARCHAR(512),
    fabric_desc      VARCHAR(512),
    elasticity       VARCHAR(16),
    fit_type         VARCHAR(16),
    source_type      VARCHAR(16)  NOT NULL,
    parse_status     VARCHAR(16)  NOT NULL,
    raw_payload      JSONB,
    last_parsed_at   TIMESTAMPTZ,
    UNIQUE (platform, platform_item_id)
);
CREATE INDEX IF NOT EXISTS idx_products_status ON cat_products(parse_status) WHERE parse_status IN ('failed', 'reviewing');

CREATE TABLE IF NOT EXISTS cat_size_charts (
    id             BIGSERIAL PRIMARY KEY,
    product_id     BIGINT       NOT NULL,
    version        INT          NOT NULL DEFAULT 1,
    chart_hash     VARCHAR(64)  NOT NULL,
    size_system    VARCHAR(16),
    unit           VARCHAR(8)   NOT NULL DEFAULT 'cm',
    measure_mode   VARCHAR(16),
    source         VARCHAR(16)  NOT NULL,
    ocr_confidence NUMERIC(3,2),
    reviewed_by    BIGINT,
    reviewed_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (product_id, version)
);

CREATE TABLE IF NOT EXISTS cat_size_entries (
    id         BIGSERIAL PRIMARY KEY,
    chart_id   BIGINT      NOT NULL,
    size_label VARCHAR(16) NOT NULL,
    size_order SMALLINT    NOT NULL,
    values     JSONB       NOT NULL,
    UNIQUE (chart_id, size_label)
);

CREATE TABLE IF NOT EXISTS cat_brand_bias (
    id            BIGSERIAL PRIMARY KEY,
    brand_id      BIGINT       NOT NULL,
    category_code VARCHAR(32)  NOT NULL,
    part          VARCHAR(24)  NOT NULL,
    bias_cm       NUMERIC(4,1) NOT NULL,
    sample_count  INT          NOT NULL,
    confidence    NUMERIC(3,2) NOT NULL,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (brand_id, category_code, part)
);

-- recommend
CREATE TABLE IF NOT EXISTS rec_records (
    id               BIGSERIAL PRIMARY KEY,
    uid              VARCHAR(32)  NOT NULL UNIQUE,
    user_id          BIGINT       NOT NULL,
    profile_id       BIGINT       NOT NULL,
    profile_version  INT          NOT NULL,
    product_id       BIGINT       NOT NULL,
    chart_id         BIGINT       NOT NULL,
    rule_version     VARCHAR(32)  NOT NULL,
    preference       VARCHAR(16)  NOT NULL,
    recommended_size VARCHAR(16),
    confidence       NUMERIC(3,2),
    alternatives     JSONB,
    overall_risk     VARCHAR(16),
    reason_text      VARCHAR(512),
    engine_version   VARCHAR(32)  NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rec_user_time ON rec_records(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_product ON rec_records(product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rec_fit_details (
    id          BIGSERIAL PRIMARY KEY,
    record_id   BIGINT       NOT NULL,
    size_label  VARCHAR(16)  NOT NULL,
    part        VARCHAR(24)  NOT NULL,
    user_cm     NUMERIC(5,1),
    garment_cm  NUMERIC(5,1),
    ease_cm     NUMERIC(5,1),
    verdict     VARCHAR(16)  NOT NULL,
    tip         VARCHAR(128)
);
CREATE INDEX IF NOT EXISTS idx_fit_record ON rec_fit_details(record_id);

-- feedback
CREATE TABLE IF NOT EXISTS fb_fit_feedbacks (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT      NOT NULL,
    rec_record_id  BIGINT,
    product_id     BIGINT      NOT NULL,
    purchased_size VARCHAR(16) NOT NULL,
    followed_rec   BOOLEAN,
    overall_fit    SMALLINT    NOT NULL,
    part_issues    JSONB,
    returned       BOOLEAN     NOT NULL DEFAULT false,
    return_reason  VARCHAR(32),
    comment        VARCHAR(512),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fb_product ON fb_fit_feedbacks(product_id);
CREATE INDEX IF NOT EXISTS idx_fb_rec ON fb_fit_feedbacks(rec_record_id);

CREATE TABLE IF NOT EXISTS fb_tickets (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT       NOT NULL,
    type       VARCHAR(32)  NOT NULL,
    content    TEXT         NOT NULL,
    status     VARCHAR(16)  NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- config
CREATE TABLE IF NOT EXISTS cfg_ease_rules (
    id               BIGSERIAL PRIMARY KEY,
    rule_set_version VARCHAR(32)  NOT NULL,
    category_code    VARCHAR(32)  NOT NULL,
    fit_type         VARCHAR(16)  NOT NULL,
    elasticity       VARCHAR(16)  NOT NULL,
    part             VARCHAR(24)  NOT NULL,
    ease_min_cm      NUMERIC(4,1) NOT NULL,
    ease_ideal_cm    NUMERIC(4,1) NOT NULL,
    ease_max_cm      NUMERIC(4,1) NOT NULL,
    weight           NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    UNIQUE (rule_set_version, category_code, fit_type, elasticity, part)
);

CREATE TABLE IF NOT EXISTS cfg_rule_sets (
    version      VARCHAR(32) PRIMARY KEY,
    status       VARCHAR(16) NOT NULL,
    gray_percent SMALLINT DEFAULT 0,
    note         VARCHAR(256),
    created_by   BIGINT,
    published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cfg_flags (
    key         VARCHAR(64) PRIMARY KEY,
    value       JSONB        NOT NULL,
    description VARCHAR(256),
    updated_by  BIGINT,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- admin / audit
CREATE TABLE IF NOT EXISTS adm_users (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(64)  NOT NULL UNIQUE,
    password_hash VARCHAR(128) NOT NULL,
    real_name     VARCHAR(32),
    mfa_secret    BYTEA,
    status        SMALLINT     NOT NULL DEFAULT 1,
    last_login_at TIMESTAMPTZ,
    last_login_ip INET
);

CREATE TABLE IF NOT EXISTS adm_roles (
    id    BIGSERIAL PRIMARY KEY,
    code  VARCHAR(32) NOT NULL UNIQUE,
    name  VARCHAR(32) NOT NULL,
    perms JSONB       NOT NULL
);

CREATE TABLE IF NOT EXISTS adm_user_roles (
    admin_id BIGINT NOT NULL,
    role_id  BIGINT NOT NULL,
    PRIMARY KEY (admin_id, role_id)
);

CREATE TABLE IF NOT EXISTS adm_audit_logs (
    id          BIGSERIAL,
    actor_type  VARCHAR(16) NOT NULL,
    actor_id    BIGINT,
    action      VARCHAR(64) NOT NULL,
    resource    VARCHAR(64),
    resource_id VARCHAR(64),
    result      VARCHAR(16) NOT NULL,
    detail      JSONB,
    ip          INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS adm_audit_logs_default PARTITION OF adm_audit_logs DEFAULT;

CREATE TABLE IF NOT EXISTS adm_review_tasks (
    id         BIGSERIAL PRIMARY KEY,
    type       VARCHAR(32) NOT NULL,
    ref_id     BIGINT      NOT NULL,
    priority   SMALLINT    NOT NULL DEFAULT 5,
    status     VARCHAR(16) NOT NULL DEFAULT 'pending',
    claimed_by BIGINT,
    claimed_at TIMESTAMPTZ,
    result     JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_pending ON adm_review_tasks(type, priority DESC, created_at) WHERE status = 'pending';
