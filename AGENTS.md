# Aura - Yeni Nesil Gerçek Zamanlı Özel Sohbet Platformu
## Sistem Mimarisi, Protokol Spesifikasyonu ve Geliştirici Kılavuzu (AGENTS.md)

> **BU BELGE HAKKINDA:**  
> Bu doküman, **Aura** projesinin tüm mimari kararlarını, veritabanı şemalarını, WebSocket protokollerini, self-hosted WebRTC sinyalleşmesini, Coolify/Docker dağıtım kurallarını ve Grupo Chat v3.15'ten türetilen arayüz tasarım sistemini içeren **ana sistem spesifikasyonudur**. Yeni bir sohbete başlayan veya projeyi devralan herhangi bir yapay zeka ajanı veya yazılım mühendisi, başka hiçbir harici kaynağa ihtiyaç duymadan bu dokümandaki yönergelerle projeyi eksiksiz inşa edebilmelidir.

---

## 1. PROJE VİZYONU VE TEMEL PRENSİPLER

**Aura**, WhatsApp'ın bilinen ve sevilen mikro durumlarını (gönderilme, cihaza teslim edilme ve okunma saatleri) birebir sunan, yüksek eşzamanlılık (high-concurrency) için **Go (Golang)** ile yazılan, sesli ve görüntülü görüşmeleri harici bulutlara (Agora/Twilio vb.) bağımlı kalmadan **kendi sunucumuzdaki LiveKit SFU** üzerinden yürüten modern bir birebir (1-on-1) özel mesajlaşma platformudur.

### Temel Mühendislik İlkeleri:
1. **Sıfır Dış Bağımlılık (100% Self-Hosted):** Agora, Twilio, Pusher veya Firebase gibi ücretli/harici API'ler kullanılmaz. WebRTC (LiveKit SFU), Nesne Depolama (MinIO S3), Önbellek (Redis) ve Veritabanı (PostgreSQL) kendi sunucumuzda Docker üzerinde barınır.
2. **Aşırı Düşük Gecikme (< 15ms Latency):** Go goroutine bağlantı havuzu ve Redis Pub/Sub ile mesaj teslimi milisaniyeler içinde gerçekleşir.
3. **Detaylı WhatsApp Tarzı Durum Takibi:** Her mesaj `sent_at`, `delivered_at` ve `read_at` zaman damgalarına sahiptir. Kullanıcı mesaja tıkladığında "Mesaj Bilgisi" modalında saniyesine kadar teslim ve okunma saatlerini görür.
4. **Veritabanı Koruma Kuralı (Zero-DB Ephemeral Load):** "Yazıyor..." (typing) ve "Çevrimiçi" (presence) gibi saniyede binlerce kez tetiklenen yüksek frekanslı event'ler PostgreSQL'e yazılmaz; doğrudan Redis TTL (5 sn) ve WebSocket üzerinden akıtılır.
5. **Grupo Temasının Birebir Modernizasyonu:** Grupo Chat v3.15'in kullanıcılar tarafından çok sevilen 3 sütunlu ferah arayüzü (64px dikey navigasyon, 340px sohbet listesi, flex-1 sohbet alanı, 340px sağ çekmece) modern Tailwind CSS + Radix UI ile birebir yeniden üretilir.

---

## 2. TEKNOLOJİ YIĞINI (TECH STACK)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           İSTEMCİ KATMANI (FRONTEND)                            │
│  Next.js 15 (App Router) + React 19 + Tailwind CSS + Zustand + Wavesurfer.js    │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ HTTPS / WSS (Port 443 / 8080)
┌────────────────────────────────────────▼────────────────────────────────────────┐
│                          SUNUCU KATMANI (GO BACKEND)                            │
│   Go 1.23+ • Fiber v2 / Chi • nhooyr.io/websocket • GORM / SQLx • Zap Logger     │
│   - JWT Auth & HttpOnly Cookie Güvenliği                                        │
│   - WebSocket Hub & Goroutine Connection Pool                                   │
│   - LiveKit Server SDK (Token Üretici & Oda Yöneticisi)                         │
│   - MinIO S3 SDK (Presigned URL & Chunked Upload)                               │
└──────────────┬─────────────────────────┬────────────────────────┬───────────────┘
               │                         │                        │
┌──────────────▼────────┐ ┌──────────────▼────────┐ ┌─────────────▼───────────────┐
│     POSTGRESQL 16     │ │        REDIS 7        │ │        MINIO (S3)           │
│  - users              │ │  - Presence (Online)  │ │  - Avatarlar                │
│  - conversations      │ │  - Typing (5s TTL)    │ │  - Sesli Mesajlar (WebM)    │
│  - messages           │ │  - Pub/Sub Hub        │ │  - Görseller & Videolar     │
│  - call_logs          │ │  - Rate Limiting      │ │  - Ekli Belgeler            │
└───────────────────────┘ └───────────────────────┘ └─────────────────────────────┘
                                         │ WebRTC Signaling / Media Streams
┌────────────────────────────────────────▼────────────────────────────────────────┐
│                        LIVEKIT SERVER SFU (SELF-HOSTED)                         │
│  Go ile yazılmış WebRTC SFU motoru • Port 7880 (Signal) & 7881 (UDP WebRTC Media) │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. PROJE DİZİN YAPISI (MONOREPO)

Proje `Aura` kök dizininde modern bir monorepo yapısında organize edilmiştir:

```
Aura/
├── docker-compose.yml             # Yerel test ortamı (6 servis: Go, Next, PG, Redis, MinIO, LiveKit)
├── docker-compose.prod.yml        # Coolify / Üretim ortamı (Traefik / Caddy SSL etiketleriyle)
├── Makefile                       # Geliştirme kısayolları (make dev, make build, make migrate)
├── .env.example                   # Örnek çevre değişkenleri
├── README.md                      # Proje tanıtımı
├── AGENTS.md                      # Bu ana mimari ve ajan rehberi
├── FAZLAR.md                      # Adım adım 7 fazlık geliştirme yol haritası
│
├── backend/                       # Go Backend Servisi (REST API + WebSocket)
│   ├── cmd/
│   │   └── server/
│   │       └── main.go            # Uygulama giriş noktası (Entrypoint)
│   ├── internal/
│   │   ├── config/                # Çevre değişkenleri ve yapılandırma (Viper/CleanEnv)
│   │   ├── database/              # PostgreSQL bağlantısı ve migration koşucusu
│   │   │   ├── postgres.go
│   │   │   └── migrations/        # 001_users.sql, 002_conversations.sql, 003_messages.sql
│   │   ├── redis/                 # Redis istemcisi, Pub/Sub, Presence ve Typing yönetimi
│   │   │   ├── client.go
│   │   │   ├── presence.go
│   │   │   └── typing.go
│   │   ├── storage/               # MinIO S3 SDK entegrasyonu (Upload, Presign, Delete)
│   │   │   └── minio.go
│   │   ├── livekit/               # LiveKit Room & Token üretim servisi
│   │   │   └── livekit.go
│   │   ├── models/                # GORM / SQL modelleri ve DTO'lar
│   │   │   ├── user.go
│   │   │   ├── conversation.go
│   │   │   ├── message.go
│   │   │   └── call_log.go
│   │   ├── handlers/              # HTTP ve WebSocket kontrolcüleri
│   │   │   ├── auth_handler.go    # Register, Login, Refresh, Logout
│   │   │   ├── user_handler.go    # Profil, Avatar, Arama, Engelleme
│   │   │   ├── chat_handler.go    # Sohbet listeleme, geçmiş getirme, temizleme
│   │   │   ├── call_handler.go    # Arama başlatma, reddetme, token alma
│   │   │   └── ws_handler.go      # WebSocket Upgrade ve Hub bağlantısı
│   │   ├── websocket/             # WebSocket çekirdek motoru
│   │   │   ├── hub.go             # Client kayıt, silme, mesaj yönlendirme
│   │   │   ├── client.go          # ReadPump & WritePump goroutine döngüleri
│   │   │   └── protocol.go        # Gelen/Giden JSON mesaj tipleri
│   │   └── middleware/            # JWT doğrulama, CORS, Rate Limiting, Logger
│   │       ├── auth_jwt.go
│   │       ├── rate_limit.go
│   │       └── security.go
│   ├── go.mod
│   ├── go.sum
│   └── Dockerfile                 # Multi-stage Go üretim Docker imajı
│
├── frontend/                      # Next.js 15 / React 19 Frontend
│   ├── public/
│   │   ├── sounds/                # message_sent.mp3, message_received.mp3, incoming_call.mp3
│   │   └── manifest.json          # PWA yapılandırması
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx         # Root layout, fontlar, tema sağlayıcı
│   │   │   ├── page.tsx           # Ana sohbet arayüzü (3 sütunlu Grupo layout'u)
│   │   │   ├── login/page.tsx     # Giriş ekranı
│   │   │   └── register/page.tsx  # Kayıt ekranı
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── SideNavigation.tsx # 64px sol dikey navigasyon barı
│   │   │   │   ├── AsideList.tsx      # 340px sohbet arama ve konuşmalar listesi
│   │   │   │   ├── Chatbox.tsx        # Merkez mesajlaşma penceresi
│   │   │   │   └── SlideOverDrawer.tsx# 340px sağ açılır profil/medya çekmecesi
│   │   │   ├── chat/
│   │   │   │   ├── ChatHeader.tsx     # Karşı taraf avatarı, adı, son görülme, arama butonları
│   │   │   │   ├── MessageStream.tsx  # Scrollable mesaj listesi & tarih ayracı
│   │   │   │   ├── MessageBubble.tsx  # WhatsApp tarzı tikli mesaj balonu
│   │   │   │   ├── MessageInfoModal.tsx # "Kaçta okundu/iletildi" detay ekranı
│   │   │   │   ├── MessageEditor.tsx  # Dönen '+' butonu, metin kutusu, emoji seçici
│   │   │   │   ├── AudioRecorder.tsx  # Ses kaydı alma ve süre sayacı
│   │   │   │   └── AudioWaveform.tsx  # Wavesurfer.js dalga formlu ses çalar
│   │   │   └── call/
│   │   │       ├── IncomingCallModal.tsx # Tam ekran çalan zil ve arama bildirim kartı
│   │   │       ├── AudioCallInterface.tsx# 1-e-1 sesli arama paneli
│   │   │       └── VideoCallInterface.tsx# 1-e-1 görüntülü arama ve ekran paylaşımı
│   │   ├── store/                 # Zustand Reaktif Durum Yönetimi
│   │   │   ├── useAuthStore.ts    # Kullanıcı oturumu ve profil bilgileri
│   │   │   ├── useChatStore.ts    # Aktif konuşma, mesajlar, yazıyor bilgisi
│   │   │   ├── useSocketStore.ts  # Canlı WebSocket bağlantısı ve event dinleyicileri
│   │   │   └── useCallStore.ts    # WebRTC arama durumu ve LiveKit odası
│   │   ├── lib/
│   │   │   ├── api.ts             # Axios / Fetch HTTP istemcisi (JWT cookie otomatik taşır)
│   │   │   ├── utils.ts           # Tarih/Saat formatlayıcı (Intl.DateTimeFormat)
│   │   │   └── sounds.ts          # Web Audio API ses efektleri
│   │   └── styles/
│   │       └── globals.css        # Grupo renk paleti CSS değişkenleri
│   ├── tailwind.config.ts         # Grupo renk temaları genişletmesi
│   ├── next.config.ts             # Standalone output ve PWA ayarları
│   ├── package.json
│   └── Dockerfile                 # Multi-stage Next.js üretim Docker imajı
│
└── livekit/
    └── livekit.yaml               # Yerel LiveKit SFU sunucu konfigürasyonu
```

---

## 4. TAM VERİTABANI ŞEMASI (POSTGRESQL 16)

```sql
-- UUID üretimi için eklenti
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. KULLANICILAR TABLOSU (users)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url TEXT DEFAULT '',
    bio VARCHAR(255) DEFAULT '',
    online_status INT DEFAULT 0, -- 0: Offline, 1: Online, 2: Idle
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    privacy_settings JSONB DEFAULT '{"read_receipts": true, "last_seen": true, "allow_calls": true}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);

-- 2. BİREBİR KONUŞMALAR TABLOSU (conversations)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_one_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_two_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- WhatsApp tarzı geçmişi temizleme işaretçileri:
    -- Kullanıcı geçmişi sildiğinde mesajlar DB'den silinmez, sadece bu tarih güncellenir.
    user_one_cleared_at TIMESTAMP WITH TIME ZONE DEFAULT '1970-01-01 00:00:00+00',
    user_two_cleared_at TIMESTAMP WITH TIME ZONE DEFAULT '1970-01-01 00:00:00+00',
    is_blocked BOOLEAN DEFAULT FALSE,
    blocked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_conversation_users UNIQUE(user_one_id, user_two_id),
    CONSTRAINT chk_different_users CHECK (user_one_id <> user_two_id)
);
CREATE INDEX idx_conversations_user_one ON conversations(user_one_id);
CREATE INDEX idx_conversations_user_two ON conversations(user_two_id);

-- 3. MESAJLAR TABLOSU (messages) - WHATSAPP TİPİ ZAMAN TAKİBİ
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text', -- 'text', 'voice', 'image', 'video', 'file', 'call_log'
    content TEXT DEFAULT '',                          -- Metin içeriği
    media_url TEXT DEFAULT '',                        -- MinIO dosya linki
    media_metadata JSONB DEFAULT '{}'::jsonb,         -- {file_name, file_size, duration, waveform: [], mime_type}
    
    -- WHATSAPP TİPİ 3 AŞAMALI ZAMAN VE DURUM TAKİBİ:
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),   -- Tek Gri Tik (Sunucuya ulaştı)
    delivered_at TIMESTAMP WITH TIME ZONE,            -- Çift Gri Tik (Alıcının soketine teslim edildi)
    read_at TIMESTAMP WITH TIME ZONE,                 -- Çift Mavi Tik (Alıcı ekranda gördü)
    
    is_edited BOOLEAN DEFAULT FALSE,
    is_starred BOOLEAN DEFAULT FALSE,
    is_deleted_for_all BOOLEAN DEFAULT FALSE,
    deleted_for_users UUID[] DEFAULT '{}',            -- Benden sil diyenlerin ID'leri
    reactions JSONB DEFAULT '{}'::jsonb,              -- {"👍": ["user_id_1"], "❤️": ["user_id_2"]}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_recipient_unread ON messages(recipient_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_messages_recipient_undelivered ON messages(recipient_id, delivered_at) WHERE delivered_at IS NULL;

-- 4. SESLİ VE GÖRÜNTÜLÜ ARAMA KAYITLARI (call_logs)
CREATE TABLE call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    call_type VARCHAR(10) NOT NULL, -- 'audio', 'video'
    status VARCHAR(20) NOT NULL,    -- 'missed', 'rejected', 'completed', 'busy'
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_call_logs_conversation ON call_logs(conversation_id, created_at DESC);
```

---

## 5. GERÇEK ZAMANLI WEBSOCKET PROTOKOLÜ VE OLAY DÖNGÜSÜ

Tüm gerçek zamanlı iletişim `/ws` uç noktası üzerinden JSON formatında paketlerle yürütülür.

### A. WebSocket Paket Standartları
Her mesaj bir `action` ve `payload` içerir:
```json
{
  "action": "action_name",
  "payload": { ... }
}
```

### B. İstemciden Sunucuya Gönderilen Olaylar (Client -> Server)
| Action | Açıklama | Payload Yapısı |
| :--- | :--- | :--- |
| `send_message` | Yeni mesaj gönderme | `{"conversation_id": "uuid", "message_type": "text", "content": "Selam", "reply_to_id": null}` |
| `delivered_ack` | Mesajın cihaza ulaştığı onayı | `{"message_ids": ["uuid_1", "uuid_2"]}` |
| `read_ack` | Mesajın ekranda okunduğu onayı | `{"conversation_id": "uuid", "message_ids": ["uuid_1"]}` |
| `typing_start` | Yazıyor göstergesi tetikleme | `{"conversation_id": "uuid"}` (Redis TTL 5s güncellenir) |
| `typing_stop` | Yazmayı bıraktı bildirimi | `{"conversation_id": "uuid"}` |
| `call_initiate` | Sesli/görüntülü arama başlatma | `{"conversation_id": "uuid", "call_type": "audio" \| "video"}` |
| `call_accept` | Gelen aramayı kabul etme | `{"call_id": "uuid"}` |
| `call_reject` | Gelen aramayı reddetme | `{"call_id": "uuid"}` |
| `call_end` | Devam eden aramayı sonlandırma | `{"call_id": "uuid"}` |
| `ping` | Bağlantı liveness kontrolü | `{}` |

### C. Sunucudan İstemciye İtilen Olaylar (Server -> Client)
| Action | Açıklama | Payload Yapısı |
| :--- | :--- | :--- |
| `message_sent` | Gönderene Tek Gri Tik onayı | `{"temp_id": "...", "message": { id, sent_at, ... }}` |
| `new_message` | Alıcıya gelen yeni mesaj | `{ id, conversation_id, sender_id, content, sent_at, ... }` |
| `message_delivered` | Gönderene Çift Gri Tik bildirimi | `{"message_ids": ["uuid"], "delivered_at": "ISO8601"}` |
| `message_read` | Gönderene Çift Mavi Tik bildirimi | `{"message_ids": ["uuid"], "read_at": "ISO8601"}` |
| `user_typing` | Karşı taraf yazıyor bilgisi | `{"conversation_id": "uuid", "user_id": "uuid"}` |
| `presence_update` | Kullanıcı online/offline oldu | `{"user_id": "uuid", "status": 1, "last_seen_at": "..."}` |
| `incoming_call` | Alıcıda çalan arama zili ekranı | `{"call_id": "uuid", "caller": { id, display_name, avatar_url }, "call_type": "audio", "room_token": "..."}` |
| `call_answered` | Arama kabul edildi (LiveKit'e gir)| `{"call_id": "uuid", "room_token": "..."}` |
| `call_rejected` | Arama reddedildi / Meşgul | `{"call_id": "uuid", "reason": "rejected" \| "busy"}` |

---

## 6. WHATSAPP TARZI DURUM VE MESAJ BİLGİSİ (MESSAGE INFO) AKIŞI

```
[ GÖNDEREN CİHAZ ]           [ GO BACKEND & REDIS ]             [ ALICI CİHAZ ]
        │                               │                              │
        │ 1. send_message               │                              │
        ├──────────────────────────────►│                              │
        │                               │ 2. PostgreSQL Insert         │
        │                               │    sent_at = NOW()           │
        │ 3. message_sent (TEK GRİ TİK) │                              │
        │◄──────────────────────────────┤                              │
        │                               │ 4. Alıcı Socket bağlı mı?    │
        │                               │    (Redis Presence denetler) │
        │                               │ 5. new_message Push edilir   │
        │                               ├─────────────────────────────►│ (Mesaj cihazına ulaştı)
        │                               │ 6. delivered_ack yollar      │
        │                               │◄─────────────────────────────┤
        │                               │ 7. DB update:                │
        │                               │    delivered_at = NOW()      │
        │ 8. message_delivered          │                              │
        │    (ÇİFT GRİ TİK)             │                              │
        │◄──────────────────────────────┤                              │
        │                               │                              │
        │                               │                              │ 9. Alıcı o sohbeti açar
        │                               │                              │    (Mesaj viewport'ta)
        │                               │ 10. read_ack yollar          │
        │                               │◄─────────────────────────────┤
        │                               │ 11. DB update:               │
        │                               │     read_at = NOW()          │
        │ 12. message_read              │                              │
        │     (ÇİFT MAVİ TİK)           │                              │
        │◄──────────────────────────────┤                              │
```

### Mesaj Detay Modalı ("Mesaj Bilgisi"):
Kullanıcı mesaja sağ tıkladığında (veya mobilde uzun bastığında) `Bilgi` seçeneğine basar:
- **Okundu:** `read_at` zaman damgası varsa biçimlendirilir (Örn: `Bugün 14:35:12`) + Çift Mavi Tik.
- **İletildi:** `delivered_at` zaman damgası biçimlendirilir (Örn: `Bugün 14:32:05`) + Çift Gri Tik.
- **Gönderildi:** `sent_at` zaman damgası biçimlendirilir (Örn: `Bugün 14:32:03`).

---

## 7. SELF-HOSTED SESLİ VE GÖRÜNTÜLÜ ARAMA (WEBRTC LIVEKIT)

Agora veya Twilio'ya kuruş ödemeden, kendi sunucumuzdaki **LiveKit SFU** ile 1-e-1 arama mimarisi:

1. **LiveKit Konfigürasyonu (`livekit.yaml`):**
   ```yaml
   port: 7880
   rtc:
     tcp_port: 7881
     udp_port: 7881
     use_external_ip: true
   keys:
     API_KEY_Aura: "SECRET_KEY_SUPER_SECURE_Aura_2026"
   ```
2. **Token Üretimi (Go Backend):**
   Arama başladığında Go backend `github.com/livekit/server-sdk-go` kullanarak iki taraf için de benzersiz `RoomName` (örn. `call_convUUID_time`) üzerinden bir JWT Room Token üretir:
   ```go
   at := auth.NewAccessToken(apiKey, apiSecret)
   grant := &auth.VideoGrant{
       RoomJoin: true,
       Room:     roomName,
       CanPublish: true,
       CanSubscribe: true,
   }
   at.AddGrant(grant).SetIdentity(userID).SetValidFor(time.Hour)
   token, _ := at.ToJWT()
   ```
3. **Frontend Entegrasyonu:**
   Arama kabul edildiğinde Next.js tarafında `@livekit/components-react` devreye girer. Tarayıcı doğrudan `wss://livekit.domain.com` adresine bağlanır; ses ve video akışları SFU üzerinden sıfır paket kaybıyla iletilir.

---

## 8. GRUPO CHAT TEMASININ BİREBİR YENİDEN ÜRETİMİ (DESIGN SYSTEM)

Grupo Chat v3.15'in kullanıcılar tarafından çok beğenilen arayüz standartları Tailwind CSS konfigürasyonumuza birebir aktarılmıştır:

### A. 3 Sütunlu Sayfa Yerleşimi
1. **Sol Dikey Navigasyon (Side Navigation - 64px sabit genişlik):**
   - Üstte yuvarlak logo, ortada dikey ikonlar (Sohbetler, Bildirimler, Çevrimiçi Üyeler, Ayarlar, Profil).
   - Alt kısımda Güneş/Ay teması ve çıkış butonu.
   - Aktif sekmede sol kenarda renkli dikey aktiflik çizgisi (`border-l-4 border-accent`).
2. **Sol Sohbet Listesi (Aside - 340px genişlik):**
   - Üstte arama barı (`bg-[#0F1115]`, `border-[#1E293B]`) ve filtreleme ikonları.
   - Sohbet kartları: Yuvarlak avatar (çevrimiçi durum noktası yeşil/sarı), kalın kullanıcı adı, son mesaj önizlemesi, zaman etiketi ve okunmamış mesaj rozeti (`badge-pill`).
3. **Merkezi Sohbet Penceresi (Chatbox - Flex-1 genişleyen alan):**
   - **Header:** Karşı tarafın avatarı, adı, "çevrimiçi / son görülme" durumu, sağda Sesli Arama, Görüntülü Arama ve Seçenekler Menüsü.
   - **Contents (Mesaj Akışı):** Tarih ayracı pill'leri ("Bugün", "Dün"), sağa yaslı bizim balonlarımız, sola yaslı karşı tarafın balonları, alt köşede okundu tikleri ve saat.
   - **Footer (Mesaj Editörü):** Sol tarafta ekleme menüsü (**35px dairesel `+` butonu; tıklandığında 405 derece dönerek `x` işaretine dönüşür**), ortada genişleyen metin alanı, sağda emoji butonu ve gönder butonu.
4. **Sağ Açılır Çekmece (Slide-over Info Panel - 340px genişlik):**
   - Profil bilgileri, paylaşılan medya galerisi (fotoğraflar, ses kayıtları, belgeler) ve gizlilik ayarları için sağdan kayarak açılan panel.

### B. Koyu Mod (Dark Mode) Renk Paleti (Obsidian Dark)
- `bg-primary`: `#0B0C0F` (Ana sayfa arka planı)
- `bg-secondary`: `#16191E` (Kartlar ve paneller)
- `border-primary`: `#1E293B` (Ana kenarlıklar)
- `border-secondary`: `#334155` (İkincil çizgiler)
- `input-bg`: `#0F1115` (Form ve arama giriş alanları)
- `accent-primary`: `#E91E63` / `#E86A6A` (Mercan Pembesi Vurgu)
- `bubble-own`: `#59102D` (Kendi mesaj balonumuz - koyu bordo/mercan) veya `#005C4B` (WhatsApp Yeşili)
- `bubble-other`: `#1E293B` (Karşı tarafın mesaj balonu - koyu slate)
- `text-primary`: `#F8FAFC` (Net beyaz metin)
- `text-secondary`: `#94A3B8` (Alt metinler ve açıklamalar)
- `text-muted`: `#64748B` (Saat ve zaman damgaları)

### C. Açık Mod (Light Mode) Renk Paleti (Cream Paper)
- `bg-primary`: `#F6F3F0` (Sıcak krem kağıt dokusu)
- `bg-secondary`: `#FFFFFF` (Saf beyaz paneller)
- `border-primary`: `#DBD2C9` (Doğal taş grisi)
- `bubble-own`: `#FDECEC` (Açık gül/mercan) veya `#D9FDD3` (Açık yeşil)
- `bubble-other`: `#FFFFFF` (Hafif gölgeli beyaz)
- `text-primary`: `#4F6673` (Koyu arduvaz mavisi)
- `text-secondary`: `#6F828F`

---

## 9. DOCKER & COOLIFY DAĞITIM STANDARTLARI

1. **Multi-Stage Go Dockerfile (`backend/Dockerfile`):**
   - Aşama 1: `golang:1.23-alpine` üzerinde statik binary derlenir (`CGO_ENABLED=0 go build -ldflags="-s -w" -o server ./cmd/server`).
   - Aşama 2: `alpine:3.20` veya `scratch` üzerine sadece derlenen binary kopyalanır. İmaj boyutu **< 25 MB** olur.
2. **Multi-Stage Next.js Dockerfile (`frontend/Dockerfile`):**
   - `node:22-alpine` üzerinde `output: 'standalone'` ile derlenir. Nihai imaj boyutu **< 120 MB** olur.
3. **Coolify Otomatik Dağıtımı (`docker-compose.prod.yml`):**
   - GitHub reposundaki `main` branch'e push yapıldığında Coolify webhook'u tetiklenir.
   - Coolify Traefik entegrasyonu ile domainlere otomatik Let's Encrypt SSL tanımlanır:
     - `chat.domain.com` -> Frontend (Port 3000)
     - `api.domain.com` -> Go Backend (Port 8080)
     - `livekit.domain.com` -> LiveKit Server (Port 7880 & 7881 UDP)
     - `s3.domain.com` -> MinIO S3 API (Port 9000)

---

## 10. AJANLAR (AGENTS) İÇİN GELİŞTİRME YÖNERGELERİ

Projeyi geliştiren tüm yapay zeka ajanları aşağıdaki değişmez kurallara uymak zorundadır:

1. **Harici Bulut Yasağı:** Sesli/görüntülü görüşme veya medya barındırma için kesinlikle Agora, Twilio, Firebase vb. harici SDK'lar eklenmeyecek; projenin Docker LiveKit ve MinIO servisleri kullanılacaktır.
2. **Performans Disiplini:** Yazıyor göstergesi veya presence heartbeat'leri asla PostgreSQL'e `UPDATE` sorgusu olarak atılmayacak; Redis üzerinden işletilecektir.
3. **Dil Standardı:** Arayüzdeki butonlar, başlıklar, hata mesajları, modal metinleri ve bildirimler eksiksiz Türkçe olacaktır.
4. **Zaman Damgaları:** Veritabanına tüm zaman damgaları UTC (`TIMESTAMP WITH TIME ZONE`) olarak yazılacak, arayüzde kullanıcının tarayıcı saatine göre biçimlendirilecektir.
5. **WhatsApp Deneyimi:** Her mesajın `sent_at`, `delivered_at` ve `read_at` zamanlarının doğruluğu titizlikle korunacak, "Mesaj Bilgisi" modalında gösterilecektir.
