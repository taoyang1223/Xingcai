package service

// Service 是 body 模块对外入口。其它模块只能依赖本接口。
type Service interface{}

type svc struct{}

func New() Service { return svc{} }
