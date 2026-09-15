package api

import (
	"github.com/gin-gonic/gin"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/response"
)

func Register(g *gin.RouterGroup) {
	g.POST("/auth/sms/send", response.NotImplemented)
	g.POST("/auth/login", response.NotImplemented)
	g.POST("/auth/refresh", response.NotImplemented)
	g.POST("/auth/logout", response.NotImplemented)
	g.GET("/user/profile", response.NotImplemented)
	g.PATCH("/user/profile", response.NotImplemented)
	g.GET("/user/consents", response.NotImplemented)
	g.POST("/user/consents", response.NotImplemented)
	g.POST("/user/deletion", response.NotImplemented)
}
