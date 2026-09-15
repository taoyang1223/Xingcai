package api

import (
	"github.com/gin-gonic/gin"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/response"
)

func Register(g *gin.RouterGroup) {
	g.POST("/auth/login", response.NotImplemented)
	g.GET("/review/tasks", response.NotImplemented)
	g.POST("/review/tasks/:id/claim", response.NotImplemented)
	g.POST("/review/tasks/:id/submit", response.NotImplemented)
	g.GET("/catalog/products", response.NotImplemented)
	g.PUT("/catalog/size-charts/:id", response.NotImplemented)
	g.GET("/config/rule-sets", response.NotImplemented)
	g.GET("/dashboard/metrics", response.NotImplemented)
	g.GET("/audit/logs", response.NotImplemented)
}
