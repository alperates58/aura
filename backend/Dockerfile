# ==========================================
# AURA - Go Backend Multi-Stage Dockerfile
# ==========================================

# 1. Aşama: Derleme (Builder)
FROM golang:1.23-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates tzdata

COPY go.mod go.sum* ./
RUN go mod download || true

COPY . .

# Modül bağımlılıklarını eşitle ve statik Linux binary derle
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o /app/server ./cmd/server

# 2. Aşama: Üretim Çalışma Zamanı (Production Runtime)
FROM alpine:3.24

RUN apk add --no-cache ca-certificates tzdata curl ffmpeg && \
    cp /usr/share/zoneinfo/Europe/Istanbul /etc/localtime && \
    echo "Europe/Istanbul" > /etc/timezone

ENV TZ=Europe/Istanbul

WORKDIR /app

# Güvenlik: Non-root kullanıcı ve grup oluştur
RUN addgroup -S -g 10001 appgroup && \
    adduser -S -u 10001 -G appgroup appuser && \
    mkdir -p /app /tmp && \
    chmod 1777 /tmp

# Derlenen binary ve migration dosyalarını kopyala
COPY --from=builder --chown=appuser:appgroup /app/server /app/server
COPY --from=builder --chown=appuser:appgroup /app/internal/database/migrations /app/internal/database/migrations

USER appuser

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/api/v1/health || exit 1

CMD ["/app/server"]
