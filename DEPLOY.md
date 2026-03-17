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

**方式 A：Resend（推荐，简单）**

1. 注册 https://resend.com
2. 添加并验证发信域名
3. 创建 API Key
4. 在服务器 `.env` 中添加：
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxx
   EMAIL_FROM=noreply@你的域名.com
   ```

**方式 B：SMTP（通用）**

适用于 Gmail、SendGrid、Mailgun、阿里云邮件推送等：

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-user
SMTP_PASSWORD=your-password
EMAIL_FROM=noreply@yourdomain.com
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
