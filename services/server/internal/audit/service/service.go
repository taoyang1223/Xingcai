package service

// Service 审计只追加，其它模块通过本接口写日志，禁止直接插表。
type Service interface{}

type svc struct{}

func New() Service { return svc{} }
