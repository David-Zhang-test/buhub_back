# 用户系统技术文档

## 1. 范围与定位

用户系统负责账号注册登录、会话管理、资料管理、邮箱绑定与验证、关注/拉黑关系、邀请码及用户导出等能力。

当前系统实现基于 Next.js App Router API 路由（`app/api/auth/*`、`app/api/user/*`）+ Prisma + Redis。

## 2. 技术栈与目录

- 路由入口：`app/api/auth/*`、`app/api/user/*`
- 核心服务：`src/services/auth.service.ts`、`src/services/user.service.ts`
- 数据访问：`src/lib/db.ts`（Prisma）、`src/lib/redis.ts`
- 鉴权与会话：`src/lib/auth.ts`、`src/services/auth.service.ts`
- 输入校验：`src/schemas/auth.schema.ts`、`src/schemas/user.schema.ts`
- 辅助能力：`src/lib/user-emails.ts`、`src/lib/rate-limit.ts`、`src/lib/errors.ts`

## 3. 核心数据模型（Prisma）

用户系统核心模型定义于 `prisma/schema.prisma`：

- `User`：账号主体（profile、role、isActive/isBanned、语言、条款同意、lastLoginAt）
- `UserEmail`：用户邮箱集合（支持多个邮箱、登录可用性、验证时间）
- `VerificationToken`：验证码/重置码（email verification、password reset）
- `Follow`：关注关系（`followerId` / `followingId`，唯一约束）
- `Block`：拉黑关系（`blockerId` / `blockedId`，唯一约束）
- `InviteCode`：邀请码（拥有者、使用者、使用时间）

## 4. API 分组（高层）

### 4.1 认证与注册 (`/api/auth/*`)

- 登录与会话：`login`、`logout`、`me`、`verify-token`
- 邮箱验证码流：`send-code`、`verify`
- 完整注册流：`complete-registration`、`profile-setup`、`set-password`
- 密码管理：`forgot-password`、`reset-password`、`password`
- 账号能力：`account`
- 邀请码校验：`verify-invite-code`
- HKBU 邮箱绑定：`bind-hkbu/send-code`、`bind-hkbu/verify`

### 4.2 用户域能力 (`/api/user/*`)

- 个人资料：`profile`、`profile/content`
- 资料关系：`profile/following`、`profile/followers`
- 用户主页：`[userName]`、`[userName]/posts`
- 社交操作：`[userName]/follow`、`[userName]/block`
- 邮箱管理：`emails/[emailId]`
- 邀请码：`invite-codes`
- 数据导出：`export`、`export/[jobId]`、`export/download`

## 5. 关键流程

## 5.1 登录流程（密码登录）

1. 路由 `POST /api/auth/login` 校验输入并限流。
2. 通过 `user-emails` 解析登录身份与主用户。
3. `bcrypt` 校验密码，校验用户状态（active / banned）。
4. `authService.createSession()`：
   - 生成 `jti`
   - Redis 写入 `session:{jti}`（TTL 7 天）
   - 签发 JWT（含 `userId`、`jti`、`role`）
5. 返回 token + 用户信息。

## 5.2 会话验证流程

`authService.verifySession()` 同时校验：

- JWT 签名/过期（`JWT_SECRET`）
- Redis 会话存在性（`session:{jti}`）
- 用户状态有效（未停用、未封禁）

这是“JWT + Redis”双重校验，支持服务端会话失效（例如注销全部设备）。

## 5.3 邮箱验证码登录/注册分流

`POST /api/auth/verify` 验证 Redis 中验证码后：

- 若用户已存在：直接创建 session，返回 token
- 若用户不存在：生成短期 registration token，进入补全注册流程

## 6. 安全与风控

- 登录、验证码等接口有速率限制（`rate-limit`）
- 账号状态校验：`isActive`、`isBanned`
- 密钥安全：生产环境强制要求强 JWT 密钥
- 邮箱验证与多邮箱能力：通过 `UserEmail` 实体管理，而不是单字段
- 错误输出统一通过 `handleError` 与标准错误码

## 7. 缓存策略（用户系统相关）

- Session：`session:{jti}`（Redis，30 天 TTL）
- 屏蔽关系缓存：`user:{id}:blocked`（用于内容过滤）
- 验证码与验证失败计数：`email_verify:*`、`rl:verify:*`


