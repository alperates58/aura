# syntax=docker/dockerfile:1
# ==========================================
# AURA - Next.js 15 Standalone Dockerfile
# ==========================================

# 1. Aşama: Bağımlılıklar (Deps)
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps --ignore-scripts --prefer-offline; \
    else \
      npm install --legacy-peer-deps --ignore-scripts --prefer-offline; \
    fi

# 2. Aşama: Derleme (Builder)
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_BASE_PATH=""
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_WS_URL=""
ARG NEXT_PUBLIC_LIVEKIT_URL=""
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# 3. Aşama: Üretim Çalışma Zamanı (Runner)
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Güvenlik: Non-root kullanıcı oluştur
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /app/.next && \
    chown -R nextjs:nodejs /app

# Minimal runtime için standalone çıktısını kopyala
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
