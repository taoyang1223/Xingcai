package service

type Service interface{}

type svc struct{}

func New() Service { return svc{} }
