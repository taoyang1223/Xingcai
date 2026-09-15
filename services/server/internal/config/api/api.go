package api

import (
	"github.com/gin-gonic/gin"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/response"
)

func Register(g *gin.RouterGroup) {
	g.GET("/common/config", response.NotImplemented)
	g.GET("/content/banners", response.NotImplemented)
	g.POST("/common/events", response.NotImplemented)
}
