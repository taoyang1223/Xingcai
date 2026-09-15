package auth

import (
	"github.com/gin-gonic/gin"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/errcode"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/response"
)

const (
	ctxUserID = "auth_user_id"
	ctxUID    = "auth_uid"
)

func Middleware(secret []byte) gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		if len(h) < 8 || h[:7] != "Bearer " {
			response.Fail(c, errcode.Unauthorized, "未登录或 Token 失效")
			c.Abort()
			return
		}
		claims, err := Parse(secret, h[7:])
		if err != nil {
			response.Fail(c, errcode.Unauthorized, "未登录或 Token 失效")
			c.Abort()
			return
		}
		c.Set(ctxUserID, claims.UserID)
		c.Set(ctxUID, claims.UID)
		c.Next()
	}
}

func UserID(c *gin.Context) int64 {
	v, _ := c.Get(ctxUserID)
	id, _ := v.(int64)
	return id
}

func UID(c *gin.Context) string {
	v, _ := c.Get(ctxUID)
	s, _ := v.(string)
	return s
}
