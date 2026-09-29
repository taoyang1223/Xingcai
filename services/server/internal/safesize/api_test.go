package safesize

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/auth"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/errcode"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/response"
)

type fakeStore struct {
	owner       int64
	consent     string
	profileData storedProfile
	chartData   Chart
}

func (f *fakeStore) active(_ context.Context, _ int64) error { return nil }
func (f *fakeStore) listConsent(_ context.Context, user int64) (string, error) {
	if user != f.owner {
		return "", nil
	}
	return f.consent, nil
}
func (f *fakeStore) grant(_ context.Context, user int64) (string, error) {
	f.owner = user
	return f.consent, nil
}
func (f *fakeStore) revoke(_ context.Context, user int64, consent string) error {
	if user != f.owner || consent != f.consent {
		return errNotFound
	}
	f.consent = ""
	f.profileData = storedProfile{}
	return nil
}
func (f *fakeStore) createProfile(_ context.Context, user int64, p Profile) (string, error) {
	if user != f.owner || p.ConsentID != f.consent || f.consent == "" {
		return "", errConsent
	}
	f.profileData = storedProfile{UserID: user, UID: profileUUID, Profile: p}
	return profileUUID, nil
}
func (f *fakeStore) profile(_ context.Context, user int64, uid string) (storedProfile, error) {
	if user != f.owner || uid != f.profileData.UID || f.consent == "" {
		return storedProfile{}, errNotFound
	}
	return f.profileData, nil
}
func (f *fakeStore) deleteProfile(_ context.Context, user int64, uid string) error {
	if user != f.owner || uid != f.profileData.UID {
		return errNotFound
	}
	f.profileData = storedProfile{}
	return nil
}
func (f *fakeStore) saveChart(_ context.Context, user int64, _ string, c Chart) error {
	if user != f.owner || f.consent == "" {
		return errConsent
	}
	f.chartData = c
	return nil
}
func (f *fakeStore) loadForRecommend(_ context.Context, user int64, profileUID, _ string) (Profile, Chart, error) {
	if f.consent == "" {
		return Profile{}, Chart{}, errConsent
	}
	p, err := f.profile(context.Background(), user, profileUID)
	if err != nil {
		return Profile{}, Chart{}, err
	}
	if user != f.owner || len(f.chartData.Sizes) == 0 {
		return Profile{}, Chart{}, errNotFound
	}
	return p.Profile, f.chartData, nil
}

const profileUUID = "6ed1ce17-69f9-4a4a-b711-8832d1af8d8a"
const consentUUID = "eb1c4288-abf3-482c-9ee3-33d2a06ca851"
const productUUID = "0d9eaee8-e32c-4f93-a572-2f94b15bd45a"

func request(t *testing.T, router *gin.Engine, method, path, token, body string) response.Envelope {
	t.Helper()
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	router.ServeHTTP(w, req)
	var v response.Envelope
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestConsentOwnerAndRecommendationAPI(t *testing.T) {
	gin.SetMode(gin.TestMode)
	secret := []byte("test-secret")
	one, _ := auth.Sign(secret, 1, "one", time.Hour)
	two, _ := auth.Sign(secret, 2, "two", time.Hour)
	f := &fakeStore{owner: 1, consent: consentUUID}
	r := gin.New()
	g := r.Group("/api/v1")
	g.Use(auth.Middleware(secret))
	(handler{repo: f}).routes(g)
	path := "/api/v1/body/profiles"
	body := `{"consent_id":"` + consentUUID + `","height_cm":170,"body_shape":"standard","measurements_cm":{"chest":90}}`
	if got := request(t, r, http.MethodPost, "/api/v1/user/consents", one, `{"scene":"body_data","policy_version":"body-data-v1","agree":true}`); got.Code != errcode.BadRequest {
		t.Fatalf("consent without evidence code %d", got.Code)
	}
	if got := request(t, r, http.MethodPost, path, "", body); got.Code != errcode.Unauthorized {
		t.Fatalf("unauthenticated code %d", got.Code)
	}
	if got := request(t, r, http.MethodPost, path, one, `{"height_cm":170,"body_shape":"standard"}`); got.Code != errcode.BadRequest {
		t.Fatalf("missing consent code %d", got.Code)
	}
	if got := request(t, r, http.MethodPost, path, two, body); got.Code != errcode.ConsentRequired {
		t.Fatalf("other owner consent code %d", got.Code)
	}
	if got := request(t, r, http.MethodPost, path, one, body); got.Code != errcode.OK {
		t.Fatalf("create code %d", got.Code)
	}
	if got := request(t, r, http.MethodGet, path+"/"+profileUUID, two, ""); got.Code != errcode.NotFound {
		t.Fatalf("IDOR read code %d", got.Code)
	}
	if got := request(t, r, http.MethodPost, "/api/v1/catalog/products/"+productUUID+"/size-chart", one, `{"category":"tshirt","unit":"cm","measure_mode":"flat_half","sizes":[{"label":"M","measurements":{"chest":50}}]}`); got.Code != errcode.OK {
		t.Fatalf("chart code %d", got.Code)
	}
	if got := request(t, r, http.MethodPost, "/api/v1/catalog/products/"+productUUID+"/size-chart", two, `{"category":"tshirt","unit":"cm","measure_mode":"flat_half","sizes":[{"label":"M","measurements":{"chest":50}}]}`); got.Code != errcode.ConsentRequired {
		t.Fatalf("other owner's chart code %d", got.Code)
	}
	if f.chartData.Sizes[0].Measurements["chest"] != 100 {
		t.Fatal("flat half conversion missing")
	}
	rec := `{"profile_uid":"` + profileUUID + `","product_uid":"` + productUUID + `"}`
	if got := request(t, r, http.MethodPost, "/api/v1/recommend/size", two, rec); got.Code != errcode.NotFound {
		t.Fatalf("IDOR recommend code %d", got.Code)
	}
	if got := request(t, r, http.MethodPost, "/api/v1/recommend/size", one, rec); got.Code != errcode.OK {
		t.Fatalf("recommend code %d", got.Code)
	}
	if got := request(t, r, http.MethodDelete, "/api/v1/user/consents/"+consentUUID, two, ""); got.Code != errcode.NotFound {
		t.Fatalf("IDOR revoke code %d", got.Code)
	}
	if got := request(t, r, http.MethodDelete, "/api/v1/user/consents/"+consentUUID, one, ""); got.Code != errcode.OK {
		t.Fatalf("revoke code %d", got.Code)
	}
	if got := request(t, r, http.MethodGet, path+"/"+profileUUID, one, ""); got.Code != errcode.NotFound {
		t.Fatalf("profile remains after revoke: %d", got.Code)
	}
}
