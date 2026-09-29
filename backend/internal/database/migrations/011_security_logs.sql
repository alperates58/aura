-- 011: Aura Güvenlik Günlükleri ve Otomatik Güvenlik Botu (security_logs)
CREATE TABLE IF NOT EXISTS security_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL, -- 'unknown_user_attempt', 'failed_password_attempt'
    attempted_login VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT DEFAULT '',
    device_info VARCHAR(150) DEFAULT '',
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_logs_created ON security_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_logs_event ON security_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_logs_ip ON security_logs(ip_address);

-- Sistem Güvenlik Botu Hesabı ('security' / 'Aura Güvenlik')
INSERT INTO users (
    id, username, display_name, email, password_hash, avatar_url, bio, role, online_status
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'security',
    'Aura Güvenlik',
    'security@aura.system',
    '$2a$10$7vQ5q3N5f2R7hJ8mK1l4OeL3.eM84D9cO1c9BvY2wWzWqgD4qPZ8Ky',
    'https://api.dicebear.com/7.x/bottts/svg?seed=AuraSecurityShield&backgroundColor=1e1b4b',
    'Aura Otomatik Sistem Güvenliği ve Tehdit Algılama Kalkanı',
    'admin',
    1
) ON CONFLICT (username) DO UPDATE SET
    display_name = 'Aura Güvenlik',
    avatar_url = 'https://api.dicebear.com/7.x/bottts/svg?seed=AuraSecurityShield&backgroundColor=1e1b4b',
    role = 'admin';
