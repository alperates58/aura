-- AURA - PostgreSQL 16 Başlangıç Şeması (001_init_schema.sql)
-- ====================================================================

-- UUID fonksiyonları için pgcrypto eklentisi
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. KULLANICILAR TABLOSU (users)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url TEXT DEFAULT '',
    bio VARCHAR(255) DEFAULT '',
    online_status INT DEFAULT 0, -- 0: Offline, 1: Online, 2: Idle/Away
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    privacy_settings JSONB DEFAULT '{"read_receipts": true, "last_seen": true, "allow_calls": true}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. BİREBİR KONUŞMALAR TABLOSU (conversations)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_one_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_two_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_one_cleared_at TIMESTAMP WITH TIME ZONE DEFAULT '1970-01-01 00:00:00+00',
    user_two_cleared_at TIMESTAMP WITH TIME ZONE DEFAULT '1970-01-01 00:00:00+00',
    is_blocked BOOLEAN DEFAULT FALSE,
    blocked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_conversation_users UNIQUE(user_one_id, user_two_id),
    CONSTRAINT chk_different_users CHECK (user_one_id <> user_two_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_one ON conversations(user_one_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_two ON conversations(user_two_id);

-- 3. MESAJLAR TABLOSU (messages) - WHATSAPP TİPİ 3 AŞAMALI ZAMAN VE DURUM TAKİBİ
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text', -- 'text', 'voice', 'image', 'video', 'file', 'call_log'
    content TEXT DEFAULT '',
    media_url TEXT DEFAULT '',
    media_metadata JSONB DEFAULT '{}'::jsonb, -- {file_name, file_size, duration, waveform: [], mime_type}
    
    -- WhatsApp mikro durum zaman damgaları:
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- Tek Gri Tik
    delivered_at TIMESTAMP WITH TIME ZONE,          -- Çift Gri Tik
    read_at TIMESTAMP WITH TIME ZONE,               -- Çift Mavi Tik
    
    is_edited BOOLEAN DEFAULT FALSE,
    is_starred BOOLEAN DEFAULT FALSE,
    is_deleted_for_all BOOLEAN DEFAULT FALSE,
    deleted_for_users UUID[] DEFAULT '{}',          -- Benden sil diyen kullanıcılar
    reactions JSONB DEFAULT '{}'::jsonb,            -- {"👍": ["user_uuid"], "❤️": ["user_uuid"]}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread ON messages(recipient_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_recipient_undelivered ON messages(recipient_id, delivered_at) WHERE delivered_at IS NULL;

-- 4. SESLİ VE GÖRÜNTÜLÜ ARAMA KAYITLARI (call_logs)
CREATE TABLE IF NOT EXISTS call_logs (
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

CREATE INDEX IF NOT EXISTS idx_call_logs_conversation ON call_logs(conversation_id, created_at DESC);
