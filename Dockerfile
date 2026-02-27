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
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy envs during build - Next.js pre-renders pages, DB/Redis not available
ENV DATABASE_URL="postgresql://fake:fake@localhost:5432/fake"
ENV REDIS_URL="redis://localhost:6379"
ENV JWT_SECRET="build-placeholder-not-used-at-runtime"
RUN npx prisma generate
RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
