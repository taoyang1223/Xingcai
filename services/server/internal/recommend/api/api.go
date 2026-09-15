package api

import (
	"github.com/gin-gonic/gin"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/response"
)

func Register(g *gin.RouterGroup) {
	g.POST("/recommend/size", response.NotImplemented)
	g.GET("/recommend/records/:uid", response.NotImplemented)
	g.GET("/recommend/history", response.NotImplemented)
	g.POST("/tryon/preview", response.NotImplemented)
}
