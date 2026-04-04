# 故障排查：论坛加载不出且后端无报错

## 现象

- 前端：论坛内容完全加载不出来（或显示网络错误）
- 后端：没有任何报错（`docker compose logs app` 里看不到 error）

## 根因分析

后端“没有报错”不等于请求正常，只说明 **没有执行到 `console.error`**。下面几种情况都会导致“无报错”：

### 1. 请求根本没到 Node 进程（最常见）

- **表现**：日志里连一条 `[http] GET /api/forum/posts ...` 都没有。
- **可能原因**：
  - 前端打出来的包用的 API 地址不对（没配 `EXPO_PUBLIC_API_URL` 或 EAS 构建时 env 不对），请求发到了别的域名或旧环境。
  - 前面有 Nginx/负载均衡：把 `/api` 转到了别的服务、或直接 502/404，请求没进当前这个 app 容器。
  - 用户网络/DNS 问题，请求没到你这台服务器。

**排查**：在服务器上 `docker compose -f docker-compose.prod.yml logs -f app`，让用户再打开论坛一次。若仍然没有任何 `[http] GET /api/forum/posts`，就是请求没到达本容器，要查前端配置和 Nginx/代理。

### 2. 被 CORS 拦截（403，之前不打印）

- **表现**：若已部署带 `[http]` 请求日志的版本，会看到 `GET /api/forum/posts 403`；同时可能出现 `[middleware] CORS denied`。
- **原因**：React Native / 部分环境会发 `Origin: "null"`，之前未放行，middleware 直接 403。403 走的是正常 JSON 响应，不会触发 `console.error`，所以“后端无报错”。
- **已做修改**：middleware 里对 `Origin === "null"` 放行，并对 CORS 拒绝打 `console.warn`，便于确认是否曾因 CORS 被拦。

### 3. 401/403 由业务逻辑返回，之前不打印

- **表现**：日志里能看到 `[http] GET /api/xxx 401` 或 `403`，但没有任何 error 堆栈。
- **原因**：401/403 是通过 `handleError(AppError)` 返回的，之前没有对这类状态码打日志。
- **已做修改**：在 `handleError` 里对 4xx 打 `console.warn("[api]", statusCode, code, message)`，便于确认是认证/权限问题。

### 4. 论坛 GET 本身不会因 token 失败而返回 401

- `/api/forum/posts` 的 GET 里：`getCurrentUser` 失败会被 catch，只把 `currentUserId` 置空，**照样返回 200 和帖子列表**（只是没有当前用户的点赞/收藏状态）。所以“token 过期导致论坛 401”不会发生在这条接口上；若论坛加载不出，更可能是上面 1 或 2。

## 建议排查顺序

1. **确认请求是否到达当前 app 容器**  
   看日志里是否有 `[http] GET /api/forum/posts ...`。没有 → 查前端 API 地址、Nginx/代理、网络。

2. **若有请求但状态码是 403**  
   看是否有 `[middleware] CORS denied`。有 → 已通过放行 `Origin: "null"` 和打 log 修复/可观测；部署后若仍 403，再查 `CORS_ALLOWED_ORIGINS` / `NEXT_PUBLIC_APP_URL`。

3. **若有请求且 401/403**  
   看是否有 `[api] 401 ...` / `[api] 403 ...`。有 → 说明是业务认证/权限问题，不是“完全无报错”，可按 code 继续查。

4. **若有请求且 200**  
   说明后端正常返回，问题在前端解析或展示（例如数据结构与预期不符、前端报错被吞掉）。
