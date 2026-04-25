# 论坛系统技术文档

## 1. 范围与定位

论坛系统负责帖子发布与浏览、评论互动、点赞收藏、投票、圈子（标签）聚合、搜索、转发与匿名展示能力。

实现基于 Next.js API 路由（`app/api/forum/*` 及相关 comment/like/bookmark 路由）+ Prisma + Redis。

## 2. 技术栈与目录

- 路由入口：`app/api/forum/*`
- 关键实现文件：
  - `app/api/forum/posts/route.ts`
  - `app/api/forum/posts/[id]/route.ts`
  - `app/api/forum/search/route.ts`
  - `app/api/forum/circles/route.ts`
- 依赖库：
  - 鉴权：`src/lib/auth.ts`
  - 内容处理：`src/lib/content-moderation.ts`、`src/lib/language.ts`
  - 匿名机制：`src/lib/anonymous.ts`
  - 功能引用：`src/lib/function-ref.ts`
  - 缓存：`src/lib/redis.ts`
  - 通知：`src/services/new-post-push.service.ts`

## 3. 核心数据模型（Prisma）

论坛核心模型定义于 `prisma/schema.prisma`：

- `Post`：帖子主体（文本、图片、标签、匿名字段、统计字段、分类字段）
- `Comment`：评论（支持父子回复、匿名评论）
- `Like`：点赞（可关联帖子或评论）
- `Bookmark` / `CommentBookmark`：收藏
- `Tag`：圈子标签（`usageCount`）
- `PollOption` / `Vote`：投票选项与用户投票记录
- `Report`：举报快照与处理状态

## 4. API 分组（高层）

### 4.1 帖子

- `GET /api/forum/posts`：分页列表（支持排序、分类、登录态增强）
- `POST /api/forum/posts`：创建帖子（含匿名、投票、分类扩展字段）
- `GET /api/forum/posts/[id]`：详情
- `PUT /api/forum/posts/[id]`：编辑（作者或管理员）
- `DELETE /api/forum/posts/[id]`：软删除

### 4.2 互动能力

- 点赞：`/api/forum/posts/[id]/like`
- 收藏：`/api/forum/posts/[id]/bookmark`
- 评论：`/api/forum/posts/[id]/comments`
- 投票：`/api/forum/posts/[id]/vote`
- 转发：`/api/forum/posts/[id]/repost`

### 4.3 发现与圈子

- 搜索：`/api/forum/search`
- 圈子列表：`/api/forum/circles`
- 圈子内容：`/api/forum/circles/[tag]`
- 关注圈子：`/api/forum/circles/[tag]/follow`

## 5. 关键业务逻辑

## 5.1 列表查询与个性化

`GET /api/forum/posts` 具备以下行为：

- IP 限流（防刷）
- 可选登录态：已登录则过滤 block 关系用户内容
- 返回用户态字段：`liked`、`bookmarked`、`myVote`
- 支持 `sortBy`（recent/popular）、分页、分类筛选
- 解析 `functionRef` 并附带预览内容

## 5.2 发帖流程

`POST /api/forum/posts` 核心步骤：

1. 鉴权并校验邮箱域（HKBU 约束）
2. 用户维度限流（发帖频控）
3. Zod 校验请求体（含 poll 规则）
4. 文本清洗（DOMPurify）
5. 内容审核（moderation）
6. 匿名身份生成（可重复推导、可本地化）
7. 创建帖子与关联实体（投票选项、标签计数）
8. 异步触发新帖推送

## 5.3 匿名机制

- 数据层保存 `anonymousName` / `anonymousAvatar`
- 返回层通过 `resolveAnonymousIdentity` 统一解析
- 匿名时不回传真实作者性别/年级/专业等识别信息

## 5.4 删除与一致性

- 帖子删除使用软删除（`isDeleted=true`）
- 同事务内将关联评论标记删除，保证列表一致性

## 6. 缓存与性能

- 圈子缓存：`forum:circles`（1 小时）
- 圈子关注关系：
  - `forum:circle:followers:{tag}`
  - `forum:user:circles:{userId}`
- 帖子浏览计数：`post:views:{id}`（Redis 累加）
- Block 关系缓存：`user:{id}:blocked`（减少重复查询）

## 7. 安全与治理

- 统一鉴权与错误处理
- 速率限制（按 IP / 用户维度）
- 内容审核（文本过滤）
- 举报模型保留快照（`Report.snapshot`）便于审计
- 角色权限控制（作者/管理员/版主可编辑或删除）

## 8. 与用户系统的耦合点

- 用户身份：论坛所有写操作依赖用户会话
- 社交关系：Follow/Block 直接影响可见内容和推荐
- 通知体系：新帖和互动事件可通过 push 服务触发

## 9. 后续优化建议

- 拆分 `posts` 路由中的聚合逻辑到 service 层（当前单文件较重）
- 将圈子关注与标签统计策略统一为事件驱动更新
- 增加 forum API 合约测试与高并发场景压测基线
- 对搜索引入专门索引策略（当前是 DB contains + tag hasSome）

