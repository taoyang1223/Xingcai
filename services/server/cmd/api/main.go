package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/taoyang1223/Xingcai/services/server/internal/app"
	"github.com/taoyang1223/Xingcai/services/server/internal/shared/appconf"
)

func main() {
	migrateOnly := flag.Bool("migrate-only", false, "run migrations and exit")
	flag.Parse()

	cfg := appconf.Load()
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(log)

	ctx := context.Background()
	a, err := app.New(ctx, cfg, log)
	if err != nil {
		log.Error("bootstrap failed", "err", err)
		os.Exit(1)
	}
	defer a.Close()

	if err := a.Migrate(); err != nil {
		log.Error("migrate failed", "err", err)
		os.Exit(1)
	}
	if *migrateOnly {
		log.Info("migrate done")
		return
	}

	srv := &http.Server{Addr: cfg.HTTPAddr, Handler: a.Router()}
	go func() {
		log.Info("api listening", "addr", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("listen", "err", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Info("shutting down")
	shctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shctx)
}
