package safesize

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/auth"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/crypto"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/errcode"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/response"
)

type repository interface {
	active(context.Context, int64) error
	listConsent(context.Context, int64) (string, error)
	grant(context.Context, int64) (string, error)
	revoke(context.Context, int64, string) error
	createProfile(context.Context, int64, Profile) (string, error)
	profile(context.Context, int64, string) (storedProfile, error)
	deleteProfile(context.Context, int64, string) error
	saveChart(context.Context, int64, string, Chart) error
	loadForRecommend(context.Context, int64, string, string) (Profile, Chart, error)
}

type handler struct{ repo repository }

func Register(g *gin.RouterGroup, db *pgxpool.Pool, box *crypto.Box, secret []byte, enabled bool) {
	h := handler{repo: store{db: db, box: box}}
	secured := g.Group("/")
	secured.Use(func(c *gin.Context) {
		if !enabled {
			response.NotImplemented(c)
			c.Abort()
			return
		}
	})
	secured.Use(auth.Middleware(secret))
	h.routes(secured)
}

func (h handler) routes(g *gin.RouterGroup) {
	g.GET("/user/consents", h.consents)
	g.POST("/user/consents", h.grant)
	g.DELETE("/user/consents/:consent_id", h.revoke)
	g.POST("/body/profiles", h.create)
	g.GET("/body/profiles/:uid", h.get)
	g.DELETE("/body/profiles/:uid", h.delete)
	g.POST("/catalog/products/:uid/size-chart", h.saveChart)
	g.POST("/recommend/size", h.recommend)
}

func bind(c *gin.Context, value any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32<<10)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		response.Fail(c, errcode.BadRequest, "参数错误")
		return false
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		response.Fail(c, errcode.BadRequest, "参数错误")
		return false
	}
	return true
}

func uid(c *gin.Context, key string) (string, bool) {
	id, err := uuid.Parse(c.Param(key))
	if err != nil {
		response.Fail(c, errcode.BadRequest, "参数错误")
		return "", false
	}
	return id.String(), true
}

func fail(c *gin.Context, err error) {
	switch {
	case errors.Is(err, errNotFound):
		response.Fail(c, errcode.NotFound, "资源不存在")
	case errors.Is(err, pgx.ErrNoRows):
		response.Fail(c, errcode.Unauthorized, "账户不可用")
	case errors.Is(err, errConsent):
		response.Fail(c, errcode.ConsentRequired, "需要有效的单独同意")
	case errors.Is(err, errInactive):
		response.Fail(c, errcode.Unauthorized, "账户不可用")
	default:
		response.Fail(c, errcode.Internal, "服务内部错误")
	}
}

func (h handler) consents(c *gin.Context) {
	id := auth.UserID(c)
	if err := h.repo.active(c.Request.Context(), id); err != nil {
		fail(c, err)
		return
	}
	consentID, err := h.repo.listConsent(c.Request.Context(), id)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"scene": "body_data", "policy_version": policyVersion, "consent_id": consentID, "granted": consentID != ""})
}

func (h handler) grant(c *gin.Context) {
	var v ConsentGrant
	if !bind(c, &v) {
		return
	}
	if err := v.validate(); err != nil {
		response.Fail(c, errcode.BadRequest, "需要单独主动同意当前政策")
		return
	}
	id, err := h.repo.grant(c.Request.Context(), auth.UserID(c))
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"consent_id": id, "scene": "body_data", "policy_version": policyVersion, "evidence": "dev_checkbox_fields_only"})
}

func (h handler) revoke(c *gin.Context) {
	id, ok := uid(c, "consent_id")
	if !ok {
		return
	}
	if err := h.repo.revoke(c.Request.Context(), auth.UserID(c), id); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"revoked": true, "profiles_deleted": true, "private_charts_deleted": true})
}

func (h handler) create(c *gin.Context) {
	var p Profile
	if !bind(c, &p) {
		return
	}
	if err := p.validate(); err != nil {
		response.Fail(c, errcode.BadRequest, "参数错误")
		return
	}
	id, err := h.repo.createProfile(c.Request.Context(), auth.UserID(c), p)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"uid": id, "source": "manual_weak"})
}

func (h handler) get(c *gin.Context) {
	id, ok := uid(c, "uid")
	if !ok {
		return
	}
	userID := auth.UserID(c)
	if err := h.repo.active(c.Request.Context(), userID); err != nil {
		fail(c, err)
		return
	}
	p, err := h.repo.profile(c.Request.Context(), userID, id)
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"uid": id, "profile": p.Profile, "source": "manual_weak"})
}

func (h handler) delete(c *gin.Context) {
	id, ok := uid(c, "uid")
	if !ok {
		return
	}
	if err := h.repo.deleteProfile(c.Request.Context(), auth.UserID(c), id); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"deleted": true})
}

func (h handler) saveChart(c *gin.Context) {
	id, ok := uid(c, "uid")
	if !ok {
		return
	}
	var chart Chart
	if !bind(c, &chart) {
		return
	}
	norm, err := chart.normalized()
	if err != nil {
		response.Fail(c, errcode.BadRequest, "尺码表单位或部位无效")
		return
	}
	if err := h.repo.saveChart(c.Request.Context(), auth.UserID(c), id, norm); err != nil {
		fail(c, err)
		return
	}
	response.OK(c, gin.H{"product_uid": id, "unit": "cm", "measure_mode": "circumference"})
}

func (h handler) recommend(c *gin.Context) {
	var v struct {
		ProfileUID string `json:"profile_uid"`
		ProductUID string `json:"product_uid"`
	}
	if !bind(c, &v) {
		return
	}
	profileID, err1 := uuid.Parse(v.ProfileUID)
	productID, err2 := uuid.Parse(v.ProductUID)
	if err1 != nil || err2 != nil {
		response.Fail(c, errcode.BadRequest, "参数错误")
		return
	}
	profile, chart, err := h.repo.loadForRecommend(c.Request.Context(), auth.UserID(c), profileID.String(), productID.String())
	if err != nil {
		fail(c, err)
		return
	}
	response.OK(c, recommend(profile, chart))
}
