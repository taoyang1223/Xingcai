# 03 · API 接口设计规范

> 面向：iOS App、Android App、Web 后台（决策 1 的三端共用同一服务端）
> 约定：REST + JSON over HTTPS；内部服务间 gRPC
> 关联：《01-技术架构设计》第 3 章、《06-安全与合规设计》

---

## 1. 通用约定

### 1.1 入口与版本

| 端 | Base URL | 网络可达性 |
| --- | --- | --- |
| C 端 App | `https://api.fitme.com/api/v1` | 公网 |
| 后台管理 | `https://admin-api.fitme.com/admin/v1` | **仅内网 / VPN**，公网不解析 |
| 内部服务 | gRPC，集群内 | 不出集群 |

版本放路径（`/v1`）。破坏性变更升版本并保留旧版至少 2 个 App 大版本周期——App 用户不会及时升级，这点和 Web 完全不同。

### 1.2 统一响应体

成功与失败使用同一外壳，HTTP 状态码同时保持语义正确（不要一律返回 200）：

```json
{
  "code": 0,
  "message": "ok",
  "data": { },
  "trace_id": "a1b2c3d4e5f6"
}
```

```json
{
  "code": 40301,
  "message": "尚未取得人体数据处理同意",
  "data": null,
  "trace_id": "a1b2c3d4e5f6"
}
```

`trace_id` 必须透传到日志与 APM，客服拿到用户截图上的 trace_id 就能定位整条链路。

### 1.3 错误码规范

五位数字：`前两位 = HTTP 状态`，`后三位 = 业务序号`。

| 码 | 含义 | 客户端应做什么 |
| --- | --- | --- |
| 0 | 成功 | — |
| 40001 | 参数错误 | 提示具体字段 |
| 40101 | 未登录/Token 失效 | 静默刷新，失败则跳登录 |
| 40301 | 缺少必要的同意授权 | 跳同意页 |
| 40302 | 权限不足（后台） | 提示无权限 |
| 40401 | 资源不存在 | — |
| 40901 | 幂等冲突/重复提交 | 忽略或提示 |
| 42901 | 触发限流 | 退避重试（读 `Retry-After`） |
| 50001 | 服务内部错误 | 提示稍后重试，上报 |
| 50301 | 第三方量体服务不可用 | **降级到手动输入建模** |
| 50302 | 商品解析失败 | **降级到手动录入尺码表** |

> 每个 5xx 错误码都应配一条明确的降级路径。本产品强依赖外部服务，"报个错就结束"等于流失用户。

### 1.4 鉴权

- **C 端**：`Authorization: Bearer <access_token>`。access_token 有效期 2 小时，refresh_token 30 天且一次性轮换（使用后作废并下发新的，检测到复用即视为泄露，全端下线）。
- **后台**：同机制 + **强制 MFA** + IP 白名单；access_token 有效期 30 分钟，无操作 30 分钟自动登出。
- **敏感操作二次验证**：删除身体数据、注销账号、后台导出数据，需重新输入验证码或 MFA。

### 1.5 通用请求头

| Header | 必填 | 说明 |
| --- | --- | --- |
| `Authorization` | 登录后 | Bearer Token |
| `X-Device-Id` | 是 | 设备唯一标识（非 IMEI，用应用内生成的匿名 ID） |
| `X-App-Version` | 是 | 用于灰度与兼容判断 |
| `X-Platform` | 是 | ios / android / web-admin |
| `X-Request-Id` | 是 | 客户端生成 UUID，用于幂等与追踪 |
| `X-Idempotency-Key` | 写操作 | 创建类接口必带，服务端 30 秒内去重 |

### 1.6 分页、排序与筛选

```
GET /api/v1/xxx?page=1&page_size=20&sort=-created_at&status=active
```

```json
{
  "list": [],
  "pagination": { "page": 1, "page_size": 20, "total": 137, "has_more": true }
}
```

`page_size` 上限 100。后台导出类接口不走分页，走异步导出任务（见 3.5）。

### 1.7 幂等与并发

所有 `POST` 创建类接口必须支持 `X-Idempotency-Key`；更新类接口用乐观锁（请求带 `version`，不匹配返回 40901）。建模、解析这类耗时任务一律"提交返回 job_id + 轮询/推送"，不得长时间挂起 HTTP 连接。

### 1.8 限流

| 维度 | 阈值 | 说明 |
| --- | --- | --- |
| 单用户 · 建模提交 | 5 次/小时、20 次/天 | 直接关联 SDK 成本 |
| 单用户 · 商品解析 | 60 次/小时 | 防脚本刷 |
| 单用户 · 通用读 | 600 次/分钟 | |
| 单 IP · 未登录 | 100 次/分钟 | |
| 后台 · 数据导出 | 3 次/天，需审批 | 合规要求 |

---

## 2. C 端接口清单

### 2.1 账号与同意

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/sms/send` | 发送验证码 |
| POST | `/auth/login` | 手机号/微信/Apple 登录 |
| POST | `/auth/refresh` | 刷新 Token |
| POST | `/auth/logout` | 登出 |
| GET | `/user/profile` | 用户资料 |
| PATCH | `/user/profile` | 修改资料 |
| GET | `/user/consents` | 查询同意状态 |
| POST | `/user/consents` | 授予/撤回同意（**单独同意，一次一个场景**） |
| POST | `/user/deletion` | 申请注销（二次验证 + 7 天冷静期） |

### 2.2 身体档案与建模

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/body/profiles` | 我的档案列表 |
| POST | `/body/profiles` | 手动建档（身高体重等，B-1 兜底路径） |
| GET | `/body/profiles/{uid}` | 档案详情（含围度与模型签名 URL） |
| PATCH | `/body/profiles/{uid}/measurements` | 用户手动校正围度（B-4） |
| DELETE | `/body/profiles/{uid}` | 删除档案（连同模型资产） |
| POST | `/body/photo-upload-token` | 获取 OSS 直传临时凭证 |
| POST | `/body/measure-jobs` | 提交建模任务 |
| GET | `/body/measure-jobs/{job_uid}` | 查询任务状态 |
| GET | `/body/guide` | 拍摄引导配置（姿势、距离、示例图，服务端可配） |

**POST `/body/measure-jobs`**

```json
{
  "profile_uid": "bp_7f3a...",          // 为空则新建档案
  "consent_id": 88213,                   // 必填，无同意直接 40301
  "height_cm": 176.0,
  "weight_kg": 68.5,
  "gender": 1,
  "photos": [
    { "view": "front", "oss_key": "raw/2026/09/11/uuid-f.jpg" },
    { "view": "side",  "oss_key": "raw/2026/09/11/uuid-s.jpg" }
  ]
}
```

响应 `202 Accepted`：

```json
{ "code": 0, "data": { "job_uid": "mj_9d21...", "estimated_seconds": 20 } }
```

**GET `/body/measure-jobs/{job_uid}`**

```json
{
  "code": 0,
  "data": {
    "status": "SUCCEEDED",
    "progress": 100,
    "profile_uid": "bp_7f3a...",
    "profile_version": 2,
    "measurements": { "chest": 96.2, "waist": 81.0, "hip": 97.5, "shoulder": 44.2, "arm_length": 60.1 },
    "confidence": { "chest": 0.92, "waist": 0.71, "hip": 0.88 },
    "low_confidence_parts": ["waist"],
    "model": { "url": "https://oss.../mesh.glb?sign=...", "expires_in": 600, "format": "glb" }
  }
}
```

> 返回 `low_confidence_parts` 并在 UI 上主动请用户复核，比假装精确更能建立信任，也能拿到宝贵的校正数据。

### 2.3 商品与尺码

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/catalog/parse` | 解析商品链接/分享口令 |
| GET | `/catalog/products/{uid}` | 商品详情与尺码表 |
| POST | `/catalog/products/{uid}/size-chart` | 用户手动提交尺码表（兜底，C-3） |
| POST | `/catalog/size-chart/ocr` | 上传尺码表截图识别 |
| GET | `/catalog/categories` | 品类列表 |

**POST `/catalog/parse`**

```json
{ "raw_input": "【淘宝】https://e.tb.cn/h.xxxx 「纯棉宽松衬衫」" }
```

```json
{
  "code": 0,
  "data": {
    "product_uid": "pd_5a1c...",
    "parse_status": "partial",
    "title": "纯棉宽松长袖衬衫",
    "category_code": "shirt",
    "elasticity": "none",
    "fit_type": "loose",
    "size_chart": {
      "measure_mode": "flat",
      "sizes": [
        { "label": "M", "values": { "chest_flat": 54, "shoulder": 45, "garment_length": 72, "sleeve_length": 58 } },
        { "label": "L", "values": { "chest_flat": 56, "shoulder": 46, "garment_length": 74, "sleeve_length": 59 } }
      ]
    },
    "missing_fields": ["waist"],
    "confidence": 0.74,
    "need_user_confirm": true
  }
}
```

### 2.4 尺码推荐与试穿

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/recommend/size` | 获取尺码推荐 |
| GET | `/recommend/records/{uid}` | 历史推荐详情（可解释性） |
| GET | `/recommend/history` | 我的查询历史 |
| POST | `/tryon/preview` | 生成试穿预览（低端机走服务端渲染） |

**POST `/recommend/size`** → 响应结构见《产品需求文档》D 节示例，此处补充完整字段：

```json
{
  "code": 0,
  "data": {
    "record_uid": "rc_3f8b...",
    "recommended_size": "L",
    "confidence": 0.86,
    "overall_risk": "medium",
    "reason_text": "整体可穿，袖长略短，介意可选 XL 但肩宽会过大。",
    "alternatives": [{ "size": "XL", "confidence": 0.41, "note": "想要宽松版型可选" }],
    "size_details": [
      {
        "size": "L",
        "fit_score": 86,
        "parts": [
          { "part": "chest", "user_cm": 96.0, "garment_cm": 108.0, "ease_cm": 12.0, "verdict": "comfortable", "tip": null },
          { "part": "sleeve_length", "user_cm": 60.0, "garment_cm": 58.5, "ease_cm": -1.5, "verdict": "short", "tip": "袖长可能偏短约1.5cm" }
        ]
      },
      { "size": "M", "fit_score": 62, "parts": [] }
    ],
    "heatmap": { "url": "https://oss.../heatmap.png?sign=...", "expires_in": 600 },
    "explain": {
      "rule_version": "ease-2026.08",
      "chart_version": 3,
      "brand_bias_applied": { "chest": -1.5 },
      "notes": "该店铺历史数据显示胸围普遍偏小 1.5cm，已修正"
    }
  }
}
```

> `explain` 字段不是给工程师看的调试信息，而是**给用户看的说服材料**。"已根据该店铺 200 条实测数据修正"这句话本身就是产品的核心竞争力。

### 2.5 反馈

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/feedback/fit` | 提交合身反馈 |
| GET | `/feedback/pending` | 待反馈的购买记录（用于推送提醒） |
| POST | `/feedback/tickets` | 提交问题工单 |

### 2.6 通用

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/common/config` | 客户端配置（开关、文案、灰度、强更） |
| GET | `/content/banners` | 首页运营位 |
| POST | `/common/events` | 埋点批量上报 |

---

## 3. 后台接口（`/admin/v1`）

### 3.1 权限模型

每个后台接口声明所需权限点，格式 `模块:动作`，例如 `catalog:review`、`rule:publish`、`body:view_masked`。网关校验 Token，服务层校验权限点，**两层都要有**。

### 3.2 主要接口

| 模块 | 方法 | 路径 | 权限点 |
| --- | --- | --- | --- |
| 登录 | POST | `/auth/login` | — |
| 商品审核 | GET | `/review/tasks` | `review:list` |
| | POST | `/review/tasks/{id}/claim` | `review:claim` |
| | POST | `/review/tasks/{id}/submit` | `review:submit` |
| 尺码表 | GET | `/catalog/products` | `catalog:list` |
| | PUT | `/catalog/size-charts/{id}` | `catalog:edit` |
| | POST | `/catalog/size-charts/import` | `catalog:import` |
| 品类模板 | GET/POST/PUT | `/config/field-templates` | `config:template` |
| 松量规则 | GET | `/config/rule-sets` | `config:rule:view` |
| | POST | `/config/rule-sets` | `config:rule:edit` |
| | POST | `/config/rule-sets/{v}/publish` | `config:rule:publish` |
| | POST | `/config/rule-sets/{v}/gray` | `config:rule:publish` |
| 用户 | GET | `/users` | `user:list` |
| | GET | `/users/{uid}/body` | `body:view_masked` ⚠️ 触发审批 + 审计 |
| SDK 管理 | GET | `/providers/stats` | `provider:view` |
| | POST | `/providers/traffic` | `provider:config` |
| 看板 | GET | `/dashboard/metrics` | `dashboard:view` |
| 工单 | GET/POST | `/tickets` | `ticket:*` |
| 审计 | GET | `/audit/logs` | `audit:view` |
| 导出 | POST | `/export/tasks` | `export:create` ⚠️ 需审批 |

### 3.3 敏感数据接口的特殊规则

`GET /users/{uid}/body` 默认返回**脱敏值**（如 `chest: "9x.x"`）。查看明文需：

1. 提交理由（工单号关联）；
2. 上级审批（或超级管理员预授权时段）；
3. 全程审计，返回结果带水印标记；
4. 明文查看结果不允许导出、不允许批量。

### 3.4 灰度发布接口语义

```json
POST /config/rule-sets/ease-2026.09/gray
{ "percent": 10, "dimension": "user_id_hash", "whitelist": ["u_123"] }
```

灰度维度必须是**稳定哈希**（同一用户始终落在同一组），否则 A/B 数据不可信。

### 3.5 异步导出

导出一律异步：`POST /export/tasks` → 返回 `task_id` → 轮询 → 生成加密压缩包 + 一次性下载链接（有效期 10 分钟，下载一次即失效），全程审计。

---

## 4. 内部 gRPC 接口

```protobuf
service MeasureService {
  rpc Measure (MeasureRequest) returns (MeasureResponse);
  rpc GetProviderHealth (Empty) returns (ProviderHealth);
}

message MeasureRequest {
  string job_uid = 1;
  Gender gender = 2;
  float height_cm = 3;
  float weight_kg = 4;
  repeated PhotoRef photos = 5;      // OSS key + view
  string provider_hint = 6;          // 空则按配置分流（J-9）
}

message MeasureResponse {
  map<string, float> measurements = 1;   // 标准字段字典，见 02 文档附录 A
  map<string, float> confidence  = 2;
  string mesh_key = 3;
  string provider_code = 4;
  int32  cost_ms = 5;
}
```

```protobuf
service OcrService  { rpc ParseSizeChart (ImageRef) returns (TableResult); }
service RenderService { rpc RenderTryOn (TryOnRequest) returns (ImageResult); }
```

> `MeasureService` 的 `measurements` 是 `map<string,float>` 而非固定字段——不同供应商能输出的部位不同，固定字段会让接入第二家供应商时被迫改 proto。

---

## 5. 契约管理与协作

1. **OpenAPI 3.1 为唯一真源**，放在 `api/openapi.yaml`，随代码走版本。
2. 客户端与后台前端的请求层代码**自动生成**，禁止手写 model，避免字段对不齐。
3. CI 中跑契约校验：接口变更若破坏兼容（删字段、改类型、改必填），流水线直接失败，必须显式升版本。
4. 提供 Mock Server，三端可在服务端未完成时并行开发——三端同期的排期下，这一条能省掉大量互相等待。
5. 变更通知走固定渠道，每次变更注明：影响端、是否兼容、生效版本、迁移期。
