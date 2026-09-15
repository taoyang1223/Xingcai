package repo

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("not found")

type User struct {
	ID       int64
	UID      string
	Nickname string
	Status   int16
}

type Repository interface {
	FindAuth(ctx context.Context, provider, openID string) (userID int64, err error)
	GetUser(ctx context.Context, id int64) (User, error)
	CreateUser(ctx context.Context, uid, nickname string, phoneHash *string, phoneEnc []byte) (User, error)
	InsertAuth(ctx context.Context, userID int64, provider, openID string) error
	HasBodyProfile(ctx context.Context, userID int64) (bool, error)
	FindUserIDByPhoneHash(ctx context.Context, phoneHash string) (int64, error)
}

type pgRepo struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) Repository {
	return pgRepo{db: db}
}

func (r pgRepo) FindAuth(ctx context.Context, provider, openID string) (int64, error) {
	var id int64
	err := r.db.QueryRow(ctx,
		`SELECT user_id FROM user_auths WHERE provider = $1 AND open_id = $2`,
		provider, openID,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	return id, err
}

func (r pgRepo) GetUser(ctx context.Context, id int64) (User, error) {
	var u User
	err := r.db.QueryRow(ctx,
		`SELECT id, uid, COALESCE(nickname, ''), status FROM users WHERE id = $1 AND deleted_at IS NULL`,
		id,
	).Scan(&u.ID, &u.UID, &u.Nickname, &u.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return u, err
}

func (r pgRepo) CreateUser(ctx context.Context, uid, nickname string, phoneHash *string, phoneEnc []byte) (User, error) {
	var u User
	err := r.db.QueryRow(ctx, `
		INSERT INTO users (uid, nickname, phone_hash, phone_enc)
		VALUES ($1, $2, $3, $4)
		RETURNING id, uid, COALESCE(nickname, ''), status
	`, uid, nickname, phoneHash, phoneEnc).Scan(&u.ID, &u.UID, &u.Nickname, &u.Status)
	return u, err
}

func (r pgRepo) InsertAuth(ctx context.Context, userID int64, provider, openID string) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO user_auths (user_id, provider, open_id) VALUES ($1, $2, $3)`,
		userID, provider, openID,
	)
	return err
}

func (r pgRepo) HasBodyProfile(ctx context.Context, userID int64) (bool, error) {
	var ok bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM body_profiles WHERE user_id = $1 AND deleted_at IS NULL)`,
		userID,
	).Scan(&ok)
	return ok, err
}

func (r pgRepo) FindUserIDByPhoneHash(ctx context.Context, phoneHash string) (int64, error) {
	var id int64
	err := r.db.QueryRow(ctx,
		`SELECT id FROM users WHERE phone_hash = $1 AND deleted_at IS NULL`,
		phoneHash,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	return id, err
}
