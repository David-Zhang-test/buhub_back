# BUHUB Backend - Production Dockerfile
# Use Debian (not Alpine) - Prisma needs OpenSSL 3, Alpine has compatibility issues
FROM node:20-bookworm-slim AS base

# Install OpenSSL for Prisma (Debian Bookworm has libssl3)
RUN apt-get update -y && apt-get install -y openssl libssl3 && rm -rf /var/lib/apt/lists/*

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Repo may omit public/; Next standalone + runner COPY expect /app/public to exist
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy envs during build - Next.js pre-renders pages, DB/Redis not available
ENV DATABASE_URL="postgresql://fake:fake@localhost:5432/fake"
ENV REDIS_URL="redis://localhost:6379"
ENV JWT_SECRET="build-placeholder-not-used-at-runtime"
# Optional: pass at build to avoid "Failed to find Server Action" across deploys (openssl rand -base64 32)
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY}
RUN npx prisma generate
RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install Python + OpenCV for AI schedule block detection (isolated venv)
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends python3 python3-venv && \
    python3 -m venv /opt/cv-venv && \
    /opt/cv-venv/bin/pip install opencv-python-headless numpy && \
    rm -rf /var/lib/apt/lists/*
ENV PYTHON_CV_PATH=/opt/cv-venv/bin/python3

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/src/lib/logger.js ./src/lib/logger.js
# OpenCV script for schedule course block detection
COPY --from=builder /app/scripts/detect-blocks.py ./scripts/detect-blocks.py
# standalone 的 node_modules 不含 server.js 所需依赖，从 builder 复制完整 node_modules 覆盖
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

RUN mkdir -p /app/logs && chown nextjs:nodejs /app/logs

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
