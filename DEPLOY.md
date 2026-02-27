# BUHUB 后端部署指南

## 服务器信息

- **IP**: 47.236.224.177
- **用户**: ubuntu
- **SSH**: `ssh ubuntu@47.236.224.177`

## 部署前准备

### 1. 服务器需安装

- Docker
- Docker Compose
- Git

```bash
# Ubuntu 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
# 重新登录后生效
```

### 2. 创建 .env 文件

在服务器 `buhub_back` 目录下创建 `.env`：

```env
DATABASE_URL="postgresql://buhub:buhub@postgres:5432/buhub"
REDIS_URL="redis://redis:6379"
JWT_SECRET="你的32位以上随机密钥"
JWT_EXPIRY="7d"
NEXT_PUBLIC_APP_URL="http://47.236.224.177:3000"
```

## 部署方式

### 方式一：使用部署脚本（推荐）

在本地项目根目录执行：

```bash
./deploy-backend.sh
```

脚本会 SSH 到服务器，拉取代码并启动 Docker 容器。

### 方式二：手动部署

```bash
# 1. SSH 到服务器
ssh ubuntu@47.236.224.177

# 2. 克隆/更新代码
cd /home/ubuntu
git clone git@github.com:David-Zhang-test/buhub_back.git
cd buhub_back

# 3. 创建 .env（首次）
cp .env.example .env
# 编辑 .env 设置 JWT_SECRET 等

# 4. 构建并启动
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# 5. 查看日志
docker compose -f docker-compose.prod.yml logs -f app
```

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
