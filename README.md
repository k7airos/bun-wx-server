# blog-wx-bun-service

一个基于 Bun 与 `bun:sqlite` 的轻量 API 服务，聚焦微信发布链路的 3 个核心能力：

1. 用户鉴权：JWT access token、refresh token、PAT(scope)
2. COS 上传凭证：签发临时 STS，让客户端直传 COS
3. 微信公众号代理：获取 token、上传永久素材、创建草稿

这个仓库现在同时支持三种交付方式：

- 源码运行：适合自己改代码
- Bun 单文件二进制：适合自托管分发
- Docker / Compose：适合作为附加部署选项

## 这次补齐了什么

- 显式初始化管理员，移除“首个注册自动 superAdmin”
- SQLite 迁移机制：`schema_migrations`
- 备份 / 恢复命令
- 生产配置强校验
- Bun 单文件构建脚本
- Dockerfile / Compose
- Bun test + GitHub Actions CI

## 运行要求

- Bun 1.x
- Linux / macOS 均可
- 如果用 Docker，则只作为可选交付方式，不是唯一方案

## 环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

关键变量：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 服务端口 | `3001` |
| `DATABASE_PATH` | SQLite 文件路径 | `.data/app.sqlite` |
| `JWT_SECRET` | JWT 签名密钥 | 无安全默认值，生产必须显式配置 |
| `JWT_EXPIRES_IN_SECONDS` | access token 过期秒数 | `900` |
| `REFRESH_TOKEN_EXPIRES_IN_SECONDS` | refresh token 过期秒数 | `604800` |
| `APP_ALLOWED_SOURCES` | 允许的 `X-App-Source` 列表 | `zotepad,zotepad-desktop` |
| `COS_SECRET_ID` | 腾讯云 COS SecretId | 无 |
| `COS_SECRET_KEY` | 腾讯云 COS SecretKey | 无 |
| `COS_BUCKET` | COS Bucket 名称 | 无 |
| `COS_REGION` | COS 地域 | `ap-guangzhou` |
| `COS_STS_DURATION_SECONDS` | STS 临时凭证有效期 | `1800` |
| `WX_REQUEST_TIMEOUT_MS` | 微信接口超时毫秒数 | `30000` |
| `NODE_ENV` | 运行环境 | `production` |

说明：

- `NODE_ENV=production` 且未设置 `JWT_SECRET` 时，服务会拒绝启动
- 本地开发若不设置 `JWT_SECRET`，会退回到仅限开发的默认密钥，并打印 warning

## CLI 命令

统一入口：

```bash
bun src/index.ts --help
```

常用命令：

```bash
bun run migrate
bun run init-admin --username admin --password 'change-me-now'
bun run start
```

完整命令：

```bash
bun src/index.ts serve
bun src/index.ts migrate
bun src/index.ts init-admin --username admin --password 'secret' --nickname 管理员
bun src/index.ts backup --output .backup/app.sqlite
bun src/index.ts restore --input .backup/app.sqlite
bun src/index.ts check-config
```

## 推荐的 self-host 初始化流程

### 1. 准备环境变量

```bash
cp .env.example .env
```

至少改掉：

- `JWT_SECRET`
- `DATABASE_PATH`
- 如需微信 / COS 功能，再补 `COS_*`

### 2. 初始化数据库

```bash
bun run migrate
```

### 3. 创建首个管理员

```bash
bun run init-admin --username admin --password 'change-me-now'
```

说明：

- 只能在数据库没有任何用户时执行一次
- 不再支持“首个登录自动成为管理员”
- 如果已经存在用户，会拒绝重复执行

### 4. 启动服务

```bash
bun run start
```

健康检查：

- `GET /health`
- `GET /ready`

## Bun 单文件分发

这是首选分发方式之一，适合没有 Docker Hub 访问条件的用户。

在目标机器本地编译：

```bash
bun run build:binary
```

产物：

```txt
dist/blog-wx-bun-service
```

运行方式：

```bash
./dist/blog-wx-bun-service migrate
./dist/blog-wx-bun-service init-admin --username admin --password 'change-me-now'
./dist/blog-wx-bun-service serve
```

如果要做 systemd，自行把上面的单文件二进制挂成服务即可。

## Docker 部署

Docker 只是附加支持项，不是唯一交付方式。

```bash
docker compose up --build -d
```

然后执行一次初始化：

```bash
docker compose run --rm app migrate
docker compose run --rm app init-admin --username admin --password 'change-me-now'
```

说明：

- Compose 默认把数据库挂到 `/data/app.sqlite`
- `compose.yaml` 会从本地 `Dockerfile` 构建，不依赖预制镜像仓库

## 数据库升级与迁移

项目现在使用版本化迁移表：

- `schema_migrations`

执行升级：

```bash
bun run migrate
```

原则：

- 新版本上线前先跑迁移
- 迁移保持幂等
- 不再依赖隐式 `CREATE TABLE IF NOT EXISTS` 作为升级方案

## 备份与恢复

备份：

```bash
bun run backup --output .backup/app-$(date +%F).sqlite
```

恢复：

```bash
bun run restore --input .backup/app-2026-03-14.sqlite
```

建议：

- 先停服务，再做恢复
- 生产环境至少保留一份异机备份
- 升级前先执行一次备份

## API 一览

### 健康检查

- `GET /health`
- `GET /ready`

### 用户与鉴权

- `POST /api/v1/user/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/user/me`
- `GET /api/v1/token/scopes`
- `POST /api/v1/token/generate`

### COS

- `POST /api/v1/upload/cos`

### 微信

- `POST /api/v1/wx/cgi-bin/token`
- `POST /api/v1/wx/cgi-bin/material/add_material`
- `POST /api/v1/wx/cgi-bin/draft/add`

## 行为变化

如果你是从旧版本迁移过来，最重要的变化只有两个：

1. 不再支持“用户不存在时自动注册并首个用户升管理员”
2. 生产环境必须显式配置 `JWT_SECRET`

## 验证

本仓库内置：

```bash
bun run check
```

包含：

- `bun test`
- `bun src/index.ts --help`
- `bun src/index.ts check-config`
