package api

import (
	"github.com/gin-gonic/gin"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/response"
)

func Register(g *gin.RouterGroup) {
	g.GET("/body/profiles", response.NotImplemented)
	g.POST("/body/profiles", response.NotImplemented)
	g.GET("/body/profiles/:uid", response.NotImplemented)
	g.PATCH("/body/profiles/:uid/measurements", response.NotImplemented)
	g.DELETE("/body/profiles/:uid", response.NotImplemented)
	g.POST("/body/photo-upload-token", response.NotImplemented)
	g.POST("/body/measure-jobs", response.NotImplemented)
	g.GET("/body/measure-jobs/:job_uid", response.NotImplemented)
	g.GET("/body/guide", response.NotImplemented)
}
