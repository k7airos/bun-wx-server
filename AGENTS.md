# AGENTS.md

本文件面向未来参与这个仓库的 AI / Agent 编码助手。目标不是追求“看起来很高级”的架构，而是让后续修改继续保持一致、克制、稳定、可维护。

## 项目定位

这是一个小型 Bun 接口服务，职责边界很明确：

1. 提供认证能力：用户名密码登录、refresh token、PAT、GitHub OAuth
2. 为客户端签发 COS 上传凭证
3. 代理微信公众号素材与草稿接口
4. 提供基础日志、审计和少量运维 CLI 能力

不要把它扩展成通用 CMS、通用后台或新的大单体，除非用户明确要求。

## 当前技术取向

- 运行时以 Bun 为核心
- 数据层使用 `bun:sqlite`
- HTTP 与第三方调用优先使用 Web 标准 `fetch`
- 参数和响应校验使用 `zod`
- 以少依赖、低样板、清晰数据流为优先目标

如果一个需求可以直接用：

- `Bun.serve`
- `bun:sqlite`
- `fetch`
- `Bun.password`
- `zod`

完成，就不要额外引入 Express、Fastify、ORM、IoC 容器或全家桶式框架。

## 不要破坏的核心语义

这个仓库不是从零自由设计，而是从 `blog.zzao.club` 的 Nuxt server 侧能力中抽出的轻量服务。改动时应尽量保留这些核心语义：

- API 前缀维持 `/api/v1/`
- Bearer token 解析方式不变
- JWT 优先、PAT 回退
- PAT scope 通过路径前缀控制访问
- refresh token 轮换
- 返回结构保持 `{ code, message, data, timestamp }`
- 微信接口维持“代理层”定位，不向里塞过重业务

如果用户没有明确要求，不要随意修改：

- token 数据结构
- 外部接口 URL
- scope 语义
- 错误码含义
- 返回字段命名

## 真实架构

### 入口层

- `src/index.ts`
  - CLI 命令入口
  - 负责 `serve` / `migrate` / `init-admin` / `backup` / `restore` / `check-config` / `cleanup-audit`

- `src/server.ts`
  - 启动 `Bun.serve`
  - 组装应用 `fetch` 处理器

### 路由层

- `src/routes/index.ts`
  - 聚合所有路由
  - 统一请求日志
  - 统一错误处理
  - 在未知 `/api/v1/*` 路径上保留 legacy auth 行为

- `src/routes/utils.ts`
  - 路由路径匹配
  - JSON / Form 读取
  - `zod` 校验
  - 角色校验、来源校验
  - 请求级 audit 封装

- `src/routes/auth.ts`
  - 登录
  - refresh
  - GitHub authorize / callback / exchange

- `src/routes/user.ts`
  - 当前用户
  - 用户总数
  - 用户详情
  - 更新用户

- `src/routes/token.ts`
  - PAT scope 列表
  - PAT 生成 / 列表 / 撤销

- `src/routes/upload.ts`
  - COS 临时凭证签发

- `src/routes/wechat.ts`
  - 微信 token
  - 永久素材上传
  - 草稿创建

- `src/routes/system.ts`
  - `/health`
  - `/ready`

新增接口时，优先在 `src/routes/*.ts` 增加路由定义，不要把业务分支重新塞回 `src/index.ts`。

### 领域模块层

当前 `src/modules/*` 是主要的业务和边界拆分位置，但不是每个目录都拥有完整对称的 `service/repository/policy/schema` 结构，要以实际代码为准，不要脑补统一抽象。

现有模块包括：

- `src/modules/auth/*`
  - 认证服务
  - PAT scope policy
  - auth schemas
  - auth context 类型

- `src/modules/oauth/*`
  - OAuth state / exchange code 持久化
  - OAuth 主流程 service
  - provider 外部响应 schema

- `src/modules/upload/*`
  - COS 凭证签发 service
  - 上传 policy
  - provider 响应 schema

- `src/modules/wechat/*`
  - 微信代理 service
  - 微信 policy
  - provider 响应 schema

- `src/modules/audit/*`
  - 审计落库
  - 审计清理

补充说明：

- `src/modules/token/` 目前只有 schema，PAT 的核心逻辑仍主要通过 `src/lib/auth.ts` 暴露
- `src/modules/user/` 目前主要承载 schema，用户读写逻辑仍主要通过 `src/lib/auth.ts` 暴露

不要为了“目录看起来整齐”强行抽一层空 service，除非用户明确要继续迁移。

### 兼容门面层

当前有一层兼容性门面保留在 `src/lib/*.ts`，用于对外暴露稳定调用入口，尤其是：

- `src/lib/auth.ts`
- `src/lib/wechat.ts`
- `src/lib/cos.ts`
- `src/lib/oauth-core.ts`
- `src/lib/github-oauth.ts`

这些文件里有一部分是 re-export / facade，一部分仍包含真实逻辑。改动时要先看清楚，不要因为文件名叫 `lib` 就误判成“全是旧代码可以删”。

### 基础设施层

- `src/config.ts`
  - 环境变量解析
  - 运行时配置校验
  - warning 输出策略

- `src/db.ts`
  - SQLite 初始化
  - migration
  - 备份与恢复

- `src/lib/response.ts`
  - 标准响应结构
  - request id header 写入

- `src/lib/logger.ts`
  - 结构化日志
  - `LOG_LEVEL` 分级过滤
  - 敏感字段脱敏

- `src/lib/validation.ts`
  - `zod` 校验封装

- `src/lib/errors.ts`
  - 统一业务异常

- `src/lib/path.ts`
  - 路径工具

- `src/lib/utils.ts`
  - 小型通用工具

## 当前配置约定

如果新增环境变量，必须同步更新：

1. `src/config.ts`
2. `.env.example`
3. `README.md`

当前已存在且需要注意的配置包括：

- `LOG_LEVEL`
- `AUDIT_RETENTION_DAYS`
- `APP_ALLOWED_SOURCES`
- `JWT_SECRET`
- `COS_*`
- `GITHUB_*`
- `OAUTH_*`

## 修改建议

### 可以主动做的改进

- 增强参数校验
- 增强 provider 响应校验
- 改进错误信息
- 增强日志与审计
- 增加小型 CLI 运维能力
- 增加单元测试和接口回归测试
- 改进 README 与运维文档

### 需要谨慎的改动

- 修改 token 结构
- 修改返回结构
- 修改 scope 语义
- 修改 OAuth 交换协议
- 修改 COS Key 生成规则
- 修改微信接口请求字段命名
- 调整鉴权优先级顺序

这些改动很可能影响客户端或已有调用方，不要擅自改变外部契约。

### 默认不建议做的事

- 引入重型框架
- 重写成微服务体系
- 抽象过度的插件系统
- 为了“规范”而大量增加样板代码
- 不带迁移策略地删除兼容门面层

## Commit 风格

- 必须使用带前缀的 Conventional Commit
- 允许的前缀：
  - `feat:`
  - `feat(scope):`
  - `fix:`
  - `fix(scope):`
  - `refactor:`
  - `perf:`
  - `docs:`
  - `test:`
  - `build:`
  - `ci:`
  - `chore:`
- 修 bug 不要再用 `chore:` 代替，应该使用 `fix:`
- 工具链、脚本、依赖、发版流程调整，优先使用 `build:` / `ci:` / `chore:`
- 当前仓库已配置 `.githooks/commit-msg` 校验；提交信息不带前缀会被拒绝

## 版本管理

- 仓库使用 `changelogen` 管理版本号与 `CHANGELOG.md`
- 已提供：
  - `bun run release:patch`
  - `bun run release:minor`
  - `bun run release:major`
- 三个命令都内置 `--push`，会执行：
  - 更新 `CHANGELOG.md`
  - 更新 `package.json` 版本号
  - 创建 release commit
  - 创建 git tag 并 push commit/tag
- 推荐流程：
  - 先将业务改动用规范 commit 提交
  - 再执行对应的 `release:*`
- 发版前保证工作区干净，并至少完成：
  - `bun test`
  - `bun src/index.ts check-config`

## 文件修改约定

### 新增路由

如果要新增接口：

1. 优先在 `src/routes/*.ts` 中增加路由定义
2. 把具体逻辑下沉到已有模块，或在 `src/modules/*` 新增最小必要代码
3. 用 `zod` 补齐请求 schema
4. 有稳定返回结构时补响应 schema
5. 需要审计的操作显式记录 audit
6. 不要绕过 `json()` 响应封装手写一套新返回格式

### 新增数据表或迁移

如果确实需要新增表：

1. 在 `src/db.ts` 中补 migration
2. 字段命名保持清晰直接
3. 优先 TEXT / INTEGER，不要过度设计
4. 只在明确有查询需求时加索引

### 认证相关改动

如果修改认证逻辑，至少确认：

1. JWT 仍优先于 PAT
2. PAT scope 仍只放行允许路径
3. refresh token 仍然轮换
4. 现有错误码语义没有被破坏

### 日志与审计相关改动

如果修改日志 / 审计：

1. 不要记录明文密码、token、authorization、secret
2. 确保 request id 仍能贯通响应与日志
3. 对需要追踪的敏感操作保留 audit 记录

## 当前可用命令

源码运行：

```bash
bun src/index.ts serve
```

开发模式：

```bash
bun --watch src/index.ts serve
```

迁移：

```bash
bun src/index.ts migrate
```

初始化管理员：

```bash
bun src/index.ts init-admin --username admin --password 'secret' --nickname 管理员
```

备份与恢复：

```bash
bun src/index.ts backup
bun src/index.ts restore --input .backup/app.sqlite
```

配置检查：

```bash
bun src/index.ts check-config
```

审计清理：

```bash
bun src/index.ts cleanup-audit --days 90
```

测试：

```bash
bun test
```

lint：

```bash
bunx eslint .
```

聚合检查：

```bash
bun run check
```

## 验证要求

完成代码修改后，至少做以下验证中的一部分，并在回复里明确写出你实际做了哪些：

1. `bun test`
2. `bun src/index.ts check-config`
3. 认证相关改动时，验证登录、refresh、PAT scope
4. OAuth 相关改动时，验证 authorize -> callback -> exchange 主流程
5. 微信 / COS 改动时，验证本地参数校验和 provider 响应校验
6. 日志 / 审计改动时，验证脱敏与落库逻辑

如果外部网络、真实凭证或第三方服务不可用，要明确说明“已做本地 smoke test，但未做真实接口联调”。

## 返回给用户时应说明的重点

如果你作为 Agent 完成了改动，优先说明：

1. 改了什么
2. 为什么这样改
3. 做了哪些验证
4. 哪些部分还没法在本地完全验证

不要把回复写成流水账式 changelog，也不要只给一句“已完成”。

## 最后原则

这个仓库最重要的不是“架构漂亮”，而是：

- 认证清楚
- 接口稳定
- 文档明确
- 日志可观测
- 审计可追踪
- 能快速支撑微信发布链路

后续所有改动，都应围绕这 6 点展开。
