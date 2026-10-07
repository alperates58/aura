package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"aura/internal/models"
	"github.com/google/uuid"
)

var SecurityBotID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

type SecurityRepository struct {
	db *sql.DB
}

func NewSecurityRepository(db *sql.DB) *SecurityRepository {
	return &SecurityRepository{db: db}
}

func (r *SecurityRepository) LogSecurityEvent(
	ctx context.Context,
	eventType string,
	attemptedLogin string,
	ipAddress string,
	userAgent string,
	deviceInfo string,
	details map[string]interface{},
) (*models.SecurityLog, error) {
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		detailsJSON = []byte("{}")
	}

	query := `
		INSERT INTO security_logs (event_type, attempted_login, ip_address, user_agent, device_info, details, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		RETURNING id, created_at
	`

	var logItem models.SecurityLog
	logItem.EventType = eventType
	logItem.AttemptedLogin = attemptedLogin
	logItem.IPAddress = ipAddress
	logItem.UserAgent = userAgent
	logItem.DeviceInfo = deviceInfo
	logItem.Details = detailsJSON

	err = r.db.QueryRowContext(
		ctx,
		query,
		eventType,
		attemptedLogin,
		ipAddress,
		userAgent,
		deviceInfo,
		detailsJSON,
	).Scan(&logItem.ID, &logItem.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("guvenlik olayi kaydedilemedi: %w", err)
	}

	return &logItem, nil
}

func (r *SecurityRepository) GetSecurityLogs(ctx context.Context, limit int) ([]models.SecurityLog, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	query := `
		SELECT id, event_type, attempted_login, ip_address, user_agent, device_info, details, created_at
		FROM security_logs
		ORDER BY created_at DESC
		LIMIT $1
	`

	rows, err := r.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("guvenlik kayitlari sorgulanamadi: %w", err)
	}
	defer rows.Close()

	var logs []models.SecurityLog
	for rows.Next() {
		var l models.SecurityLog
		var rawDetails []byte
		if err := rows.Scan(
			&l.ID,
			&l.EventType,
			&l.AttemptedLogin,
			&l.IPAddress,
			&l.UserAgent,
			&l.DeviceInfo,
			&rawDetails,
			&l.CreatedAt,
		); err != nil {
			return nil, err
		}
		l.Details = rawDetails
		l.AttemptedUsername = l.AttemptedLogin
		if l.EventType == "unknown_user_attempt" || l.EventType == "unknown_user_login" {
			l.Severity = "critical"
		} else {
			l.Severity = "high"
		}
		logs = append(logs, l)
	}

	if logs == nil {
		logs = []models.SecurityLog{}
	}
	return logs, nil
}

func (r *SecurityRepository) ClearSecurityLogs(ctx context.Context) error {
	query := `DELETE FROM security_logs`
	_, err := r.db.ExecContext(ctx, query)
	return err
}

func (r *SecurityRepository) GetSecurityStats(ctx context.Context) (*models.SecurityStats, error) {
	stats := &models.SecurityStats{}

	query := `
		SELECT 
			COUNT(*),
			COUNT(DISTINCT ip_address),
			COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END)
		FROM security_logs
	`
	err := r.db.QueryRowContext(ctx, query).Scan(&stats.TotalIncidents, &stats.UniqueIPs, &stats.Last24hCount)
	if err != nil {
		return stats, err
	}
	return stats, nil
}

// CanPublishSecurityStory her güvenlik olayının hikaye paylaşmasına izin verir; yalnızca milisaniyelik çift tıklama/network yarışlarını önlemek için en fazla 2 saniyelik mikro-tampon uygular.
func (r *SecurityRepository) CanPublishSecurityStory(ctx context.Context, cooldown time.Duration) bool {
	seconds := int(cooldown.Seconds())
	if seconds > 2 {
		seconds = 2 // Güvenlik hikayelerini engelleme, yalnızca çift tıklama yarışını önle
	}
	if seconds <= 0 {
		return true
	}
	query := `
		SELECT COUNT(*)
		FROM stories
		WHERE user_id = $1 AND created_at > NOW() - ($2 * INTERVAL '1 second')
	`
	var count int
	err := r.db.QueryRowContext(ctx, query, SecurityBotID, seconds).Scan(&count)
	if err != nil {
		return true
	}
	return count == 0
}

// EnsureSecurityBot Aura Güvenlik resmi bot hesabının veritabanında var olduğunu garanti eder.
func (r *SecurityRepository) EnsureSecurityBot(ctx context.Context) error {
	query := `
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
		) ON CONFLICT (id) DO UPDATE SET
			display_name = 'Aura Güvenlik',
			avatar_url = 'https://api.dicebear.com/7.x/bottts/svg?seed=AuraSecurityShield&backgroundColor=1e1b4b',
			role = 'admin'
	`
	_, err := r.db.ExecContext(ctx, query)
	return err
}
