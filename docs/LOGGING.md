# BUHUB 后端日志系统

## 概述

- **库**: Winston + winston-daily-rotate-file
- **级别**: `error` > `warn` > `info` > `debug`
- **输出**:
  - **控制台**: 始终输出（Docker 用 `docker compose logs app` 采集）
  - **文件**: 设置 `LOG_DIR` 后，按日轮转写入目录

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `LOG_LEVEL` | 最低级别，低于此级别不输出 | 生产 `info`，开发 `debug` |
| `LOG_DIR` | 日志目录；设后写入 `app-YYYY-MM-DD.log`，error 单独 `error-YYYY-MM-DD.log` | 空（不写文件） |

## 生产 Docker 落盘

`docker-compose.prod.yml` 已配置：

- 挂载卷 `log_data` 到容器内 `/app/logs`
- 环境变量 `LOG_DIR=/app/logs`、`LOG_LEVEL=info`（可用 `.env` 覆盖）

日志会持久化在 Docker 卷中，重启容器不丢。查看卷位置：

```bash
docker volume inspect buhub_back_log_data
```

如需在宿主机直接看文件，可改为绑定目录，例如：

```yaml
volumes:
  - ./logs:/app/logs
```

## 格式

- **生产 (NODE_ENV=production)**: 单行 JSON，便于 ELK/云日志/脚本解析
  ```json
  {"level":"info","message":"request","module":"http","method":"GET","path":"/api/forum/posts","status":200,"ms":45,"service":"buhub-back","timestamp":"2026-03-15T12:00:00.000Z"}
  ```
- **开发**: 可读的带颜色单行，含 `[module]`、`message`、`meta`

## 在代码中使用

```ts
import { child } from "@/src/lib/logger";

const log = child("auth/login");
log.error("login failed", { userId, reason: "banned" });
log.warn("rate limited", { ip });
log.info("attempt", { hint: "***om" });
log.debug("cache hit", { key });
```

`server.js`（CommonJS）:

```js
const { child } = require("./src/lib/logger");
const log = child("http");
log.info("request", { method, path, status, ms });
```

## 已接入的模块

- **http** (server.js): 每次请求 method/path/status/ms
- **auth/login**: 登录尝试、401/403/429、成功
- **middleware**: CORS 拒绝
- **api** (errors.ts): 4xx 与 5xx 统一处理时的 warn/error

## 文件轮转规则（LOG_DIR 启用时）

- `app-YYYY-MM-DD.log`: 所有级别，单文件最大 50m，保留 14 天
- `error-YYYY-MM-DD.log`: 仅 error，单文件最大 50m，保留 30 天

## 可选：关闭文件日志

生产若只依赖 Docker 日志、不落盘，在环境里不设 `LOG_DIR` 或设为空即可。
