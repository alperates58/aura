-- 013: Aktif Cihazlar ve Oturumlar Tablosu (user_sessions)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(64) NOT NULL,
    device_name VARCHAR(100) NOT NULL DEFAULT 'Bilinmeyen Cihaz',
    device_type VARCHAR(20) NOT NULL DEFAULT 'desktop', -- 'desktop', 'mobile', 'tablet'
    os VARCHAR(50) NOT NULL DEFAULT '',
    browser VARCHAR(50) NOT NULL DEFAULT '',
    ip_address VARCHAR(45) NOT NULL DEFAULT '',
    location VARCHAR(100) NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_user_session UNIQUE(user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, last_active_at DESC);
