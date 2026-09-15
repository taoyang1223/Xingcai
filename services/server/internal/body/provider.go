package body

import "context"

type PhotoRef struct {
	View   string
	OSSKey string
}

type MeasureRequest struct {
	JobUID       string
	Gender       int32
	HeightCM     float32
	WeightKG     float32
	Photos       []PhotoRef
	ProviderHint string
}

type MeasureResult struct {
	Measurements map[string]float32
	Confidence   map[string]float32
	MeshKey      string
	ProviderCode string
	CostMS       int32
}

// MeasureProvider 量体防腐层。业务代码只依赖本接口，禁止直接调用厂商 SDK。
type MeasureProvider interface {
	Measure(ctx context.Context, req MeasureRequest) (MeasureResult, error)
	Health(ctx context.Context) error
}
