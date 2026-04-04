# BUHUB 后端部署指南

## 服务器信息

- **域名**: www.uhub.help
- **IP**: 47.236.224.177
- **API**: https://www.uhub.help/api
- **管理后台**: https://www.uhub.help/admin
- **用户**: ubuntu
- **SSH**: `ssh ubuntu@47.236.224.177`

## 部署流程（本地构建 + 推送）

镜像在**本地**构建，推送到镜像仓库，服务器只拉取并运行，避免服务器资源不足。

### 1. 本地准备

**安装 Docker**，并登录镜像仓库：

```bash
# 方式 A: GitHub Container Registry (ghcr.io)
# 1. 创建 GitHub PAT: Settings → Developer settings → Personal access tokens → 勾选 write:packages, read:packages
# 2. docker login ghcr.io -u David-Zhang-test -p YOUR_GITHUB_PAT
# 3. 首次推送后，到 GitHub Packages 页面将 buhub-back 设为 Public（否则服务器拉取需登录）

# 方式 B: Docker Hub
docker login
# 然后设置: export REGISTRY=dockerhub DOCKERHUB_USER=你的用户名
```

### 2. 服务器准备

```bash
# 安装 Docker
sudo apt update && sudo apt install -y docker.io docker-compose
sudo usermod -aG docker ubuntu
# 重新登录后生效

# 若用 ghcr.io 私有镜像，需在服务器登录: docker login ghcr.io
```

### 3. 部署

在项目根目录执行：

```bash
./deploy-backend.sh
```

流程：本地构建 → 推送到镜像仓库 → SSH 到服务器拉取 → 启动容器。

### 4. 服务器 .env

首次部署后，SSH 到服务器编辑：

```bash
ssh ubuntu@47.236.224.177
cd /home/ubuntu/buhub_back
nano .env
```

设置 `JWT_SECRET`（至少 32 位随机字符串）、`NEXT_PUBLIC_APP_URL`（如 `https://www.uhub.help`，用于邮件链接和上传 URL）

### 5. 邮件服务（验证码、密码重置）

生产环境需配置真实邮件服务，否则验证码不会发送。

**Resend（HTTP API，非 SMTP）**

1. 注册 https://resend.com
2. 添加并验证发信域名
3. 创建 API Key
4. 在服务器 `.env` 中添加：
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxx
   EMAIL_FROM=noreply@你的域名.com
   ```

配置后重启：`docker compose -f docker-compose.prod.yml restart app`

## Nginx 反向代理（HTTPS + 域名）

若使用 www.uhub.help，需在服务器安装 Nginx 并配置：

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d www.uhub.help
```

Nginx 配置示例（`/etc/nginx/sites-available/uhub`）：

```nginx
server {
    listen 80;
    server_name www.uhub.help;
    return 301 https://$server_name$request_uri;
}
server {
    listen 443 ssl;
    server_name www.uhub.help;
    ssl_certificate /etc/letsencrypt/live/www.uhub.help/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.uhub.help/privkey.pem;

    # WebSocket 实时消息 —— 必须在 /api 之前匹配
    location /ws/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    # 管理后台（buhub_admin 容器需已启动并映射 5174:80）
    location /admin {
        proxy_pass http://127.0.0.1:5174;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    # 错误跳到 /login 时拉回管理后台登录页（避免旧前端或缓存导致）
    location = /login {
        return 302 /admin/login;
    }
    location /terms {
        proxy_pass http://127.0.0.1:3000/terms;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /privacy {
        proxy_pass http://127.0.0.1:3000/privacy;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用：`sudo ln -s /etc/nginx/sites-available/uhub /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx`

## 验证

- API 地址: http://47.236.224.177:3000/api
- 健康检查: http://47.236.224.177:3000/api/auth/verify-token (需带 token)

## hCaptcha（发送验证码前的人机验证）

1. 注册 https://dashboard.hcaptcha.com/
2. 创建站点，获取 **Site Key** 和 **Secret Key**
3. 服务器 `.env` 添加：`HCAPTCHA_SECRET_KEY=你的Secret Key`
4. 前端 BUHUB `.env` 添加：`EXPO_PUBLIC_HCAPTCHA_SITE_KEY=你的Site Key`

## 前端配置

在 BUHUB 的 `.env` 中设置：

```
EXPO_PUBLIC_API_URL=https://www.uhub.help/api
EXPO_PUBLIC_HCAPTCHA_SITE_KEY=你的hCaptcha Site Key
EXPO_PUBLIC_TERMS_URL=https://www.uhub.help/terms
EXPO_PUBLIC_PRIVACY_URL=https://www.uhub.help/privacy
```

应用内「用户协议」「隐私政策」链接会打开上述 URL。后端已提供 `/terms`、`/privacy` 页面；若使用 Nginx，需在配置中增加对 `/terms`、`/privacy` 的反向代理到后端 3000 端口（见上方 Nginx 示例）。

## AWS Lightsail 托管 PostgreSQL（数据库在 Lightsail 里，不是 EC2「RDS」控制台时）

Lightsail 的数据库在 **[Lightsail 控制台](https://lightsail.aws.amazon.com)** 里管理，和 AWS 顶栏里单独的 **RDS** 服务不是同一个入口。

### 1. 看连接信息

1. 打开 **Lightsail** → 左侧 **Databases（数据库）** → 点你的数据库（例如显示为 Database-1）。
2. 打开 **Connect（连接）** 标签页，可以看到：
   - **Endpoint / 主机**、**Port（端口）**（多为 `5432`）
   - **User name（用户名）**
   - **Password（密码）**（若当时没保存，可在该页或数据库设置里 **Reset master password** 重置）

### 2. 允许你从本机或公网连上（否则只会超时）

Lightsail 数据库默认偏「内网」。要从**你自己电脑**跑 `pg_restore` / Prisma，需要：

1. 在同一数据库页面打开 **Networking（联网）**（或 **Connectivity（连接性）**）。
2. 打开 **Public mode（公开模式）**（名称可能略有差异，含义是允许经公网访问该数据库端点）。
3. 在 **IPv4 firewall（防火墙）** 里新增一条规则：
   - 应用 / 协议：**PostgreSQL**，端口 **5432**
   - **来源**：你当前网络的 **公网 IP**，写成 CIDR，例如 `203.0.113.50/32`（不要用 `0.0.0.0/0` 除非临时测试且接受风险）

家庭宽带 IP 常会变，连不上时先查 [本机公网 IP](https://ifconfig.me) 再改防火墙规则。

若后端跑在 **同一区域的 Lightsail 实例**上，也可以只开放 **该实例的私有 IP**，不必对全网公开（更安全）。

### 3. 库名与连接串

- 连接串格式与 RDS 相同：

  ```
  postgresql://用户名:密码@Endpoint:端口/库名?sslmode=require
  ```

- **库名**：在 Lightsail 数据库的概览 / 连接说明里查看；若没有 `buhub`，可先连上默认库再执行 `CREATE DATABASE buhub;`（与下文 RDS 说明一致）。

- SSL：官方说明见 [使用 SSL 连接 Lightsail PostgreSQL](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-connecting-to-postgres-database-using-ssl.html)。本仓库的 `DATABASE_URL_AWS` 一般可先加 `?sslmode=require` 再试。

### 4. 把本地 dump 恢复到 Lightsail

与 RDS 相同：在 `buhub_back/.env` 配置 `DATABASE_URL_AWS="postgresql://...?sslmode=require"`，然后执行 `npm run db:restore-aws`（见下节脚本说明）。

---

## AWS RDS PostgreSQL（独立 RDS 控制台；只有用户名、密码、Endpoint、端口时）

控制台里的 **Database-1** 一般是 **数据库实例标识符**，**不是** 连接 URL 里最后那一段「库名」。

1. **在 RDS 控制台确认真正的「库名」（database name）**  
   打开实例 → **Configuration（配置）** → 找 **DB name**（初始数据库名）。  
   常见是 `postgres`，或你创建实例时填的名字。  
   本地 Docker 用的是库名 **`buhub`**：若 RDS 上没有 `buhub`，需要先建库（任选一种）：
   - 用 **Query Editor** / 任意客户端连到默认库（如 `postgres`），执行：`CREATE DATABASE buhub;`
   - 或在创建 RDS 时把初始数据库名设为 `buhub`。

2. **拼 `DATABASE_URL` / `DATABASE_URL_AWS`（务必带 SSL）**  

   ```
   postgresql://用户名:密码@endpoint:端口/库名?sslmode=require
   ```

   示例（请换成你的真实值）：

   ```
   postgresql://admin:你的密码@database-1.xxxxxxxxxxxx.ap-southeast-1.rds.amazonaws.com:5432/buhub?sslmode=require
   ```

   - **Endpoint**：控制台里的长主机名（不要带 `http://`）。  
   - **端口**：一般是 `5432`。  
   - **密码**里若有 `@ : / #` 等特殊字符，需做 [URL 编码](https://developer.mozilla.org/en-US/docs/Glossary/Percent-encoding)（例如 `@` → `%40`）。

3. **本机把数据恢复到 RDS**（见仓库 `scripts/db-restore-to-aws.sh`）  
   在 `buhub_back/.env` 增加一行（勿提交 git）：

   ```
   DATABASE_URL_AWS="postgresql://...?sslmode=require"
   ```

   然后：

   ```bash
   cd buhub_back
   npm run db:restore-aws
   ```

4. **安全组**：RDS 所属安全组需允许 **你的本机公网 IP**（或 EC2 安全组）访问 **TCP 端口 5432**，否则连不上。

5. **上线后**：把运行后端的环境变量 **`DATABASE_URL`** 改成与上面相同形式的 RDS 地址（同样建议 `?sslmode=require`）。

## 常用命令

在**服务器**上进入后端目录再执行（例如 `cd /home/ubuntu/buhub_back`）：

```bash
# 查看容器状态
docker compose -f docker-compose.prod.yml ps

# 查看后端日志（实时，每条请求会打印 [http] METHOD path STATUS ms）
docker compose -f docker-compose.prod.yml logs -f app

# 只看最近 200 行
docker compose -f docker-compose.prod.yml logs --tail=200 app

# 重启
docker compose -f docker-compose.prod.yml restart app

# 停止
docker compose -f docker-compose.prod.yml down
```

若执行 `logs` 时提示 "no such file or directory" 或找不到 compose 文件，说明当前目录不对，需先 `cd` 到包含 `docker-compose.prod.yml` 的目录（部署脚本默认是 `/home/ubuntu/buhub_back`）。
