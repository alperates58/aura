.PHONY: dev build down logs ps clean audit

# Yerel ortamı başlatır
dev:
	docker compose up -d

# İmajları yeniden derleyip başlatır
build:
	docker compose up -d --build

# Tüm konteynerleri durdurur
down:
	docker compose down

# Logları canlı takip eder
logs:
	docker compose logs -f

# Çalışan servislerin durumunu gösterir
ps:
	docker compose ps

# Tüm volume ve container verilerini temizler
clean:
	docker compose down -v

# Tedarik zinciri ve bağımlılık güvenlik taraması
audit:
	@echo "🔍 [1/2] Go Backend modülleri taranıyor..."
	@cd backend && go vet ./...
	@echo "🔍 [2/2] Frontend npm bağımlılıkları taranıyor..."
	@cd frontend && npm audit --audit-level=high
