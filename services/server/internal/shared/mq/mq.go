package mq

import (
	"context"

	"github.com/redis/go-redis/v9"
)

// Queue 是异步任务接口。第一期用 Redis Stream，换 RocketMQ 时只改适配器。
type Queue interface {
	Enqueue(ctx context.Context, stream string, values map[string]interface{}) error
}

type RedisStream struct {
	rdb *redis.Client
}

func NewRedisStream(rdb *redis.Client) *RedisStream {
	return &RedisStream{rdb: rdb}
}

func (q *RedisStream) Enqueue(ctx context.Context, stream string, values map[string]interface{}) error {
	return q.rdb.XAdd(ctx, &redis.XAddArgs{Stream: stream, Values: values}).Err()
}
