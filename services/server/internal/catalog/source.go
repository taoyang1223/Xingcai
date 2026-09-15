package catalog

import "context"

type ProductDraft struct {
	Platform string
	ItemID   string
	Title    string
	Raw      string
}

// ProductSource 商品取数防腐层。第一期只接 ManualSource，手动录入永不下线。
type ProductSource interface {
	Parse(ctx context.Context, raw string) (ProductDraft, error)
}

type ManualSource struct{}

func (ManualSource) Parse(_ context.Context, raw string) (ProductDraft, error) {
	return ProductDraft{Platform: "manual", Title: raw, Raw: raw}, nil
}
