package trace

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const ContextKey = "trace_id"

func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tid := c.GetHeader("X-Request-Id")
		if tid == "" {
			tid = uuid.NewString()
		}
		c.Set(ContextKey, tid)
		c.Header("X-Trace-Id", tid)
		c.Next()
	}
}

func From(c *gin.Context) string {
	v, ok := c.Get(ContextKey)
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}
