package api

import (
	"github.com/gin-gonic/gin"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/response"
)

func Register(g *gin.RouterGroup) {
	g.POST("/feedback/fit", response.NotImplemented)
	g.GET("/feedback/pending", response.NotImplemented)
	g.POST("/feedback/tickets", response.NotImplemented)
}
