# Aura - Proje Geliştirme Fazları ve Görev Rehberi (FAZLAR.md)

Bu doküman, **Aura** projesinin sıfırdan prodüksiyona (Coolify & Docker) kadar tüm geliştirme adımlarını, faz bazında detaylı görev listelerini, oluşturulacak kesin dosya yollarını ve test kriterlerini tanımlar.

---

## 📌 FAZ 1: Altyapı, Docker Ortamı, Coolify Entegrasyonu ve Veritabanı
> **Amaç:** Projenin monorepo iskeletini oluşturmak, yerel test ortamı ve Coolify otomatik dağıtım altyapısını kurmak, PostgreSQL şemasını ayağa kaldırmak.

### Alt Görevler:
1. **Dizin ve Git Hazırlığı:**
   - Proje dizininin oluşturulması (`C:\Users\alper\Desktop\Aura`)
   - Git reposunun ilklendirilmesi (`git init`)
   - `.gitignore` (Go derleme çıktıları, `.env`, node_modules, `.next`, MinIO/PG data klasörleri)
   - `.env.example` dosyasının tüm servisler için eksiksiz hazırlanması
2. **Yerel Docker Compose Yapılandırması (`docker-compose.yml`):**
   - `postgres`: PostgreSQL 16 Alpine, port 5432, kalıcı volume `pg_data`, sağlık kontrolü (`pg_isready`)
   - `redis`: Redis 7 Alpine, port 6379, AOF persistence açık, volume `redis_data`
   - `minio`: MinIO S3 Object Storage, API port 9000, Konsol port 9001, volume `minio_data`
   - `livekit`: LiveKit SFU Server, port 7880 (HTTP/Signal) & 7881 (UDP WebRTC), `livekit.yaml` mount
   - `backend`: Go 1.23 Docker servisi, port 8080, yerel hot-reload için volume mount
   - `frontend`: Next.js 15 Docker servisi, port 3000
3. **Coolify Üretim Yapılandırması (`docker-compose.prod.yml` & Dockerfiles):**
   - `backend/Dockerfile`: Multi-stage Go derleme (`golang:1.23-alpine` -> CGO_ENABLED=0 binary -> `alpine:3.20`, imaj boyutu ~20MB)
   - `frontend/Dockerfile`: Multi-stage Next.js derleme (`node:22-alpine` -> standalone output, imaj boyutu ~120MB)
   - Coolify Traefik etiketleri (Otomatik Let's Encrypt SSL, domain routing)
4. **PostgreSQL Migration ve Tablo Kurulumu:**
   - `backend/internal/database/migrations/001_init_schema.sql`:
     - `users` tablosu (UUID, username, display_name, password_hash, online_status, privacy_settings JSONB)
     - `conversations` tablosu (user_one_id, user_two_id, user_one_cleared_at, user_two_cleared_at, unique constraint)
     - `messages` tablosu (sent_at, delivered_at, read_at, media_metadata JSONB, reactions JSONB)
     - `call_logs` tablosu (caller_id, receiver_id, call_type, status, duration_seconds)
5. **MinIO Başlangıç Konfigürasyonu:**
   - Otomatik bucket oluşturucu: `avatars`, `audio_messages`, `media`, `files`

### Oluşturulacak Dosyalar:
```
Aura/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── .gitignore
├── Makefile
├── AGENTS.md
├── FAZLAR.md
├── livekit/livekit.yaml
├── backend/
│   ├── Dockerfile
│   ├── go.mod
│   ├── cmd/server/main.go
│   └── internal/database/migrations/001_init_schema.sql
└── frontend/
    ├── Dockerfile
    ├── package.json
    └── next.config.ts
```

### Doğrulama ve Test:
- `docker compose up -d` komutunun çalıştırılması.
- `docker compose ps` ile tüm 6 servisin `healthy` veya `running` olduğunun doğrulanması.
- `docker exec -it Aura-postgres psql -U postgres -d Aura -c "\dt"` ile 4 tablonun oluştuğunun teyit edilmesi.

---

## 📌 FAZ 2: Kimlik Doğrulama, Kullanıcı ve Profil Modülü
> **Amaç:** Güvenli JWT oturum mekanizması, profil yönetimi, avatar yükleme ve gizlilik ayarlarını inşa etmek.

### Alt Görevler:
1. **Şifreleme ve JWT Token Servisi:**
   - `bcrypt` (maliyet 12) ile şifre hash'leme ve doğrulama
   - Access Token (15 dk ömürlü JWT) ve Refresh Token (30 gün ömürlü rastgele 64 baytlık kriptografik token)
   - Token'ların `HttpOnly`, `SameSite=Lax`, `Secure` çerezler ile istemciye aktarılması
2. **Kimlik Doğrulama REST API'leri:**
   - `POST /api/v1/auth/register`:
     - Kullanıcı adı (küçük harf, harf/rakam/alt çizgi, 3-30 karakter)
     - E-posta doğrulama (geçerli format ve benzersizlik kontrolü)
     - Şifre karmaşıklığı denetimi (min 8 karakter)
   - `POST /api/v1/auth/login`:
     - Kullanıcı adı veya e-posta ile giriş
     - Hatalı girişte kilitlenme (brute-force koruması)
   - `POST /api/v1/auth/refresh`: Refresh token ile yeni access token üretimi
   - `POST /api/v1/auth/logout`: Çerezlerin temizlenmesi ve oturumun sonlandırılması
   - `GET /api/v1/auth/me`: Giriş yapan kullanıcının profilini döndürme
3. **Profil Düzenleme ve Avatar Yükleme:**
   - `PUT /api/v1/users/profile`: Görünen ad (`display_name`) ve biyografi (`bio`) güncelleme
   - `POST /api/v1/users/avatar`: Görseli doğrulama (JPEG/PNG/WebP, max 5MB), MinIO S3 `avatars` bucket'ına kaydetme, `avatar_url`'i güncelleme
4. **Gizlilik Tercihleri:**
   - `PATCH /api/v1/users/privacy`:
     - `read_receipts` (false ise karşı tarafa mavi tik gitmez, kendisi de göremez)
     - `last_seen` (false ise son görülme saati gizlenir)
     - `allow_calls` (false ise gelen aramalar otomatik meşgule düşer)
5. **Kullanıcı Arama ve Engelleme:**
   - `GET /api/v1/users/search?q=`: Kullanıcı adı veya e-posta ile anlık arama
   - `POST /api/v1/users/block`: Kullanıcıyı engelleme (`is_blocked = true`, `blocked_by = current_user`)
   - `POST /api/v1/users/unblock`: Engeli kaldırma

### Oluşturulacak Dosyalar:
```
backend/internal/
├── config/config.go
├── models/user.go
├── database/postgres.go
├── storage/minio.go
├── middleware/auth_jwt.go
└── handlers/
    ├── auth_handler.go
    └── user_handler.go
```

### Doğrulama ve Test:
- cURL / Postman ile `register`, `login`, `me` ve `avatar` yükleme isteklerinin test edilmesi.
- Yetkisiz isteklerin (`Authorization` veya cookie yokken) HTTP 401 Unauthorized aldığının doğrulanması.

---

## 📌 FAZ 3: Gerçek Zamanlı Mesajlaşma & WhatsApp Tipi Durum Motoru
> **Amaç:** Sistemin kalbi olan Go WebSocket Hub motorunu, WhatsApp tarzı 3 aşamalı tik mekanizmasını ve mesaj detay modalını tamamlamak.

### Alt Görevler:
1. **Go WebSocket Hub & Bağlantı Havuzu:**
   - `/ws` endpoint'i (JWT cookie üzerinden kimlik doğrulama)
   - İstemci başına iki goroutine: `readPump` (gelen soket mesajlarını dinler) ve `writePump` (istemciye veri yazar)
   - Bellekte `clients map[*Client]bool` ve `userClients map[string][]*Client` (bir kullanıcının birden fazla açık sekmesi desteklenir)
   - Redis Pub/Sub kanalı (`chat_events`) ile yatayda çoklu pod/sunucu senkronizasyonu
2. **1-e-1 Özel Sohbet Başlatma ve Geçmiş:**
   - `POST /api/v1/conversations`: İki kullanıcı arasında sohbet odası açma (zaten varsa mevcut olanı döndürme)
   - `GET /api/v1/conversations`: Sohbet listesi (Son mesaj önizlemesi, okunmamış mesaj sayısı rozeti, karşı tarafın online durumu)
   - `GET /api/v1/conversations/:id/messages?cursor=&limit=30`: Sayfalanmış mesaj geçmişi (`cleared_at` tarihinden sonraki mesajlar filtrelenir)
3. **WhatsApp Tarzı 3 Aşamalı Mesajlaşma Döngüsü:**
   - **Aşama 1: Gönderildi (Tek Gri Tik)**
     - İstemci WebSocket üzerinden `action: "send_message"` gönderir.
     - Go Backend PostgreSQL `messages` tablosuna satırı yazar (`sent_at = NOW()`).
     - Gönderen istemciye `action: "message_sent"` eventi basılır -> İstemci mesajı ekranda **Tek Gri Tik** simgesiyle gösterir.
   - **Aşama 2: İletildi (Çift Gri Tik)**
     - Alıcı kullanıcı WebSocket'e bağlıysa mesaj ona `action: "new_message"` olarak anında push edilir.
     - Alıcının tarayıcısı mesajı soketten aldığı milisaniyede arka plandan otomatik `action: "delivered_ack"` döner.
     - Backend veritabanında `delivered_at = NOW()` günceller.
     - Gönderen kullanıcıya `action: "message_delivered"` bildirimi basılır -> Ekranda anında **Çift Gri Tik** belirir.
   - **Aşama 3: Okundu (Çift Mavi Tik)**
     - Alıcı kullanıcı ilgili sohbeti açtığında ve mesaj ekranda (viewport) göründüğünde istemci otomatik `action: "read_ack"` yollar.
     - Backend veritabanında `read_at = NOW()` günceller.
     - Gönderen kullanıcıya `action: "message_read"` bildirimi basılır -> Ekranda tikler mavi renge dönerek **Çift Mavi Tik** olur.
4. **WhatsApp Tarzı "Mesaj Bilgisi" (Message Info) Modalı:**
   - Mesaja sağ tıklandığında / uzun basıldığında "Bilgi" menüsü açılır:
     - Okunma Saati: `read_at` (Örn: Bugün 14:35:12)
     - Teslim Edilme Saati: `delivered_at` (Örn: Bugün 14:32:05)
     - Gönderilme Saati: `sent_at` (Örn: Bugün 14:32:03)
5. **Sıfır DB Yüklü "Yazıyor..." ve "Çevrimiçi / Son Görülme":**
   - Kullanıcı yazmaya başladığında soketten `action: "typing_start"` yollanır.
   - Redis üzerinde `SET typing:conv_id:user_id 1 EX 5` anahtarı yazılır ve karşı tarafa `action: "user_typing"` iletilir. Veritabanına hiç gidilmez!
   - Kullanıcı soket açtığında Redis'te `user:id:online` set edilir ve herkese `presence_update (online)` basılır; soket kapandığında veritabanında `last_seen_at = NOW()` yazılır ve `presence_update (offline)` basılır.

### Oluşturulacak Dosyalar:
```
backend/internal/
├── websocket/
│   ├── hub.go
│   ├── client.go
│   └── protocol.go
├── redis/
│   ├── presence.go
│   └── typing.go
├── models/
│   ├── conversation.go
│   └── message.go
└── handlers/
    ├── chat_handler.go
    └── ws_handler.go
```

### Doğrulama ve Test:
- İki farklı tarayıcıda (Kullanıcı A ve Kullanıcı B) eşzamanlı oturum açılması.
- Kullanıcı A mesaj gönderdiğinde:
  1. Anında ekranda tek gri tik belirmeli.
  2. Kullanıcı B'nin ekranına mesaj ulaştığı an Kullanıcı A'da çift gri tik olmalı.
  3. Kullanıcı B sohbet sekmesine odaklandığında çift mavi tik olmalı.
  4. Mesaja sağ tıklayıp "Bilgi" dendiğinde gönderilme, iletilme ve okunma saatlerinin saniyesine kadar doğru listelendiği doğrulanmalı.

---

## 📌 FAZ 4: Zengin Medya, Sesli Notlar ve Mesaj Yönetimi
> **Amaç:** WhatsApp benzeri ses kaydı, dalga formu oynatıcı, fotoğraf/video/belge paylaşımı ve mesaj yönetimi.

### Alt Görevler:
1. **WhatsApp Tarzı Sesli Not (Voice Note):**
   - Tarayıcıda `MediaRecorder API` ile `audio/webm;codecs=opus` ses kaydı
   - Kayıt esnasında nabız gibi atan kırmızı kayıt noktası, süre sayacı (`00:15`) ve ses genliği animasyonu
   - Ses kaydını bitirip sunucuya gönderme (`POST /api/v1/media/upload`)
   - **Wavesurfer.js** ile mesaj balonunda gerçek ses dalga formu (waveform) görselleştirmesi, oynat/duraklat ve `1x`, `1.5x`, `2x` hız değiştirme butonları
2. **Görsel, Video ve Dosya Paylaşımı:**
   - Görsel yükleme (JPEG, PNG, WebP) ve otomatik küçük resim (thumbnail) üretimi
   - Video yükleme (MP4/WebM) ve video oynatıcı entegrasyonu
   - Belge ekleme (PDF, Word, Zip) için dosya simgesi, dosya boyutu ve tek tıkla indirme
   - Tüm medyaların MinIO S3 deposuna kaydedilmesi
3. **Mesaj Yanıtlama (Alıntı / Reply):**
   - Mesajı sağa kaydırarak veya menüden "Yanıtla" seçerek alıntılama
   - Alıntılanan mesajın içeriği, yazar adı ve türünün mesaj balonunun üst kısmında önizlenmesi
4. **Mesaj Düzenleme & Silme:**
   - Gönderildikten sonra 15 dakika içinde mesaj metnini düzenleme (`is_edited = true`)
   - "Benden Sil": Mesaj sadece o kullanıcının ekranından kalkar (`deleted_for_users` dizisine eklenir)
   - "Herkesten Sil": Mesaj her iki tarafta da silinir (`is_deleted_for_all = true`, balon "Bu mesaj silindi" haline gelir, MinIO'daki dosya silinir)
5. **Emoji Reaksiyonları ve Yıldızlı Mesajlar:**
   - Mesajın üstüne gelince açılan mini emoji çubuğu (👍, ❤️, 😂, 😮, 😢, 🙏)
   - Mesajın sağ alt köşesinde toplanan reaksiyon hapları (pills)
   - Mesajı yıldızlama (`is_starred = true`) ve "Yıldızlı Mesajlar" panelinde listeleme

### Oluşturulacak Dosyalar:
```
backend/internal/
├── handlers/media_handler.go
└── storage/minio.go (Thumbnail ve dosya silme fonksiyonları)

frontend/src/components/chat/
├── AudioRecorder.tsx
├── AudioWaveform.tsx
├── MediaPreviewModal.tsx
├── ReplyPreviewBar.tsx
└── ReactionPicker.tsx
```

### Doğrulama ve Test:
- Mikrofon ile ses kaydedilip gönderildiğinde karşı tarafta dalga formunun render edilmesi ve dinlenebilmesi.
- Görsel ve PDF dosyalarının başarıyla yüklenip MinIO linkinden açılabilmesi.
- "Herkesten Sil" dendiğinde karşı tarafın ekranında mesajın anında silindi uyarısına dönüşmesi.

---

## 📌 FAZ 5: Self-Hosted Sesli ve Görüntülü Arama (WebRTC LiveKit)
> **Amaç:** Harici bulut API'lerine (Agora/Twilio) bağımlı olmadan, kendi sunucumuzdaki LiveKit SFU ile 1-e-1 sesli/görüntülü arama.

### Alt Görevler:
1. **LiveKit Konfigürasyonu & Go Token Servisi:**
   - `livekit/livekit.yaml` yapılandırması (7880 portu HTTP/Signal, 7881 UDP Media)
   - Go Backend içinde `github.com/livekit/server-sdk-go` ile arama oturumu için güvenli JWT Room Token üretimi
2. **Arama Başlatma ve Meşguliyet Denetimi:**
   - Arayan kullanıcı "Sesli Arama" veya "Görüntülü Arama" butonuna basar.
   - WebSocket eventi: `action: "call_initiate", payload: { conversation_id, call_type }`
   - Go Backend Redis'te hedef kullanıcının aktif bir aramada olup olmadığını kontrol eder (`EXISTS user:id:in_call`).
   - Meşgulse: Arayana `action: "call_rejected", payload: { reason: "busy" }` basılır.
   - Müsaitse: Benzersiz bir LiveKit odası oluşturulur (`call_convUUID_time`), hedef kullanıcıya `action: "incoming_call"` push edilir.
3. **Tam Ekran Zil Ekranı (Incoming Call Modal):**
   - Alıcının ekranında zil sesi eşliğinde yumuşakça beliren arama kartı:
     - Arayanın büyük profil resmi ve adı
     - Arama türü simgesi (📞 Sesli veya 📹 Görüntülü)
     - Yeşil "Kabul Et" ve Kırmızı "Reddet" butonları
4. **1-e-1 Canlı Arama Arayüzü (Next.js & LiveKit React SDK):**
   - `@livekit/components-react` entegrasyonu
   - Kabul edildiğinde iki istemci doğrudan kendi sunucumuzdaki LiveKit SFU portuna bağlanır
   - Mikrofon Kapat/Aç (Mute/Unmute) ve Ses Seviyesi Göstergesi
   - Kamera Kapat/Aç ve Ön/Arka Kamera Değiştir
   - Ekran Paylaşımı (Screen Sharing) butonu
   - Bağlantı kalitesi göstergesi (Ping, paket kaybı, çözünürlük)
5. **Arama Geçmişi ve Çağrı Kayıtları:**
   - Arama bittiğinde süresi (sn) hesaplanıp `call_logs` tablosuna yazılır.
   - Sohbet akışında "Sesli Arama (12 dk 45 sn)" veya "Cevapsız Sesli Arama" mesaj balonu belirir.

### Oluşturulacak Dosyalar:
```
backend/internal/
├── livekit/livekit.go
└── handlers/call_handler.go

frontend/src/components/call/
├── IncomingCallModal.tsx
├── AudioCallInterface.tsx
├── VideoCallInterface.tsx
└── CallControls.tsx
```

### Doğrulama ve Test:
- İki farklı tarayıcı sekmesinde arama başlatılıp zil sesinin çalması.
- Arama kabul edildiğinde ses ve kamera görüntüsünün kendi yerel LiveKit sunucumuz üzerinden aktığının (`chrome://webrtc-internals`) doğrulanması.

---

## 📌 FAZ 6: Güvenlik, Spam Koruması & Bildirimler
> **Amaç:** Üretim seviyesi güvenlik standartları, hız koruması ve web bildirimleri.

### Alt Görevler:
1. **Hız Koruması (Rate Limiting / Flood Control):**
   - Redis Token Bucket algoritması: Kullanıcı saniyede en fazla 5 mesaj, dakikada en fazla 60 mesaj gönderebilir.
   - Sınır aşıldığında kullanıcıya "Çok hızlı mesaj gönderiyorsunuz, lütfen birkaç saniye bekleyin" uyarısı gösterilir.
2. **Güvenlik Başlıkları & XSS Koruması:**
   - Gelen tüm metin içeriklerinin HTML escape işleminden geçirilmesi
   - CORS konfigürasyonu (sadece izinli frontend origin'ine izin verme)
   - Güvenlik başlıkları: CSP (Content Security Policy), X-Frame-Options: DENY, HSTS
3. **Sesli ve Görsel Bildirimler:**
   - Web Audio API ile yumuşak mesaj bildirim sesleri (`message_sent.mp3`, `message_received.mp3`)
   - Sekme arka plandayken gelen mesajlarda tarayıcı sekme başlığının yanıp sönmesi (`(1) Yeni Mesaj - Aura`)
   - Web Push Notifications API (Kullanıcı izin verirse tarayıcı kapalıyken bile masaüstü/telefon bildirimi alma)
4. **Otomatik Kaybolan Mesajlar (Disappearing Messages):**
   - Sohbet ayarlarından süreli mesaj aktif edildiğinde (Örn: 24 saat), süresi dolan mesajların Go arka plan worker'ı (cron goroutine) ile otomatik temizlenmesi.

### Oluşturulacak Dosyalar:
```
backend/internal/
├── middleware/rate_limit.go
├── middleware/security.go
└── cron/cleaner.go

frontend/src/lib/
├── sounds.ts
└── push_notifications.ts
```

### Doğrulama ve Test:
- Arka arkaya 10 hızlı mesaj gönderildiğinde rate limiter'ın 6. mesajı bloke etmesi.
- Tarayıcı sekmesi arka plandayken mesaj geldiğinde sesin çalması ve masaüstü bildiriminin çıkması.

---

## 📌 FAZ 7: Frontend Polish, PWA, Coolify CI/CD & Prodüksiyon Dağıtımı
> **Amaç:** Grupo tasarım sisteminin eksiksiz parlatılması, PWA desteği ve Coolify ile GitHub üzerinden otomatik üretim dağıtımı.

### Alt Görevler:
1. **Grupo Temasının Birebir Yeniden Üretimi (UI Polish):**
   - **3 Sütunlu Sayfa Düzeni:**
     - Sol Dikey Menü (`SideNavigation` - 64px)
     - Sol Sohbet Listesi (`AsideList` - 340px)
     - Merkez Sohbet Penceresi (`Chatbox` - Flex-1)
     - Sağ Açılır Çekmece (`SlideOverDrawer` - 340px)
   - **Renk Paleti (Obsidian Dark & Cream Paper Light):**
     - Dark: `#0B0C0F` (ana zemin), `#16191E` (kartlar), `#1E293B` (çizgiler), `#E91E63` (aksan)
     - Light: `#F6F3F0`, `#FFFFFF`, `#DBD2C9`
   - **Mikro Etkileşimler:**
     - Ekleme butonunun (`+`) 405 derece dönerek (`x`) işaretine dönüşmesi animasyonu
     - Sohbet kartlarında okunmamış mesaj hap rozetleri (`badge-pill`)
     - Avatar kenarında online durumu yeşil nokta animasyonu
2. **PWA (Progressive Web App):**
   - `manifest.json` ve Service Worker kaydı
   - Mobil tarayıcılarda "Ana Ekrana Ekle" (Uygulama olarak yükle) deneyimi
   - Çevrimdışı (offline) durum sayfası
3. **Coolify Üretim Kurulumu & GitHub Webhook:**
   - GitHub deposunun Coolify paneline bağlanması
   - `docker-compose.prod.yml` üzerinden tek tıkla deploy
   - GitHub'a `git push origin main` yapıldığında Coolify'ın otomatik imajları derleyip ayağa kaldırması (Zero-Downtime Redeploy)
   - Otomatik SSL (Let's Encrypt) sertifikasyonunun doğrulanması
4. **Yük ve Performans Doğrulaması:**
   - 1.000 eşzamanlı WebSocket bağlantısı ile bellek ve CPU tüketimi testi (Hedef: < 150MB RAM).

### Oluşturulacak Dosyalar:
```
frontend/
├── src/components/layout/
│   ├── SideNavigation.tsx
│   ├── AsideList.tsx
│   ├── Chatbox.tsx
│   └── SlideOverDrawer.tsx
├── public/manifest.json
├── public/sw.js
└── tailwind.config.ts

Aura/
└── docker-compose.prod.yml
```

### Doğrulama ve Test:
- Coolify üzerinde tüm servislerin yeşil yandığı, `https://chat.domain.com` adresinden sisteme girilip uçtan uca mesajlaşma ve sesli/görüntülü görüşmenin sorunsuz çalıştığının onaylanması.
