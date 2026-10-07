package database

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"aura/internal/models"
	"github.com/google/uuid"
)

type SessionRepository struct {
	db *sql.DB
}

func NewSessionRepository(db *sql.DB) *SessionRepository {
	return &SessionRepository{db: db}
}

// ParseUserAgentDetailed User-Agent dizesinden cihaz tipi, işletim sistemi, tarayıcı ve isim çıkarır
func ParseUserAgentDetailed(ua string) (deviceName string, deviceType string, os string, browser string) {
	lower := strings.ToLower(ua)

	// 1. Cihaz Tipi & OS
	deviceType = "desktop"
	os = "Bilinmeyen Sistem"

	if strings.Contains(lower, "ipad") || (strings.Contains(lower, "macintosh") && strings.Contains(lower, "touch")) {
		deviceType = "tablet"
		os = "iPadOS"
		deviceName = "Apple iPad"
	} else if strings.Contains(lower, "iphone") {
		deviceType = "mobile"
		os = "iOS"
		deviceName = "Apple iPhone"
	} else if strings.Contains(lower, "android") {
		if strings.Contains(lower, "mobile") {
			deviceType = "mobile"
			deviceName = "Android Cihaz"
		} else {
			deviceType = "tablet"
			deviceName = "Android Tablet"
		}
		os = "Android"
	} else if strings.Contains(lower, "windows nt 10.0") || strings.Contains(lower, "windows") {
		deviceType = "desktop"
		os = "Windows"
		deviceName = "Windows Bilgisayar"
	} else if strings.Contains(lower, "macintosh") || strings.Contains(lower, "mac os") {
		deviceType = "desktop"
		os = "macOS"
		deviceName = "Apple Mac"
	} else if strings.Contains(lower, "linux") {
		deviceType = "desktop"
		os = "Linux"
		deviceName = "Linux Bilgisayar"
	}

	// 2. Tarayıcı Tespiti
	browser = "Web Tarayıcı"
	if strings.Contains(lower, "edg/") || strings.Contains(lower, "edge/") {
		browser = "Microsoft Edge"
	} else if strings.Contains(lower, "opr/") || strings.Contains(lower, "opera") {
		browser = "Opera"
	} else if strings.Contains(lower, "chrome/") && !strings.Contains(lower, "edg/") && !strings.Contains(lower, "opr/") {
		browser = "Google Chrome"
	} else if strings.Contains(lower, "safari/") && !strings.Contains(lower, "chrome/") {
		browser = "Safari"
	} else if strings.Contains(lower, "firefox/") {
		browser = "Mozilla Firefox"
	}

	if deviceName == "" {
		deviceName = fmt.Sprintf("%s (%s)", os, browser)
	}

	return deviceName, deviceType, os, browser
}

// UpsertSession kullanıcının oturum kaydını ekler veya günceller
func (r *SessionRepository) UpsertSession(ctx context.Context, s *models.UserSession) error {
	if s.SessionID == "" {
		s.SessionID = uuid.New().String()
	}

	// 1. Aynı kullanıcının aynı IP, cihaz tipi ve tarayıcısına ait 15 dakikadan eski ve farklı oturum kimlikli kopyalarını temizle
	// (örneğin Safari yeniden açıldığında yeni session_id üretip eski oturumu kopyalamasın)
	cleanStaleQuery := `
		DELETE FROM user_sessions
		WHERE user_id = $1 
		  AND device_name = $2 
		  AND os = $3 
		  AND browser = $4 
		  AND session_id <> $5 
		  AND last_active_at < NOW() - INTERVAL '15 minutes'
	`
	_, _ = r.db.ExecContext(ctx, cleanStaleQuery, s.UserID, s.DeviceName, s.OS, s.Browser, s.SessionID)

	query := `
		INSERT INTO user_sessions (
			user_id, session_id, device_name, device_type, os, browser,
			ip_address, location, user_agent, last_active_at, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
		ON CONFLICT (user_id, session_id)
		DO UPDATE SET
			device_name = EXCLUDED.device_name,
			device_type = EXCLUDED.device_type,
			os = EXCLUDED.os,
			browser = EXCLUDED.browser,
			ip_address = EXCLUDED.ip_address,
			location = EXCLUDED.location,
			user_agent = EXCLUDED.user_agent,
			last_active_at = NOW();
	`

	_, err := r.db.ExecContext(
		ctx, query,
		s.UserID, s.SessionID, s.DeviceName, s.DeviceType, s.OS, s.Browser,
		s.IPAddress, s.Location, s.UserAgent,
	)
	return err
}

// TouchSession oturumun son aktiflik saatini ve varsa IP'sini günceller
func (r *SessionRepository) TouchSession(ctx context.Context, userID uuid.UUID, sessionID string, ipAddress, location string) error {
	if sessionID == "" {
		return nil
	}

	query := `
		UPDATE user_sessions
		SET last_active_at = NOW(),
		    ip_address = CASE WHEN $3 <> '' THEN $3 ELSE ip_address END,
		    location = CASE WHEN $4 <> '' THEN $4 ELSE location END
		WHERE user_id = $1 AND session_id = $2
	`
	_, err := r.db.ExecContext(ctx, query, userID, sessionID, ipAddress, location)
	return err
}

// GetUserSessions kullanıcının tüm aktif oturumlarını listeler (Mevcut oturum en başta döner)
func (r *SessionRepository) GetUserSessions(ctx context.Context, userID uuid.UUID, currentSessionID string) ([]models.UserSession, error) {
	query := `
		SELECT id, user_id, session_id, device_name, device_type, os, browser,
		       ip_address, location, COALESCE(user_agent, ''), last_active_at, created_at
		FROM user_sessions
		WHERE user_id = $1
		ORDER BY 
			CASE WHEN session_id = $2 THEN 0 ELSE 1 END,
			last_active_at DESC
	`

	rows, err := r.db.QueryContext(ctx, query, userID, currentSessionID)
	if err != nil {
		return nil, fmt.Errorf("oturumlar sorgulanamadi: %w", err)
	}
	defer rows.Close()

	var sessions []models.UserSession
	for rows.Next() {
		var s models.UserSession
		if err := rows.Scan(
			&s.ID, &s.UserID, &s.SessionID, &s.DeviceName, &s.DeviceType, &s.OS, &s.Browser,
			&s.IPAddress, &s.Location, &s.UserAgent, &s.LastActiveAt, &s.CreatedAt,
		); err != nil {
			return nil, err
		}
		s.IsCurrent = (currentSessionID != "" && s.SessionID == currentSessionID)
		sessions = append(sessions, s)
	}

	if sessions == nil {
		sessions = []models.UserSession{}
	}
	return sessions, nil
}

// DeleteSession belirli bir oturumu veritabanından siler
func (r *SessionRepository) DeleteSession(ctx context.Context, userID uuid.UUID, sessionID string) error {
	query := `DELETE FROM user_sessions WHERE user_id = $1 AND (session_id = $2 OR id::text = $2)`
	_, err := r.db.ExecContext(ctx, query, userID, sessionID)
	return err
}

// DeleteOtherSessions mevcut oturum haricindeki tüm oturumları siler
func (r *SessionRepository) DeleteOtherSessions(ctx context.Context, userID uuid.UUID, currentSessionID string) error {
	var err error
	if currentSessionID != "" {
		query := `DELETE FROM user_sessions WHERE user_id = $1 AND session_id <> $2`
		_, err = r.db.ExecContext(ctx, query, userID, currentSessionID)
	} else {
		query := `DELETE FROM user_sessions WHERE user_id = $1`
		_, err = r.db.ExecContext(ctx, query, userID)
	}
	return err
}

// DeleteAllSessions kullanıcının tüm oturumlarını siler
func (r *SessionRepository) DeleteAllSessions(ctx context.Context, userID uuid.UUID) error {
	query := `DELETE FROM user_sessions WHERE user_id = $1`
	_, err := r.db.ExecContext(ctx, query, userID)
	return err
}

// InactiveSessionCandidate inaktivite kontrolü için taranan oturum ve kullanıcı bilgisi
type InactiveSessionCandidate struct {
	SessionID    string
	UserID       uuid.UUID
	Username     string
	DeviceName   string
	DeviceType   string
	OS           string
	Browser      string
	IPAddress    string
	Location     string
	UserAgent    string
	LastActiveAt time.Time
}

// GetInactiveSessionCandidates belirtilen süreden daha uzun süredir inaktif olan oturumları getirir
func (r *SessionRepository) GetInactiveSessionCandidates(ctx context.Context, timeoutMinutes int) ([]InactiveSessionCandidate, error) {
	if timeoutMinutes <= 0 {
		timeoutMinutes = 15
	}
	query := `
		SELECT s.session_id, s.user_id, u.username, s.device_name, s.device_type, s.os, s.browser,
		       s.ip_address, s.location, COALESCE(s.user_agent, ''), s.last_active_at
		FROM user_sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.last_active_at < NOW() - ($1 * INTERVAL '1 minute')
		ORDER BY s.last_active_at ASC
		LIMIT 50
	`
	rows, err := r.db.QueryContext(ctx, query, timeoutMinutes)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []InactiveSessionCandidate
	for rows.Next() {
		var c InactiveSessionCandidate
		if err := rows.Scan(
			&c.SessionID, &c.UserID, &c.Username, &c.DeviceName, &c.DeviceType, &c.OS, &c.Browser,
			&c.IPAddress, &c.Location, &c.UserAgent, &c.LastActiveAt,
		); err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, nil
}

// TouchSessionActivity oturumun son aktiflik saatini günceller
func (r *SessionRepository) TouchSessionActivity(ctx context.Context, userID uuid.UUID, sessionID string) error {
	if sessionID == "" {
		return nil
	}
	query := `UPDATE user_sessions SET last_active_at = NOW() WHERE user_id = $1 AND session_id = $2`
	_, err := r.db.ExecContext(ctx, query, userID, sessionID)
	return err
}

// TouchUserAllSessionsActivity kullanıcının tüm oturumlarının son aktiflik saatini günceller (ör. socket disconnect anında)
func (r *SessionRepository) TouchUserAllSessionsActivity(ctx context.Context, userID uuid.UUID) error {
	query := `UPDATE user_sessions SET last_active_at = NOW() WHERE user_id = $1`
	_, err := r.db.ExecContext(ctx, query, userID)
	return err
}

