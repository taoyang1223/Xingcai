package service

import (
	"context"
	"errors"
	"testing"

	"github.com/taoyang1223/Xingcai/services/server/internal/identity/repo"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/crypto"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/errcode"
)

type fakeRepo struct {
	auths  map[string]int64
	users  map[int64]repo.User
	nextID int64
}

func newFake() *fakeRepo {
	return &fakeRepo{auths: map[string]int64{}, users: map[int64]repo.User{}, nextID: 1}
}

func (f *fakeRepo) FindAuth(_ context.Context, provider, openID string) (int64, error) {
	id, ok := f.auths[provider+"/"+openID]
	if !ok {
		return 0, repo.ErrNotFound
	}
	return id, nil
}

func (f *fakeRepo) GetUser(_ context.Context, id int64) (repo.User, error) {
	u, ok := f.users[id]
	if !ok {
		return repo.User{}, repo.ErrNotFound
	}
	return u, nil
}

func (f *fakeRepo) CreateUser(_ context.Context, uid, nickname string, _ *string, _ []byte) (repo.User, error) {
	u := repo.User{ID: f.nextID, UID: uid, Nickname: nickname, Status: 1}
	f.nextID++
	f.users[u.ID] = u
	return u, nil
}

func (f *fakeRepo) InsertAuth(_ context.Context, userID int64, provider, openID string) error {
	f.auths[provider+"/"+openID] = userID
	return nil
}

func (f *fakeRepo) HasBodyProfile(_ context.Context, _ int64) (bool, error) { return false, nil }

func (f *fakeRepo) FindUserIDByPhoneHash(_ context.Context, _ string) (int64, error) {
	return 0, repo.ErrNotFound
}

func testSvc(t *testing.T, r repo.Repository) Service {
	t.Helper()
	box, err := crypto.New("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	if err != nil {
		t.Fatal(err)
	}
	return New(Deps{Repo: r, Box: box, JWTSecret: []byte("secret"), Env: "dev"})
}

func TestLoginWechatAnonymous(t *testing.T) {
	s := testSvc(t, newFake())
	a, code, _ := s.Login(context.Background(), LoginInput{Provider: "wechat", DeviceID: "phone-a"})
	if code != errcode.OK {
		t.Fatalf("code %d", code)
	}
	if a.Nickname == "" || a.AccessToken == "" {
		t.Fatalf("%+v", a)
	}
	b, code, _ := s.Login(context.Background(), LoginInput{Provider: "wechat", DeviceID: "phone-a"})
	if code != errcode.OK || b.UID != a.UID {
		t.Fatalf("want same uid got %s %s", a.UID, b.UID)
	}
}

func TestLoginRejectsUnknownProvider(t *testing.T) {
	s := testSvc(t, newFake())
	_, code, _ := s.Login(context.Background(), LoginInput{Provider: "idcard"})
	if code != errcode.BadRequest {
		t.Fatalf("code %d", code)
	}
}

func TestLoginWechatNotInProd(t *testing.T) {
	box, _ := crypto.New("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	s := New(Deps{Repo: newFake(), Box: box, JWTSecret: []byte("secret"), Env: "prod"})
	_, code, _ := s.Login(context.Background(), LoginInput{Provider: "wechat", DeviceID: "x"})
	if code != errcode.NotImplemented {
		t.Fatalf("code %d", code)
	}
}

func TestFakeRepoFindAuthMiss(t *testing.T) {
	f := newFake()
	_, err := f.FindAuth(context.Background(), "wechat", "none")
	if !errors.Is(err, repo.ErrNotFound) {
		t.Fatal(err)
	}
}
