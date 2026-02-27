# BUHUB 后端部署指南

## 服务器信息

- **IP**: 47.236.224.177
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

设置 `JWT_SECRET`（至少 32 位随机字符串）

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

## 验证

- API 地址: http://47.236.224.177:3000/api
- 健康检查: http://47.236.224.177:3000/api/auth/verify-token (需带 token)

## 前端配置

在 BUHUB 的 `.env` 中设置：

```
EXPO_PUBLIC_API_URL=http://47.236.224.177:3000/api
```

## 常用命令

```bash
# 查看容器状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f app

# 重启
docker compose -f docker-compose.prod.yml restart app

# 停止
docker compose -f docker-compose.prod.yml down
```
