# BUHUB 代码库审计报告

## 已修复（本次完成）

### 1. 无用/重复代码
- **删除 `useSecondhandWithExpired`**：未被使用，已移除
- **Mock ID 查找错误**：`mockXxx[Number(id)]` 在 ID 为字符串（如 `secondhand-1`）时返回 `undefined`，已改为 `find(i => i.id === id)`
  - secondhand.service.ts
  - errand.service.ts
  - partner.service.ts
  - rating.service.ts

### 2. 安全
- **Cron 路由**：`CRON_SECRET` 默认 `"your-secret-key"` 时未认证即可调用，已改为必须设置 `CRON_SECRET` 且 token 匹配才通过

### 3. 错误处理
- **SettingsScreen 空 catch**：通知设置更新失败时静默忽略，已改为显示 `saveFailed` 提示

---

## 待修复 / 已知问题

### 高优先级

#### 1. Ratings API 使用错误模型

**位置**：`buhub_back/app/api/ratings/**/*.ts`

**问题**：所有 ratings 路由使用 `createPartnerSchema` 和 `PartnerPost`，而非 `RatingItem` / `Rating`。Rating 类别（COURSE, TEACHER, CANTEEN, MAJOR）与 Partner 类别（TRAVEL, FOOD, COURSE, SPORTS, OTHER）不一致。

**建议**：用 rating 相关 schema 和 model 重写 ratings 路由。

#### 2. 邀请码验证为占位实现

**位置**：`buhub_back/app/api/auth/verify-invite-code/route.ts`

**问题**：当前接受任意非空字符串，无真实校验逻辑

**建议**：实现真实邀请码校验与限流

#### 3. 上传文件读取无认证

**位置**：`buhub_back/app/api/uploads/[...path]/route.ts`

**问题**：`GET /api/uploads/:path` 无需认证，任何人知道路径即可读取

**建议**：若需私密，可改为签名 URL 或增加认证；若为公开头像/图片，可保持现状并注明用途

---

### 中优先级

#### 4. useMySecondhand 逻辑错误

**位置**：`BUHUB/src/hooks/useSecondhand.ts`

**问题**：`useMySecondhand` 调用 `getList(undefined, { includeExpired: true })`，返回全部二手货，而非当前用户自己的

**建议**：后端增加 `?mine=true` 或类似参数，前端按用户过滤

#### 5. 通知设置未持久化

**位置**：`buhub_back/app/api/notifications/settings/route.ts`

**问题**：TODO 注释表明设置未写入数据库

**建议**：实现持久化存储

#### 6. 重复的 Follow API

**位置**：`buhub_back/app/api/follow/route.ts` 与 `app/api/user/[userName]/follow/route.ts`

**问题**：两套 follow 接口：`POST /api/follow`（userId）与 `POST /api/user/:userName/follow`（userName）。前端仅使用后者

**建议**：确认 `/api/follow` 用途；若无用可删除或合并

---

### 低优先级

#### 7. Mock 数据可变性

**位置**：secondhand.service.ts, errand.service.ts, partner.service.ts, forum.service.ts

**问题**：`mockXxx.unshift(newItem)` 会修改共享数据

**建议**：仅在 `USE_MOCK=true` 时使用；生产环境应关闭 mock

#### 8. userService.updateLanguage 竞态

**位置**：`BUHUB/src/screens/me/SettingsScreen.tsx:131`

**问题**：`changeLanguage` 在 `updateLanguage` 之前执行，若 API 失败，语言已切换但未持久化

**建议**：先调用 API，成功后再更新本地语言

---

## 安全建议

1. **生产环境**：确保 `USE_MOCK=false`，避免 mock token 被使用
2. **Cron**：设置 `CRON_SECRET` 并定期轮换
3. **种子数据**：`prisma/seed.ts` 中的密码仅用于开发，生产环境禁用 seed 或使用强密码

---

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| BUHUB/src/hooks/useSecondhand.ts | 移除 useSecondhandWithExpired |
| BUHUB/src/api/services/secondhand.service.ts | 修复 mock getDetail/edit |
| BUHUB/src/api/services/errand.service.ts | 修复 mock getDetail/edit |
| BUHUB/src/api/services/partner.service.ts | 修复 mock getDetail/edit |
| BUHUB/src/api/services/rating.service.ts | 修复 mock getDetail |
| BUHUB/src/screens/me/SettingsScreen.tsx | 空 catch 改为显示错误 |
| buhub_back/app/api/cron/expire/route.ts | 修复 CRON_SECRET 校验逻辑 |
