package health

import (
	"context"

	"github.com/gin-gonic/gin"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/errcode"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/response"
)

type PingFunc func(ctx context.Context) error

type Checker struct {
	Postgres PingFunc
	Redis    PingFunc
	Algo     PingFunc
}

func (h *Checker) Live(c *gin.Context) {
	response.OK(c, gin.H{"status": "ok"})
}

func (h *Checker) Ready(c *gin.Context) {
	ctx := c.Request.Context()
	deps := gin.H{}
	ok := true
	check := func(name string, fn PingFunc) {
		if fn == nil {
			deps[name] = "skipped"
			return
		}
		if err := fn(ctx); err != nil {
			deps[name] = "down"
			ok = false
			return
		}
		deps[name] = "ok"
	}
	check("postgres", h.Postgres)
	check("redis", h.Redis)
	check("algo", h.Algo)

	payload := gin.H{"status": "ok", "deps": deps}
	if ok {
		response.OK(c, payload)
		return
	}
	payload["status"] = "degraded"
	response.JSON(c, 503, errcode.Internal, "degraded", payload)
}
