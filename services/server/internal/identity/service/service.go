package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/taoyang1223/Xingcai/services/server/internal/identity/repo"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/auth"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/crypto"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/errcode"
)

type LoginInput struct {
	Provider string
	Phone    string
	Code     string
	DeviceID string
}

type Session struct {
	AccessToken    string `json:"access_token"`
	ExpiresIn      int    `json:"expires_in"`
	UID            string `json:"uid"`
	Nickname       string `json:"nickname"`
	HasBodyProfile bool   `json:"has_body_profile"`
}

type Profile struct {
	UID            string `json:"uid"`
	Nickname       string `json:"nickname"`
	HasBodyProfile bool   `json:"has_body_profile"`
}

type Service interface {
	Login(ctx context.Context, in LoginInput) (Session, int, string)
	Profile(ctx context.Context, userID int64) (Profile, int, string)
}

type Deps struct {
	Repo      repo.Repository
	Box       *crypto.Box
	JWTSecret []byte
	Env       string
}

type svc struct {
	Deps
}

func New(d Deps) Service { return svc{Deps: d} }

const tokenTTL = 7 * 24 * time.Hour

func (s svc) Login(ctx context.Context, in LoginInput) (Session, int, string) {
	provider := strings.ToLower(strings.TrimSpace(in.Provider))
	switch provider {
	case "wechat", "alipay":
		if s.Env != "dev" {
			return Session{}, errcode.NotImplemented, "骨架期未实现"
		}
		openID := strings.TrimSpace(in.DeviceID)
		if openID == "" {
			openID = "dev-device"
		}
		return s.loginOpenID(ctx, provider, "dev:"+provider+":"+openID, nil, nil)
	case "phone":
		return s.loginPhone(ctx, in)
	default:
		return Session{}, errcode.BadRequest, "参数错误"
	}
}

func (s svc) loginPhone(ctx context.Context, in LoginInput) (Session, int, string) {
	phone := strings.TrimSpace(in.Phone)
	if !validCNPhone(phone) {
		return Session{}, errcode.BadRequest, "参数错误"
	}
	if s.Env != "dev" {
		return Session{}, errcode.NotImplemented, "骨架期未实现"
	}
	if in.Code != "000000" {
		return Session{}, errcode.BadRequest, "参数错误"
	}
	hash := s.Box.HMACHex(phone)
	enc, err := s.Box.Encrypt([]byte(phone))
	if err != nil {
		return Session{}, errcode.Internal, "服务内部错误"
	}
	id, err := s.Repo.FindUserIDByPhoneHash(ctx, hash)
	if err == nil {
		return s.sessionFor(ctx, id)
	}
	if !errors.Is(err, repo.ErrNotFound) {
		return Session{}, errcode.Internal, "服务内部错误"
	}
	h := hash
	return s.createWithAuth(ctx, "phone", "phone:"+hash, &h, enc)
}

func (s svc) loginOpenID(ctx context.Context, provider, openID string, phoneHash *string, phoneEnc []byte) (Session, int, string) {
	id, err := s.Repo.FindAuth(ctx, provider, openID)
	if err == nil {
		return s.sessionFor(ctx, id)
	}
	if !errors.Is(err, repo.ErrNotFound) {
		return Session{}, errcode.Internal, "服务内部错误"
	}
	return s.createWithAuth(ctx, provider, openID, phoneHash, phoneEnc)
}

func (s svc) createWithAuth(ctx context.Context, provider, openID string, phoneHash *string, phoneEnc []byte) (Session, int, string) {
	uid, err := newUID()
	if err != nil {
		return Session{}, errcode.Internal, "服务内部错误"
	}
	nick := nicknameFor(uid)
	u, err := s.Repo.CreateUser(ctx, uid, nick, phoneHash, phoneEnc)
	if err != nil {
		return Session{}, errcode.Internal, "服务内部错误"
	}
	if err := s.Repo.InsertAuth(ctx, u.ID, provider, openID); err != nil {
		return Session{}, errcode.Internal, "服务内部错误"
	}
	return s.sessionFor(ctx, u.ID)
}

func (s svc) sessionFor(ctx context.Context, userID int64) (Session, int, string) {
	u, err := s.Repo.GetUser(ctx, userID)
	if err != nil {
		return Session{}, errcode.Internal, "服务内部错误"
	}
	if u.Status != 1 {
		return Session{}, errcode.Forbidden, "权限不足"
	}
	tok, err := auth.Sign(s.JWTSecret, u.ID, u.UID, tokenTTL)
	if err != nil {
		return Session{}, errcode.Internal, "服务内部错误"
	}
	has, err := s.Repo.HasBodyProfile(ctx, u.ID)
	if err != nil {
		return Session{}, errcode.Internal, "服务内部错误"
	}
	return Session{
		AccessToken:    tok,
		ExpiresIn:      int(tokenTTL.Seconds()),
		UID:            u.UID,
		Nickname:       u.Nickname,
		HasBodyProfile: has,
	}, errcode.OK, "ok"
}

func (s svc) Profile(ctx context.Context, userID int64) (Profile, int, string) {
	u, err := s.Repo.GetUser(ctx, userID)
	if err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			return Profile{}, errcode.Unauthorized, "未登录或 Token 失效"
		}
		return Profile{}, errcode.Internal, "服务内部错误"
	}
	has, err := s.Repo.HasBodyProfile(ctx, u.ID)
	if err != nil {
		return Profile{}, errcode.Internal, "服务内部错误"
	}
	return Profile{UID: u.UID, Nickname: u.Nickname, HasBodyProfile: has}, errcode.OK, "ok"
}

func newUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

func nicknameFor(uid string) string {
	if len(uid) < 4 {
		return "用户"
	}
	return fmt.Sprintf("用户 %s", strings.ToUpper(uid[len(uid)-4:]))
}

func validCNPhone(s string) bool {
	if len(s) != 11 || s[0] != '1' {
		return false
	}
	for _, r := range s {
		if !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}
