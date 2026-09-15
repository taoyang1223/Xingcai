# FitMe 工程说明（骨架）

用户建立带真实尺寸的 3D 人体模型，用来选对现成衣服的尺码、预览穿着效果。产品文档在 [`智能量体试衣/`](./智能量体试衣/README.md)。

当前批次：**A 仓与工具链**。目标是本机能起全套依赖探测，业务接口先返回 `50002`。

## 目录

```
contract/                 唯一契约（OpenAPI / proto / 错误码 / 埋点）
apps/                     C 端（现为 Web 对照设计稿；Flutter 在相机批次立）
web/                      React 后台空壳
services/server/          Go 模块化单体
services/algo/            Python 算法桩（Measure / OCR）
infra/                    Docker Compose 与镜像
智能量体试衣/              产品与技术文档
```

## 本机启动（无 Docker）

本机需 PostgreSQL 15+、Redis 7、Go 1.22、Python 3.11+。

```bash
cp .env.example .env
make bootstrap   # 建库、venv、依赖
make dev         # 起 algo + api，前台日志
# 另开终端
curl -s http://127.0.0.1:8080/healthz
curl -s http://127.0.0.1:8080/readyz
# C 端登录/首页
cd apps/fitme && npm install && npm run dev   # http://127.0.0.1:5174
```

开发环境微信/支付宝登录不拉实名，用设备号建匿名账号。手机号验证码填 `000000`。

`/healthz` 表示进程存活；`/readyz` 会探 postgres、redis、algo gRPC。

本机若 9090 已被占用（常见于代理），本地 gRPC 使用 **19090**。Compose 网络内部仍是 9090。

## Docker Compose

```bash
make up          # postgres / redis / algo / server / admin
make down
```

若宿主机 5432/6379 已被占用，改 `infra/docker-compose.yml` 的 ports 映射。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `make lint` | Go vet + 算法 ruff（有则跑） |
| `make test` | 各端单测 |
| `make migrate` | 对当前 DSN 执行迁移 |
| `make gen-proto` | 从 `contract/proto` 生成 Go / Python 代码 |
| `make gen-api` | 契约代码生成（骨架期打印说明） |

## 纪律（骨架期就要守）

1. 业务代码不直接 import 厂商 SDK，只走 `MeasureProvider` / `ProductSource`。
2. 围度加解密只走 `internal/shared/crypto`。
3. 改 API 先改 `contract/openapi.yaml`。
4. 日志不得出现围度数字、手机号明文。
5. 模块间只依赖对方 service 接口，禁止 import `repo`。
