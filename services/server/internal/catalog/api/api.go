package api

import (
	"github.com/gin-gonic/gin"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/response"
)

func Register(g *gin.RouterGroup) {
	g.POST("/catalog/parse", response.NotImplemented)
	g.GET("/catalog/products/:uid", response.NotImplemented)
	g.POST("/catalog/products/:uid/size-chart", response.NotImplemented)
	g.POST("/catalog/size-chart/ocr", response.NotImplemented)
	g.GET("/catalog/categories", response.NotImplemented)
}
