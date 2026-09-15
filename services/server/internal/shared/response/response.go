package response

import (
	"github.com/gin-gonic/gin"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/errcode"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/trace"
)

type Envelope struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data"`
	TraceID string      `json:"trace_id"`
}

func JSON(c *gin.Context, httpStatus, code int, message string, data interface{}) {
	c.JSON(httpStatus, Envelope{
		Code:    code,
		Message: message,
		Data:    data,
		TraceID: trace.From(c),
	})
}

func OK(c *gin.Context, data interface{}) {
	JSON(c, 200, errcode.OK, "ok", data)
}

func Fail(c *gin.Context, code int, message string) {
	JSON(c, errcode.HTTPStatus(code), code, message, nil)
}

func NotImplemented(c *gin.Context) {
	Fail(c, errcode.NotImplemented, "骨架期未实现")
}
