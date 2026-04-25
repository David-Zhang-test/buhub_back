# BUHUB Backend 系统总览文档

## 1. 系统定位

`buhub_back` 是基于 Next.js App Router 的后端服务，核心职责包括：

- 用户认证与账号体系
- 论坛发布与互动体系
- 消息通知、评分、课表、上传、翻译等业务模块
- Redis 缓存与实时能力（含 WebSocket 事件推送）

---

## 2. 代码分层关系（app vs src）

- `app/`：路由入口层（HTTP API + 页面入口）
  - 典型路径：`app/api/**/route.ts`
- `src/`：业务实现层（服务、库、schema、基础设施）
  - `src/services/*`：核心业务流程编排
  - `src/lib/*`：复用能力（鉴权、缓存、存储、安全等）
  - `src/schemas/*`：请求参数校验（Zod）

建议原则：**路由层尽量薄，业务逻辑下沉到 `src/services` / `src/lib`。**

---

## 3. 用户系统（User System）

### 3.1 职责范围

- 登录注册、验证码、密码找回与重置
- 会话管理（JWT + Redis Session 双校验）
- 用户资料与邮箱管理
- 关注/拉黑关系
- 邀请码与用户数据导出

### 3.2 主要入口

- `app/api/auth/*`
- `app/api/user/*`
- `app/api/follow/*`
- `app/api/users/*`（如 block / blocked）

### 3.3 核心实现

- `src/services/auth.service.ts`
- `src/services/user.service.ts`
- `src/lib/auth.ts`
- `src/lib/user-emails.ts`
- `src/lib/rate-limit.ts`

### 3.4 核心数据模型（Prisma）

- `User`
- `UserEmail`
- `VerificationToken`
- `Follow`
- `Block`
- `InviteCode`

---

## 4. 论坛系统（Forum System）

### 4.1 职责范围

- 帖子发布、编辑、删除（软删除）
- 评论、点赞、收藏、投票、转发
- 匿名身份展示
- 标签圈子与圈子关注
- 搜索与内容发现

### 4.2 主要入口

- `app/api/forum/posts/*`
- `app/api/forum/circles/*`
- `app/api/forum/search`
- 关联互动路由：`/api/comments/*`、`/api/reports/*`

### 4.3 核心实现

- `app/api/forum/posts/route.ts`
- `app/api/forum/posts/[id]/route.ts`
- `src/lib/anonymous.ts`
- `src/lib/content-moderation.ts`
- `src/lib/function-ref.ts`
- `src/services/new-post-push.service.ts`

### 4.4 核心数据模型（Prisma）

- `Post`
- `Comment`
- `Like`
- `Bookmark` / `CommentBookmark`
- `Tag`
- `PollOption` / `Vote`
- `Report`

---

## 5. 其他核心业务模块

## 5.1 即时消息（Messages）

- 路由：`app/api/messages/*`
- 能力：会话、聊天、已读、输入中、搜索、在线心跳
- 相关模型：`DirectMessage`、`DirectConversation`
- 相关服务：`src/services/message.service.ts`

## 5.2 通知（Notifications）

- 路由：`app/api/notifications/*`
- 能力：互动通知、未读统计、已读管理、推送注册、通知偏好
- 相关服务：`src/services/expo-push.service.ts`、`src/services/task-push.service.ts`

## 5.3 评分系统（Ratings）

- 路由：`app/api/ratings/*`
- 能力：评分项、维度、标签、评论、用户评分
- 相关模型：`RatingItem`、`ScoreDimension`、`Rating`

## 5.4 课表系统（Schedule）

- 路由：`app/api/schedule/*`、`app/api/schedule/parse`
- 能力：课表课程管理、图片课表解析（OCR + CV）
- 相关实现：`src/lib/schedule/*`、`scripts/detect-blocks.py`

## 5.5 上传与存储（Upload/Storage）

- 路由：`app/api/upload/*`、`app/api/uploads/*`
- 能力：图片/头像上传、预签名 URL、文件访问代理
- 相关实现：`src/lib/storage.ts`、`src/lib/s3.ts`、`src/lib/upload-refs.ts`

## 5.6 翻译系统（Translations）

- 路由：`app/api/translations/*`
- 能力：翻译批处理、按实体解析/缓存
- 相关服务：`src/services/translation.service.ts`

## 5.7 交易与任务场景

- `partner`（组队）
- `errands`（跑腿）
- `secondhand`（二手）
- 对应路由：`app/api/partner/*`、`app/api/errands/*`、`app/api/secondhand/*`

## 5.8 反馈与储物柜流程

- 反馈：`app/api/feedback/*`
- 储物柜：`app/api/locker-requests/*`、`app/api/locker-broadcast/*`

---

## 6. 运行与基础设施

- 数据库：PostgreSQL（Prisma）
- 缓存与会话：Redis
- 运行时：Node.js + Next.js（自定义 `server.js`）
- 部署：Docker + docker-compose（外部数据库模式）
- 构建：`next build` + Prisma generate

---

## 7. 缓存与实时能力（摘要）

- 会话：`session:{jti}`
- 用户屏蔽列表：`user:{id}:blocked`
- 圈子缓存：`forum:circles`
- 消息事件：Redis pub/sub + WebSocket 推送

---

## 8. 测试与质量现状

- 使用 `vitest`（`vitest.config.ts` 已存在）
- 当前测试主要分布于：
  - `src/lib/schedule/__tests__/*`
  - `src/lib/feedback/__tests__/*`
  - `src/schemas/__tests__/*`
- 建议补充 `package.json` 的 `test` 脚本并纳入部署前校验

---

## 9. 文档维护建议

- 本文档作为总览（模块地图）
- 细节文档继续拆分维护：
  - `docs/user-system.md`
  - `docs/forum-system.md`
- 当新增模块时，先更新本总览的“模块清单 + 路由入口”

