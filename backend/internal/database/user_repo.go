package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"aura/internal/models"
	"github.com/google/uuid"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) CreateUser(ctx context.Context, u *models.User) error {
	query := `
		INSERT INTO users (username, display_name, email, password_hash, avatar_url, bio, online_status, privacy_settings, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
		RETURNING id, created_at, updated_at
	`
	if len(u.PrivacySettings) == 0 {
		defaultPrivacy, _ := json.Marshal(models.DefaultPrivacySettings())
		u.PrivacySettings = defaultPrivacy
	}

	err := r.db.QueryRowContext(ctx, query,
		strings.ToLower(strings.TrimSpace(u.Username)),
		strings.TrimSpace(u.DisplayName),
		strings.ToLower(strings.TrimSpace(u.Email)),
		u.PasswordHash,
		u.AvatarURL,
		u.Bio,
		u.OnlineStatus,
		u.PrivacySettings,
	).Scan(&u.ID, &u.CreatedAt, &u.UpdatedAt)

	if err != nil {
		return fmt.Errorf("kullanici olusturulamadi: %w", err)
	}
	return nil
}

func (r *UserRepository) GetUserByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	query := `
		SELECT id, username, display_name, email, password_hash, avatar_url, bio, role, is_banned, ban_reason, online_status, last_seen_at, privacy_settings,
		       COALESCE(panic_login, ''), COALESCE(panic_password_hash, ''), COALESCE(panic_redirect_url, 'https://www.google.com'), COALESCE(token_version, 1), COALESCE(security_number_salt, ''),
		       created_at, updated_at
		FROM users
		WHERE id = $1
	`
	var u models.User
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&u.ID, &u.Username, &u.DisplayName, &u.Email, &u.PasswordHash,
		&u.AvatarURL, &u.Bio, &u.Role, &u.IsBanned, &u.BanReason,
		&u.OnlineStatus, &u.LastSeenAt,
		&u.PrivacySettings,
		&u.PanicLogin, &u.PanicPasswordHash, &u.PanicRedirectURL, &u.TokenVersion, &u.SecurityNumberSalt,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("kullanici getirilemedi: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) GetUserByLogin(ctx context.Context, login string) (*models.User, error) {
	cleanLogin := strings.ToLower(strings.TrimSpace(login))
	query := `
		SELECT id, username, display_name, email, password_hash, avatar_url, bio, role, is_banned, ban_reason, online_status, last_seen_at, privacy_settings,
		       COALESCE(panic_login, ''), COALESCE(panic_password_hash, ''), COALESCE(panic_redirect_url, 'https://www.google.com'), COALESCE(token_version, 1), COALESCE(security_number_salt, ''),
		       created_at, updated_at
		FROM users
		WHERE LOWER(username) = $1 OR LOWER(email) = $1
		LIMIT 1
	`
	var u models.User
	err := r.db.QueryRowContext(ctx, query, cleanLogin).Scan(
		&u.ID, &u.Username, &u.DisplayName, &u.Email, &u.PasswordHash,
		&u.AvatarURL, &u.Bio, &u.Role, &u.IsBanned, &u.BanReason,
		&u.OnlineStatus, &u.LastSeenAt,
		&u.PrivacySettings,
		&u.PanicLogin, &u.PanicPasswordHash, &u.PanicRedirectURL, &u.TokenVersion, &u.SecurityNumberSalt,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("kullanici bulunamadi: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) GetUserByPanicLogin(ctx context.Context, panicLogin string) (*models.User, error) {
	cleanLogin := strings.ToLower(strings.TrimSpace(panicLogin))
	if cleanLogin == "" {
		return nil, nil
	}
	query := `
		SELECT id, username, display_name, email, password_hash, avatar_url, bio, role, is_banned, ban_reason, online_status, last_seen_at, privacy_settings,
		       COALESCE(panic_login, ''), COALESCE(panic_password_hash, ''), COALESCE(panic_redirect_url, 'https://www.google.com'), COALESCE(token_version, 1), COALESCE(security_number_salt, ''),
		       created_at, updated_at
		FROM users
		WHERE LOWER(panic_login) = $1
		LIMIT 1
	`
	var u models.User
	err := r.db.QueryRowContext(ctx, query, cleanLogin).Scan(
		&u.ID, &u.Username, &u.DisplayName, &u.Email, &u.PasswordHash,
		&u.AvatarURL, &u.Bio, &u.Role, &u.IsBanned, &u.BanReason,
		&u.OnlineStatus, &u.LastSeenAt,
		&u.PrivacySettings,
		&u.PanicLogin, &u.PanicPasswordHash, &u.PanicRedirectURL, &u.TokenVersion, &u.SecurityNumberSalt,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("panik kullanicisi aranamadi: %w", err)
	}
	return &u, nil
}

func (r *UserRepository) GetUserByUsername(ctx context.Context, username string) (*models.User, error) {
	return r.GetUserByLogin(ctx, username)
}

func (r *UserRepository) SetPanicPassword(ctx context.Context, userID uuid.UUID, panicLogin, hash, redirectURL string) error {
	if redirectURL == "" {
		redirectURL = "https://www.google.com"
	}
	query := `
		UPDATE users
		SET panic_login = $1, panic_password_hash = $2, panic_redirect_url = $3, updated_at = NOW()
		WHERE id = $4
	`
	_, err := r.db.ExecContext(ctx, query, strings.TrimSpace(panicLogin), hash, redirectURL, userID)
	return err
}

func (r *UserRepository) IncrementTokenVersion(ctx context.Context, userID uuid.UUID) (int, error) {
	query := `
		UPDATE users
		SET token_version = COALESCE(token_version, 1) + 1, updated_at = NOW()
		WHERE id = $1
		RETURNING token_version
	`
	var version int
	err := r.db.QueryRowContext(ctx, query, userID).Scan(&version)
	return version, err
}

func (r *UserRepository) UpdateSecuritySalt(ctx context.Context, userID uuid.UUID, salt string) error {
	query := `
		UPDATE users
		SET security_number_salt = $1, updated_at = NOW()
		WHERE id = $2
	`
	_, err := r.db.ExecContext(ctx, query, salt, userID)
	return err
}

func (r *UserRepository) CheckUserExists(ctx context.Context, username, email string) (bool, string, error) {
	var existingUsername, existingEmail string

	cleanUsername := strings.ToLower(strings.TrimSpace(username))
	cleanEmail := strings.ToLower(strings.TrimSpace(email))

	query := `
		SELECT username, email FROM users
		WHERE LOWER(username) = $1 OR LOWER(email) = $2
		LIMIT 1
	`
	err := r.db.QueryRowContext(ctx, query, cleanUsername, cleanEmail).Scan(&existingUsername, &existingEmail)
	if errors.Is(err, sql.ErrNoRows) {
		return false, "", nil
	}
	if err != nil {
		return false, "", err
	}

	if strings.EqualFold(existingUsername, cleanUsername) {
		return true, "Bu kullanıcı adı zaten kullanımda.", nil
	}
	return true, "Bu e-posta adresi zaten kayıtlı.", nil
}

func (r *UserRepository) UpdateProfile(ctx context.Context, userID uuid.UUID, displayName, bio string) error {
	query := `
		UPDATE users
		SET display_name = $1, bio = $2, updated_at = NOW()
		WHERE id = $3
	`
	_, err := r.db.ExecContext(ctx, query, strings.TrimSpace(displayName), strings.TrimSpace(bio), userID)
	return err
}

func (r *UserRepository) UpdateAvatar(ctx context.Context, userID uuid.UUID, avatarURL string) error {
	query := `
		UPDATE users
		SET avatar_url = $1, updated_at = NOW()
		WHERE id = $2
	`
	_, err := r.db.ExecContext(ctx, query, avatarURL, userID)
	return err
}

func (r *UserRepository) UpdatePrivacy(ctx context.Context, userID uuid.UUID, settings models.PrivacySettings) error {
	data, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	query := `
		UPDATE users
		SET privacy_settings = $1::jsonb, updated_at = NOW()
		WHERE id = $2
	`
	_, err = r.db.ExecContext(ctx, query, string(data), userID)
	return err
}

func (r *UserRepository) UpdateOnlineStatus(ctx context.Context, userID uuid.UUID, status int) error {
	query := `
		UPDATE users
		SET online_status = $1, last_seen_at = NOW(), updated_at = NOW()
		WHERE id = $2
	`
	_, err := r.db.ExecContext(ctx, query, status, userID)
	return err
}

func (r *UserRepository) SearchUsers(ctx context.Context, search string, excludeUserID uuid.UUID, limit int) ([]models.UserResponse, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	cleanSearch := "%" + strings.ToLower(strings.TrimSpace(search)) + "%"
	// Guvenlik ve Gizlilik:
	// 1. Yasaklanmis (is_banned) hesaplar normal arama sonuclarinda listelenmez.
	// 2. Kullanicilarin ozel e-posta, rol veya ban detaylari asla baska kullanicilara sizdirilmaz.
	query := `
		SELECT id, username, display_name, avatar_url, bio, online_status, last_seen_at, created_at
		FROM users
		WHERE id != $1 AND is_banned = FALSE AND (LOWER(username) LIKE $2 OR LOWER(display_name) LIKE $2)
		ORDER BY display_name ASC
		LIMIT $3
	`

	rows, err := r.db.QueryContext(ctx, query, excludeUserID, cleanSearch, limit)
	if err != nil {
		return nil, fmt.Errorf("kullanici aranamadi: %w", err)
	}
	defer rows.Close()

	var results []models.UserResponse
	for rows.Next() {
		var u models.UserResponse
		if err := rows.Scan(
			&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Bio,
			&u.OnlineStatus, &u.LastSeenAt, &u.CreatedAt,
		); err != nil {
			return nil, err
		}
		results = append(results, u)
	}

	if results == nil {
		results = []models.UserResponse{}
	}
	return results, nil
}

func (r *UserRepository) GetAllUsers(ctx context.Context, search, roleFilter string, isBannedFilter *bool, limit, offset int) ([]models.UserResponse, int, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	whereClauses := []string{"1=1"}
	args := []interface{}{}
	argIdx := 1

	if strings.TrimSpace(search) != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("(LOWER(username) LIKE $%d OR LOWER(display_name) LIKE $%d OR LOWER(email) LIKE $%d)", argIdx, argIdx, argIdx))
		args = append(args, "%"+strings.ToLower(strings.TrimSpace(search))+"%")
		argIdx++
	}

	if strings.TrimSpace(roleFilter) != "" && roleFilter != "all" {
		whereClauses = append(whereClauses, fmt.Sprintf("role = $%d", argIdx))
		args = append(args, strings.TrimSpace(roleFilter))
		argIdx++
	}

	if isBannedFilter != nil {
		whereClauses = append(whereClauses, fmt.Sprintf("is_banned = $%d", argIdx))
		args = append(args, *isBannedFilter)
		argIdx++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	// Count total
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM users WHERE %s", whereSQL)
	var total int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Fetch page
	query := fmt.Sprintf(`
		SELECT id, username, display_name, email, avatar_url, bio, role, is_banned, ban_reason, online_status, last_seen_at, privacy_settings, created_at
		FROM users
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var users []models.UserResponse
	for rows.Next() {
		var u models.UserResponse
		if err := rows.Scan(
			&u.ID, &u.Username, &u.DisplayName, &u.Email, &u.AvatarURL, &u.Bio,
			&u.Role, &u.IsBanned, &u.BanReason,
			&u.OnlineStatus, &u.LastSeenAt, &u.PrivacySettings, &u.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		users = append(users, u)
	}

	if users == nil {
		users = []models.UserResponse{}
	}
	return users, total, nil
}

func (r *UserRepository) UpdateUserAdmin(
	ctx context.Context,
	userID uuid.UUID,
	displayName, username, email, passwordHash, role string,
	isBanned bool,
	banReason string,
) error {
	query := `
		UPDATE users
		SET 
			display_name = CASE WHEN $1 <> '' THEN $1 ELSE display_name END,
			username = CASE WHEN $2 <> '' THEN $2 ELSE username END,
			email = CASE WHEN $3 <> '' THEN $3 ELSE email END,
			password_hash = CASE WHEN $4 <> '' THEN $4 ELSE password_hash END,
			role = CASE WHEN $5 <> '' THEN $5 ELSE role END,
			is_banned = $6,
			ban_reason = $7,
			updated_at = NOW()
		WHERE id = $8
	`
	_, err := r.db.ExecContext(ctx, query, displayName, username, email, passwordHash, role, isBanned, banReason, userID)
	return err
}

func (r *UserRepository) DeleteUser(ctx context.Context, userID uuid.UUID) error {
	query := `DELETE FROM users WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, userID)
	return err
}

func (r *UserRepository) GetSystemStats(ctx context.Context) (map[string]interface{}, error) {
	stats := make(map[string]interface{})

	var totalUsers, onlineUsers, bannedUsers int
	_ = r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&totalUsers)
	_ = r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE online_status = 1").Scan(&onlineUsers)
	_ = r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE is_banned = true").Scan(&bannedUsers)

	var totalMessages, totalMedia int
	_ = r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM messages").Scan(&totalMessages)
	_ = r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM messages WHERE message_type != 'text'").Scan(&totalMedia)

	var totalCalls, totalCallSeconds int
	_ = r.db.QueryRowContext(ctx, "SELECT COUNT(*), COALESCE(SUM(duration_seconds), 0) FROM call_logs").Scan(&totalCalls, &totalCallSeconds)

	stats["total_users"] = totalUsers
	stats["online_users"] = onlineUsers
	stats["banned_users"] = bannedUsers
	stats["total_messages"] = totalMessages
	stats["total_media"] = totalMedia
	stats["total_calls"] = totalCalls
	stats["total_call_seconds"] = totalCallSeconds

	return stats, nil
}

func (r *UserRepository) Ping(ctx context.Context) error {
	return r.db.PingContext(ctx)
}
