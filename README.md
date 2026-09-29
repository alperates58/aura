# Aura

> **Yeni Nesil Gerçek Zamanlı Özel Sohbet Platformu**  
> WhatsApp tarzı mikro durum takibi (`sent_at`, `delivered_at`, `read_at`), self-hosted WebRTC sesli/görüntülü arama (LiveKit SFU) ve Grupo Chat v3.15'in modernleştirilmiş 3 sütunlu tasarımına sahip yüksek performanslı 1-e-1 sohbet platformu.

---

## 🚀 Teknoloji Yığını
- **Backend:** Go 1.23+ (Fiber + WebSocket)
- **Ana Veritabanı:** PostgreSQL 16
- **Önbellek & Pub/Sub:** Redis 7 (In-Memory)
- **Medya Depolama:** MinIO (Self-Hosted S3)
- **Sesli & Görüntülü Görüşme:** LiveKit SFU (Self-Hosted WebRTC Docker)
- **Frontend:** Next.js 15 / React 19 + Tailwind CSS + Zustand
- **Dağıtım (DevOps):** Coolify (GitHub CI/CD Webhook) & Yerel Docker Compose

---

## 📚 Dokümantasyon
- 📘 [AGENTS.md](./AGENTS.md): Sistem Mimarisi, WebSocket Protokolü, DB Şeması ve Tasarım Kılavuzu.
- 📋 [FAZLAR.md](./FAZLAR.md): 7 Adımlık Ayrıntılı Geliştirme Yol Haritası ve Görev Listesi.

---

## 🛠️ Yerel Geliştirme Ortamı
```bash
# Tüm servisleri ayağa kaldır (PostgreSQL, Redis, MinIO, LiveKit, Go Backend, Next.js Frontend)
docker compose up -d

# Servis durumlarını kontrol et
docker compose ps
```
