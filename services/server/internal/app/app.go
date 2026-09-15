package app

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/taoyang1223/Xingcai/services/server/internal/shared/algoclient"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/appconf"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/crypto"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/mq"
)

type App struct {
	Cfg   appconf.Config
	Log   *slog.Logger
	PG    *pgxpool.Pool
	Redis *redis.Client
	Algo  *algoclient.Client
	Box   *crypto.Box
	Queue mq.Queue
}

func New(ctx context.Context, cfg appconf.Config, log *slog.Logger) (*App, error) {
	box, err := crypto.New(cfg.CryptoKeyHex)
	if err != nil {
		return nil, err
	}

	pg, err := pgxpool.New(ctx, cfg.PostgresDSN)
	if err != nil {
		return nil, fmt.Errorf("postgres pool: %w", err)
	}
	if err := pg.Ping(ctx); err != nil {
		pg.Close()
		return nil, fmt.Errorf("postgres ping: %w", err)
	}

	rdb := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr})
	if err := rdb.Ping(ctx).Err(); err != nil {
		pg.Close()
		return nil, fmt.Errorf("redis ping: %w", err)
	}

	algo, err := algoclient.Dial(cfg.AlgoGRPCAddr)
	if err != nil {
		_ = rdb.Close()
		pg.Close()
		return nil, fmt.Errorf("algo dial: %w", err)
	}

	return &App{
		Cfg:   cfg,
		Log:   log,
		PG:    pg,
		Redis: rdb,
		Algo:  algo,
		Box:   box,
		Queue: mq.NewRedisStream(rdb),
	}, nil
}

func (a *App) Close() {
	if a.Algo != nil {
		_ = a.Algo.Close()
	}
	if a.Redis != nil {
		_ = a.Redis.Close()
	}
	if a.PG != nil {
		a.PG.Close()
	}
}

func (a *App) Migrate() error {
	src := "file://" + a.Cfg.MigrationsDir
	m, err := migrate.New(src, a.Cfg.PostgresDSN)
	if err != nil {
		return fmt.Errorf("migrate open: %w", err)
	}
	defer func() { _, _ = m.Close() }()
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("migrate up: %w", err)
	}
	return nil
}
