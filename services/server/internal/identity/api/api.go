package api

import (
	"github.com/gin-gonic/gin"
	"github.com/taoyang1223/Xingcai/services/server/internal/identity/service"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/auth"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/errcode"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/response"
)

func Register(g *gin.RouterGroup, svc service.Service, secret []byte) {
	g.POST("/auth/sms/send", sendSMS)
	g.POST("/auth/login", func(c *gin.Context) { login(c, svc) })
	g.POST("/auth/refresh", response.NotImplemented)
	g.POST("/auth/logout", func(c *gin.Context) { response.OK(c, gin.H{}) })

	need := g.Group("/")
	need.Use(auth.Middleware(secret))
	need.GET("/user/profile", func(c *gin.Context) { profile(c, svc) })
	need.PATCH("/user/profile", response.NotImplemented)
	need.GET("/user/consents", response.NotImplemented)
	need.POST("/user/consents", response.NotImplemented)
	need.POST("/user/deletion", response.NotImplemented)
}

type loginBody struct {
	Provider string `json:"provider"`
	Phone    string `json:"phone"`
	Code     string `json:"code"`
	DeviceID string `json:"device_id"`
}

type smsBody struct {
	Phone string `json:"phone"`
}

func sendSMS(c *gin.Context) {
	var body smsBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Fail(c, errcode.BadRequest, "参数错误")
		return
	}
	// 开发环境只确认收到请求，不发短信，也不把手机号写入日志。
	response.OK(c, gin.H{"sent": true})
}

func login(c *gin.Context, svc service.Service) {
	var body loginBody
	if err := c.ShouldBindJSON(&body); err != nil {
		response.Fail(c, errcode.BadRequest, "参数错误")
		return
	}
	device := body.DeviceID
	if device == "" {
		device = c.GetHeader("X-Device-Id")
	}
	sess, code, msg := svc.Login(c.Request.Context(), service.LoginInput{
		Provider: body.Provider,
		Phone:    body.Phone,
		Code:     body.Code,
		DeviceID: device,
	})
	if code != errcode.OK {
		response.Fail(c, code, msg)
		return
	}
	response.OK(c, sess)
}

func profile(c *gin.Context, svc service.Service) {
	p, code, msg := svc.Profile(c.Request.Context(), auth.UserID(c))
	if code != errcode.OK {
		response.Fail(c, code, msg)
		return
	}
	response.OK(c, p)
}
