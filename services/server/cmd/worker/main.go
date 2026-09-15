package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/redis/go-redis/v9"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/appconf"
)

func main() {
	cfg := appconf.Load()
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	rdb := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr})
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Error("redis", "err", err)
		os.Exit(1)
	}
	log.Info("worker started", "redis", cfg.RedisAddr)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	_ = rdb.Close()
}
