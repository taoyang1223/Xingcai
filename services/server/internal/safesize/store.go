package safesize

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/crypto"
)

var (
	errNotFound = errors.New("resource not found")
	errConsent  = errors.New("consent required")
	errInactive = errors.New("account inactive")
)

type store struct {
	db  *pgxpool.Pool
	box *crypto.Box
}

func (s store) active(ctx context.Context, userID int64) error {
	var ok bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id=$1 AND status=1 AND deleted_at IS NULL)`, userID).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return errInactive
	}
	return nil
}

func (s store) listConsent(ctx context.Context, userID int64) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `SELECT id FROM safe_body_consents WHERE user_id=$1 AND revoked_at IS NULL AND scene='body_data' AND policy_version=$2 AND policy_sha256=$3`, userID, policyVersion, policySHA).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return id, err
}

func (s store) grant(ctx context.Context, userID int64) (string, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var status int16
	if err = tx.QueryRow(ctx, `SELECT status FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, userID).Scan(&status); err != nil {
		return "", err
	}
	if status != 1 {
		return "", errInactive
	}
	var id string
	var version, digest string
	err = tx.QueryRow(ctx, `SELECT id, policy_version, policy_sha256 FROM safe_body_consents WHERE user_id=$1 AND revoked_at IS NULL FOR UPDATE`, userID).Scan(&id, &version, &digest)
	if err == nil && version == policyVersion && digest == policySHA {
		if err = audit(ctx, tx, userID, "body_data_grant", id); err != nil {
			return "", err
		}
		return id, tx.Commit(ctx)
	}
	if err == nil {
		if _, err = tx.Exec(ctx, `UPDATE safe_body_consents SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, userID); err != nil {
			return "", err
		}
		if _, err = tx.Exec(ctx, `DELETE FROM safe_body_profiles WHERE user_id=$1`, userID); err != nil {
			return "", err
		}
		if _, err = tx.Exec(ctx, `DELETE FROM safe_size_charts WHERE user_id=$1`, userID); err != nil {
			return "", err
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	id = uuid.NewString()
	err = tx.QueryRow(ctx, `INSERT INTO safe_body_consents(id,user_id,scene,policy_version,policy_sha256,ui_action) VALUES($1,$2,'body_data',$3,$4,$5) RETURNING id`, id, userID, policyVersion, policySHA, consentUI).Scan(&id)
	if err != nil {
		return "", err
	}
	if err = audit(ctx, tx, userID, "body_data_grant", id); err != nil {
		return "", err
	}
	return id, tx.Commit(ctx)
}

func (s store) revoke(ctx context.Context, userID int64, consentID string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var status int16
	if err = tx.QueryRow(ctx, `SELECT status FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, userID).Scan(&status); err != nil {
		return err
	}
	if status != 1 {
		return errInactive
	}
	var id string
	err = tx.QueryRow(ctx, `SELECT id FROM safe_body_consents WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL FOR UPDATE`, consentID, userID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return errNotFound
	}
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM safe_body_profiles WHERE user_id=$1`, userID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM safe_size_charts WHERE user_id=$1`, userID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE safe_body_consents SET revoked_at=now() WHERE id=$1`, id); err != nil {
		return err
	}
	if err = audit(ctx, tx, userID, "body_data_revoke_purge", id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s store) createProfile(ctx context.Context, userID int64, p Profile) (string, error) {
	uid := uuid.NewString()
	plain, err := encode(storedProfile{UserID: userID, UID: uid, Profile: p})
	if err != nil {
		return "", err
	}
	cipher, err := s.box.Encrypt(plain)
	if err != nil {
		return "", err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var status int16
	if err = tx.QueryRow(ctx, `SELECT status FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, userID).Scan(&status); err != nil {
		return "", err
	}
	if status != 1 {
		return "", errInactive
	}
	err = tx.QueryRow(ctx, `SELECT id FROM safe_body_consents WHERE id=$1 AND user_id=$2 AND scene='body_data' AND policy_version=$3 AND policy_sha256=$4 AND revoked_at IS NULL FOR SHARE`, p.ConsentID, userID, policyVersion, policySHA).Scan(&p.ConsentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errConsent
	}
	if err != nil {
		return "", err
	}
	_, err = tx.Exec(ctx, `INSERT INTO safe_body_profiles(id,user_id,consent_id,payload_enc) VALUES($1,$2,$3,$4)`, uid, userID, p.ConsentID, cipher)
	if err != nil {
		return "", err
	}
	if err = audit(ctx, tx, userID, "body_profile_create", uid); err != nil {
		return "", err
	}
	return uid, tx.Commit(ctx)
}

func (s store) profile(ctx context.Context, userID int64, uid string) (storedProfile, error) {
	var cipher []byte
	var p storedProfile
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return p, err
	}
	defer tx.Rollback(ctx)
	err = tx.QueryRow(ctx, `SELECT p.payload_enc FROM safe_body_profiles p JOIN safe_body_consents c ON c.id=p.consent_id AND c.user_id=p.user_id WHERE p.id=$1 AND p.user_id=$2 AND c.revoked_at IS NULL AND c.scene='body_data' AND c.policy_version=$3 AND c.policy_sha256=$4 AND EXISTS(SELECT 1 FROM users u WHERE u.id=p.user_id AND u.status=1 AND u.deleted_at IS NULL) FOR SHARE OF p, c`, uid, userID, policyVersion, policySHA).Scan(&cipher)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, errNotFound
	}
	if err != nil {
		return p, err
	}
	if err = audit(ctx, tx, userID, "body_profile_read", uid); err != nil {
		return p, err
	}
	plain, err := s.box.Decrypt(cipher)
	if err != nil {
		return p, err
	}
	if err = json.Unmarshal(plain, &p); err != nil {
		return storedProfile{}, err
	}
	if p.UserID != userID || p.UID != uid || p.validate() != nil {
		return storedProfile{}, errNotFound
	}
	if err = tx.Commit(ctx); err != nil {
		return storedProfile{}, err
	}
	return p, nil
}

func (s store) deleteProfile(ctx context.Context, userID int64, uid string) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var status int16
	if err = tx.QueryRow(ctx, `SELECT status FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, userID).Scan(&status); err != nil {
		return err
	}
	if status != 1 {
		return errInactive
	}
	cmd, err := tx.Exec(ctx, `DELETE FROM safe_body_profiles WHERE id=$1 AND user_id=$2`, uid, userID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return errNotFound
	}
	if err = audit(ctx, tx, userID, "body_profile_delete", uid); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s store) saveChart(ctx context.Context, userID int64, productID string, c Chart) error {
	payload, err := encode(c)
	if err != nil {
		return err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var status int16
	if err = tx.QueryRow(ctx, `SELECT status FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, userID).Scan(&status); err != nil {
		return err
	}
	if status != 1 {
		return errInactive
	}
	var consentID string
	err = tx.QueryRow(ctx, `SELECT id FROM safe_body_consents WHERE user_id=$1 AND scene='body_data' AND policy_version=$2 AND policy_sha256=$3 AND revoked_at IS NULL FOR SHARE`, userID, policyVersion, policySHA).Scan(&consentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return errConsent
	}
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO safe_size_charts(product_id,user_id,chart) VALUES($1,$2,$3) ON CONFLICT(user_id,product_id) DO UPDATE SET chart=EXCLUDED.chart,updated_at=now()`, productID, userID, payload); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s store) loadForRecommend(ctx context.Context, userID int64, profileUID, productUID string) (Profile, Chart, error) {
	var profile Profile
	var chart Chart
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return profile, chart, err
	}
	defer tx.Rollback(ctx)
	var status int16
	if err = tx.QueryRow(ctx, `SELECT status FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, userID).Scan(&status); err != nil {
		return profile, chart, err
	}
	if status != 1 {
		return profile, chart, errInactive
	}
	var consentID string
	err = tx.QueryRow(ctx, `SELECT id FROM safe_body_consents WHERE user_id=$1 AND scene='body_data' AND policy_version=$2 AND policy_sha256=$3 AND revoked_at IS NULL FOR UPDATE`, userID, policyVersion, policySHA).Scan(&consentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return profile, chart, errConsent
	}
	if err != nil {
		return profile, chart, err
	}
	var cipher []byte
	err = tx.QueryRow(ctx, `SELECT payload_enc FROM safe_body_profiles WHERE id=$1 AND user_id=$2 AND consent_id=$3`, profileUID, userID, consentID).Scan(&cipher)
	if errors.Is(err, pgx.ErrNoRows) {
		return profile, chart, errNotFound
	}
	if err != nil {
		return profile, chart, err
	}
	var raw []byte
	err = tx.QueryRow(ctx, `SELECT chart FROM safe_size_charts WHERE user_id=$1 AND product_id=$2`, userID, productUID).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return profile, chart, errNotFound
	}
	if err != nil {
		return profile, chart, err
	}
	if err = audit(ctx, tx, userID, "size_recommend", profileUID); err != nil {
		return profile, chart, err
	}
	plain, err := s.box.Decrypt(cipher)
	if err != nil {
		return profile, chart, err
	}
	var stored storedProfile
	if err = json.Unmarshal(plain, &stored); err != nil || stored.UserID != userID || stored.UID != profileUID || stored.validate() != nil {
		return profile, chart, errNotFound
	}
	if err = json.Unmarshal(raw, &chart); err != nil {
		return profile, chart, err
	}
	if err = tx.Commit(ctx); err != nil {
		return profile, chart, err
	}
	return stored.Profile, chart, nil
}

func audit(ctx context.Context, tx pgx.Tx, userID int64, action, resourceID string) error {
	_, err := tx.Exec(ctx, `INSERT INTO adm_audit_logs(actor_type,actor_id,action,resource,resource_id,result) VALUES('user',$1,$2,'safe_size',$3,'ok')`, userID, action, resourceID)
	return err
}
