package algoclient

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/taoyang1223/Xingcai/services/server/internal/shared/pb/measurev1"
)

type Client struct {
	conn    *grpc.ClientConn
	measure measurev1.MeasureServiceClient
}

func Dial(addr string) (*Client, error) {
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}
	return &Client{
		conn:    conn,
		measure: measurev1.NewMeasureServiceClient(conn),
	}, nil
}

func (c *Client) Close() error {
	if c == nil || c.conn == nil {
		return nil
	}
	return c.conn.Close()
}

func (c *Client) Health(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	resp, err := c.measure.GetProviderHealth(ctx, &measurev1.Empty{})
	if err != nil {
		return err
	}
	if !resp.GetHealthy() {
		return fmt.Errorf("algo unhealthy: %s", resp.GetMessage())
	}
	return nil
}

func (c *Client) Measure() measurev1.MeasureServiceClient {
	return c.measure
}
