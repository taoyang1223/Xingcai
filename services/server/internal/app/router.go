package app

import (
	"context"

	"github.com/gin-gonic/gin"

	adminapi "github.com/taoyang1223/Xingcai/services/server/internal/admin/api"
	bodyapi "github.com/taoyang1223/Xingcai/services/server/internal/body/api"
	catalogapi "github.com/taoyang1223/Xingcai/services/server/internal/catalog/api"
	configapi "github.com/taoyang1223/Xingcai/services/server/internal/config/api"
	feedbackapi "github.com/taoyang1223/Xingcai/services/server/internal/feedback/api"
	identityapi "github.com/taoyang1223/Xingcai/services/server/internal/identity/api"
	identityrepo "github.com/taoyang1223/Xingcai/services/server/internal/identity/repo"
	identitysvc "github.com/taoyang1223/Xingcai/services/server/internal/identity/service"
	recommendapi "github.com/taoyang1223/Xingcai/services/server/internal/recommend/api"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/health"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/middleware"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/trace"
)

func (a *App) Router() *gin.Engine {
	if a.Cfg.Env != "dev" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Recovery(), trace.Middleware(), middleware.CORS(), middleware.AccessLog(a.Log))

	h := &health.Checker{
		Postgres: a.PG.Ping,
		Redis: func(ctx context.Context) error {
			return a.Redis.Ping(ctx).Err()
		},
		Algo: a.Algo.Health,
	}
	r.GET("/healthz", h.Live)
	r.GET("/readyz", h.Ready)

	api := r.Group("/api/v1")
	ident := identitysvc.New(identitysvc.Deps{
		Repo:      identityrepo.New(a.PG),
		Box:       a.Box,
		JWTSecret: []byte(a.Cfg.JWTSecret),
		Env:       a.Cfg.Env,
	})
	identityapi.Register(api, ident, []byte(a.Cfg.JWTSecret))
	bodyapi.Register(api)
	catalogapi.Register(api)
	recommendapi.Register(api)
	feedbackapi.Register(api)
	configapi.Register(api)

	admin := r.Group("/admin/v1")
	adminapi.Register(admin)
	return r
}
