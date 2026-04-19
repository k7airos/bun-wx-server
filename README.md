# blog-wx-bun-service

一个基于 Bun 与 `bun:sqlite` 的轻量 API 服务，聚焦“认证 + 上传 + 微信发布链路”这 3 个核心能力：

1. 用户鉴权：JWT access token、refresh token、PAT(scope)
2. COS 上传凭证：签发临时 STS，让客户端直传 COS
3. 微信公众号代理：获取 token、上传永久素材、创建草稿

这个仓库现在同时支持三种交付方式：

- 源码运行：适合自己改代码
- Bun 单文件二进制：适合自托管分发
- Docker / Compose：适合作为附加部署选项

运行时约定：

- 这个项目按 Bun 运行时组织
- 服务代码默认使用 Bun 自身能力与 Web 标准 API
- 不以 Node.js 兼容为目标，不额外维护 `node:` 标准库导入方案

## 当前支持的功能

这个服务当前已经可以独立承接一套小型博客后台所需的“最小动态能力”：

1. 用户认证
   - 用户名密码登录
   - GitHub OAuth 第三方登录
   - JWT access token
   - refresh token 轮换
   - Bearer token 鉴权

2. PAT
   - PAT scope 定义与鉴权
   - 查询 scope 列表
   - 生成 PAT
   - 列出当前用户 PAT
   - 撤销当前用户 PAT

3. 用户接口
   - 获取当前登录用户
   - 查询用户总数
   - 按 id 获取用户详情
   - 管理员更新指定用户资料

4. COS 上传签名
   - 仅 `superAdmin` 可签发 COS 临时凭证
   - 约束图片后缀、大小与 content-type

5. 微信发布链路
   - 获取公众号 access token
   - 上传永久素材
   - 创建草稿
   - 校验 `X-App-Source`

6. 运行与维护
   - SQLite 迁移
   - 首个管理员初始化
   - 数据库备份与恢复
   - Bun test

## 与 Nuxt 项目的对齐目标

这个服务的目标不是自由设计一套新协议，而是尽量对齐 `blog.zzao.club` 里 Nuxt server 的保留接口，让前端在多数情况下只需要切换 `baseURL` 就能联调。

当前已经尽量保持一致的内容包括：

- API 前缀：`/api/v1/`
- 标准返回结构：`{ code, message, data, timestamp }`
- Bearer token 解析方式
- JWT 优先、PAT 回退的鉴权逻辑
- PAT scope 控制路径访问
- 微信接口 URL 与主要参数命名
- GitHub OAuth 走标准授权跳转 + callback + exchange code 流程

第三方登录的内部实现采用了“通用 OAuth 主流程 + provider 适配器”结构：

- `src/lib/oauth-core.ts`
  - 负责 state、callback 主流程、exchange code、本地用户绑定
- `src/lib/oauth-providers/github.ts`
  - 负责 GitHub 的授权地址、换 token、拉用户信息

目前只启用了 GitHub provider，但这个结构已经为后续扩展 Google、Gitee 等 provider 预留好了位置。

## 当前不支持的功能

下面这些能力目前还没有在这个服务里实现：

- 其他第三方 OAuth 登录
- 评论、Todo、Explain、FSF 等业务接口
- 更复杂的多 provider 账号管理后台

当前已经支持的登录方式是：

- 本地用户名密码登录
- GitHub OAuth 登录

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
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | 无 |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | 无 |
| `GITHUB_CALLBACK_URL` | GitHub OAuth 回调地址 | 无 |
| `OAUTH_FRONTEND_CALLBACK_URL` | 前端接收 exchange code 的回调地址 | 无 |
| `OAUTH_STATE_EXPIRES_IN_SECONDS` | OAuth state 有效期秒数 | `600` |
| `OAUTH_EXCHANGE_CODE_EXPIRES_IN_SECONDS` | OAuth exchange code 有效期秒数 | `60` |
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
- 如需 GitHub 登录，再补 `GITHUB_*` 与 `OAUTH_FRONTEND_CALLBACK_URL`

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

## 发版与部署

纯发版：

```bash
bun run release:patch
bun run release:minor
bun run release:major
```

发版后顺带部署正式环境：

```bash
cp .deploy.prod.env.example .deploy.prod.env
bun run release:patch:prod
```

说明：

- `release:*` 只负责更新版本、生成 changelog、创建 tag 并 push
- `release:*:prod` 会在此基础上继续执行 `scripts/deploy-prod.sh`
- `deploy:prod` 会把当前本地源码打包上传到服务器，再执行 `bun install`、迁移、PM2 重启与 `/ready` 健康检查
- 正式部署参数统一从 `.deploy.prod.env` 读取，避免把服务器目录、端口、PM2 名称写死在 `package.json`

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
- `GET /api/v1/auth/github`
- `GET /api/v1/auth/github/callback`
- `POST /api/v1/auth/exchange`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/user/me`
- `GET /api/v1/user/count`
- `POST /api/v1/user/detail`
- `PUT /api/v1/user/:id`
- `GET /api/v1/token/scopes`
- `POST /api/v1/token/generate`
- `GET /api/v1/token/list`
- `DELETE /api/v1/token/:id`

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
3. GitHub 登录现在走标准 OAuth 授权跳转与 callback/exchange 流程，不再参考旧 Nuxt 实现

## 验证

本仓库内置：

```bash
bun run check
```

包含：

- `bun test`
- `bun src/index.ts --help`
- `bun src/index.ts check-config`
