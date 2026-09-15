SHELL := /bin/bash
.DEFAULT_GOAL := help

ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
SERVER := $(ROOT)/services/server
ALGO := $(ROOT)/services/algo
VENV := $(ALGO)/.venv
COMPOSE := docker compose -f $(ROOT)/infra/docker-compose.yml
GOBIN := $(HOME)/go/bin
export PATH := $(GOBIN):$(PATH)
export GOPROXY ?= https://goproxy.cn,direct
export GOTOOLCHAIN := local

ifneq (,$(wildcard $(ROOT)/.env))
  include $(ROOT)/.env
  export
endif

.PHONY: help bootstrap up down dev stop-dev lint test migrate gen-proto gen-api algo-venv

help:
	@echo "make bootstrap  建库 + Python venv + Go 依赖"
	@echo "make dev        本机起 algo 与 api（需本机 postgres/redis）"
	@echo "make up         docker compose up"
	@echo "make down       docker compose down"
	@echo "make migrate    执行数据库迁移"
	@echo "make lint / test / gen-proto / gen-api"

bootstrap: algo-venv
	@test -f $(ROOT)/.env || cp $(ROOT)/.env.example $(ROOT)/.env
	bash $(ROOT)/infra/bootstrap-db.sh
	cd $(SERVER) && GOTOOLCHAIN=local go build ./...
	@echo "bootstrap ok"

algo-venv:
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install -U pip
	$(VENV)/bin/pip install -r $(ALGO)/requirements.txt

up:
	@if command -v docker >/dev/null 2>&1; then \
		$(COMPOSE) up --build -d; \
	else \
		echo "未检测到 docker，改走 make dev"; \
		$(MAKE) bootstrap dev; \
	fi

down:
	$(COMPOSE) down

dev:
	@mkdir -p $(ROOT)/.run
	@$(MAKE) stop-dev
	@cd $(ALGO) && FITME_HTTP_ADDR=127.0.0.1:8090 FITME_GRPC_ADDR=127.0.0.1:19090 \
		$(VENV)/bin/python -m app.main > $(ROOT)/.run/algo.log 2>&1 & echo $$! > $(ROOT)/.run/algo.pid
	@echo "algo pid $$(cat $(ROOT)/.run/algo.pid)"
	@sleep 1
	cd $(SERVER) && FITME_MIGRATIONS_DIR=$(SERVER)/migrations go run ./cmd/api

stop-dev:
	@if [ -f $(ROOT)/.run/algo.pid ]; then kill $$(cat $(ROOT)/.run/algo.pid) 2>/dev/null || true; rm -f $(ROOT)/.run/algo.pid; fi
	@if [ -f $(ROOT)/.run/api.pid ]; then kill $$(cat $(ROOT)/.run/api.pid) 2>/dev/null || true; rm -f $(ROOT)/.run/api.pid; fi

lint:
	cd $(SERVER) && go vet ./...
	@if [ -x $(VENV)/bin/ruff ]; then $(VENV)/bin/ruff check $(ALGO)/app; else echo "ruff not installed, skip"; fi

test:
	cd $(SERVER) && go test ./...
	@if [ -x $(VENV)/bin/python ]; then cd $(ALGO) && $(VENV)/bin/python -m pytest -q || true; fi

migrate:
	cd $(SERVER) && FITME_MIGRATIONS_DIR=$(SERVER)/migrations go run ./cmd/api -migrate-only

gen-proto:
	@mkdir -p $(ALGO)/app/pb
	protoc --proto_path=$(ROOT)/contract/proto \
		--go_out=$(SERVER) --go_opt=module=github.com/taoyang1223/Xingcai/services/server \
		--go-grpc_out=$(SERVER) --go-grpc_opt=module=github.com/taoyang1223/Xingcai/services/server \
		$(ROOT)/contract/proto/measure.proto \
		$(ROOT)/contract/proto/ocr.proto \
		$(ROOT)/contract/proto/render.proto
	$(VENV)/bin/python -m grpc_tools.protoc -I $(ROOT)/contract/proto \
		--python_out=$(ALGO)/app/pb --grpc_python_out=$(ALGO)/app/pb \
		$(ROOT)/contract/proto/measure.proto \
		$(ROOT)/contract/proto/ocr.proto \
		$(ROOT)/contract/proto/render.proto
	@touch $(ALGO)/app/pb/__init__.py

gen-api:
	@echo "骨架期：以 contract/openapi.yaml 为真源。接入 oapi-codegen / openapi-typescript 后再生成各端 DTO。"
