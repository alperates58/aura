-- 012: İleri Düzey Güvenlik Özellikleri (Panik Şifresi, Token Versiyonu, Coğrafi Konum Koordinatları, Güvenlik Kodu)

-- 1. Kullanıcılar tablosuna Panik Giriş Maili/Adı, Panik Şifresi, Yönlendirme URL'i, Token Versiyonu ve Güvenlik Salt'ı
ALTER TABLE users ADD COLUMN IF NOT EXISTS panic_login VARCHAR(255) DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS panic_password_hash VARCHAR(255) DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS panic_redirect_url TEXT DEFAULT 'https://www.google.com';
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_number_salt VARCHAR(64) DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_panic_login ON users(LOWER(panic_login)) WHERE panic_login <> '';

-- 2. Erişim kayıtlarına coğrafi hız (Geo-Velocity) ve İmkansız Seyahat tespiti için koordinat sütunları
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION DEFAULT 0;
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION DEFAULT 0;
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT '';
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT '';

-- 3. Konuşmalar tablosuna güvenlik kodu versiyonu ve teyit takipçisi
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS safety_number_version INT DEFAULT 1;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS safety_number_acknowledged_by UUID[] DEFAULT '{}';
