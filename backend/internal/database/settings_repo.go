package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"

	"aura/internal/models"
)

type SettingsRepository struct {
	db        *sql.DB
	cacheMu   sync.RWMutex
	cacheMap  map[string]json.RawMessage
	hasCached bool
}

func NewSettingsRepository(db *sql.DB) *SettingsRepository {
	return &SettingsRepository{
		db:       db,
		cacheMap: make(map[string]json.RawMessage),
	}
}

func (r *SettingsRepository) GetAllSettings(ctx context.Context) (map[string]json.RawMessage, error) {
	r.cacheMu.RLock()
	if r.hasCached && len(r.cacheMap) > 0 {
		copied := make(map[string]json.RawMessage, len(r.cacheMap))
		for k, v := range r.cacheMap {
			copied[k] = v
		}
		r.cacheMu.RUnlock()
		return copied, nil
	}
	r.cacheMu.RUnlock()

	rows, err := r.db.QueryContext(ctx, "SELECT key, value FROM system_settings")
	if err != nil {
		return nil, fmt.Errorf("ayarlar alinamadi: %w", err)
	}
	defer rows.Close()

	settings := make(map[string]json.RawMessage)
	for rows.Next() {
		var key string
		var val json.RawMessage
		if err := rows.Scan(&key, &val); err != nil {
			return nil, err
		}
		settings[key] = val
	}

	r.cacheMu.Lock()
	r.cacheMap = settings
	r.hasCached = true
	r.cacheMu.Unlock()

	return settings, nil
}

func (r *SettingsRepository) GetSetting(ctx context.Context, key string) (json.RawMessage, error) {
	r.cacheMu.RLock()
	if r.hasCached {
		if val, ok := r.cacheMap[key]; ok {
			r.cacheMu.RUnlock()
			return val, nil
		}
	}
	r.cacheMu.RUnlock()

	var val json.RawMessage
	err := r.db.QueryRowContext(ctx, "SELECT value FROM system_settings WHERE key = $1", key).Scan(&val)
	if err != nil {
		return nil, err
	}

	r.cacheMu.Lock()
	r.cacheMap[key] = val
	r.cacheMu.Unlock()

	return val, nil
}

func (r *SettingsRepository) UpdateSetting(ctx context.Context, key string, value json.RawMessage) error {
	query := `
		INSERT INTO system_settings (key, value, updated_at)
		VALUES ($1, $2::jsonb, NOW())
		ON CONFLICT (key) DO UPDATE
		SET value = EXCLUDED.value, updated_at = NOW()
	`
	_, err := r.db.ExecContext(ctx, query, key, string(value))
	if err != nil {
		return err
	}

	// Cache'i anında geçersiz kıl ve güncelle
	r.cacheMu.Lock()
	r.cacheMap[key] = value
	r.cacheMu.Unlock()

	return nil
}

// InvalidateCache tüm ayar önbelleğini sıfırlar
func (r *SettingsRepository) InvalidateCache() {
	r.cacheMu.Lock()
	r.hasCached = false
	r.cacheMap = make(map[string]json.RawMessage)
	r.cacheMu.Unlock()
}

func (r *SettingsRepository) GetSiteInfo(ctx context.Context) models.SiteInfoSettings {
	defaults := models.SiteInfoSettings{
		SiteName:          "Aura",
		SiteTagline:       "",
		SiteURL:           "",
		LogoURL:           "",
		AllowRegistration: false, // Guvenlik kurali: Ayar DB'den kesinlesene kadar kapali (Fail-Closed)
		DefaultTheme:      "dark",
		MaintenanceMode:   false,
	}

	raw, err := r.GetSetting(ctx, "site_info")
	if err != nil || len(raw) == 0 {
		return defaults
	}

	res := defaults
	if err := json.Unmarshal(raw, &res); err != nil {
		return defaults
	}
	return res
}

func (r *SettingsRepository) GetMediaLimits(ctx context.Context) models.MediaLimitsSettings {
	defaults := models.MediaLimitsSettings{
		MaxFileSizeMB:     50,
		AllowedExtensions: []string{".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".mov", ".pdf", ".zip", ".docx", ".txt"},
		MaxVoiceSeconds:   300,
		EnableCompression: true,
	}

	raw, err := r.GetSetting(ctx, "media_limits")
	if err != nil || len(raw) == 0 {
		return defaults
	}

	res := defaults
	if err := json.Unmarshal(raw, &res); err != nil {
		return defaults
	}
	if res.MaxFileSizeMB <= 0 {
		res.MaxFileSizeMB = 50
	}
	if res.MaxVoiceSeconds <= 0 {
		res.MaxVoiceSeconds = 300
	}
	return res
}

func (r *SettingsRepository) GetChatSettings(ctx context.Context) models.ChatSettings {
	defaults := models.ChatSettings{
		AllowMessageEdit:            true,
		EditTimeLimitMinutes:        15,
		AllowDeleteForAll:           true,
		DeleteTimeLimitMinutes:      60,
		DisappearingMessagesDefault: 0,
		EnableLinkPreviews:          true,
		EnableSocialEmbeds:          true,
	}

	raw, err := r.GetSetting(ctx, "chat_settings")
	if err != nil || len(raw) == 0 {
		return defaults
	}

	res := defaults
	if err := json.Unmarshal(raw, &res); err != nil {
		return defaults
	}
	if res.EditTimeLimitMinutes <= 0 {
		res.EditTimeLimitMinutes = 15
	}
	return res
}

func (r *SettingsRepository) GetCallSettings(ctx context.Context) models.CallSettings {
	defaults := models.CallSettings{
		EnableAudioCalls:       true,
		EnableVideoCalls:       true,
		EnableScreenShare:      true,
		MaxCallDurationMinutes: 120,
	}

	raw, err := r.GetSetting(ctx, "call_settings")
	if err != nil || len(raw) == 0 {
		return defaults
	}

	res := defaults
	if err := json.Unmarshal(raw, &res); err != nil {
		return defaults
	}
	return res
}

func (r *SettingsRepository) GetSecuritySettings(ctx context.Context) models.SecuritySettings {
	defaults := models.SecuritySettings{
		MaxMessagesPerSecond:      5,
		MaxMessagesPerMinute:      60,
		RequireStrongPasswords:    true, // Guvenlik Kurali: Ayar okunamadigi durumlarda guclu sifre zorunlulugu varsayilan olarak aktiftir (Fail-Closed)
		LockoutAttempts:           5,
		SessionTimeoutDays:        30,
		InactivityLogoutEnabled:   false,
		InactivityTimeoutMinutes:  15,
		InactivityRedirectURL:     "https://www.google.com",
		InactivityScheduleEnabled: false,
		InactivityWeekdayStart:    "17:30",
		InactivityWeekdayEnd:      "08:30",
		InactivityWeekendFull:     true,
	}

	raw, err := r.GetSetting(ctx, "security_settings")
	if err != nil || len(raw) == 0 {
		return defaults
	}

	res := defaults
	if err := json.Unmarshal(raw, &res); err != nil {
		return defaults
	}
	if res.InactivityTimeoutMinutes <= 0 {
		res.InactivityTimeoutMinutes = 15
	}
	if res.InactivityRedirectURL == "" {
		res.InactivityRedirectURL = "https://www.google.com"
	}
	if res.InactivityWeekdayStart == "" {
		res.InactivityWeekdayStart = "17:30"
	}
	if res.InactivityWeekdayEnd == "" {
		res.InactivityWeekdayEnd = "08:30"
	}
	return res
}

func (r *SettingsRepository) GetThemeSettings(ctx context.Context) models.ThemeSettings {
	defaults := models.ThemeSettings{
		PrimaryColor:   "#6366F1",
		CardBg:         "#11141E",
		NavBg:          "#0B0D14",
		MainBg:         "#090A0F",
		BorderColor:    "#1E2333",
		OutgoingBubble: "#4F46E5",
		OutgoingText:   "#FFFFFF",
		IncomingBubble: "#181C28",
		FontFamily:     "Inter",
		BorderRadius:   "rounded-2xl",
	}

	raw, err := r.GetSetting(ctx, "theme_settings")
	if err != nil || len(raw) == 0 {
		return defaults
	}

	res := defaults
	if err := json.Unmarshal(raw, &res); err != nil {
		return defaults
	}
	return res
}

func (r *SettingsRepository) GetNotificationSettings(ctx context.Context) models.NotificationSettings {
	defaults := models.NotificationSettings{
		EnableWebPush:     true,
		EnableSoundAlerts: true,
		VapidPublicKey:    "",
	}

	raw, err := r.GetSetting(ctx, "notification_settings")
	if err != nil || len(raw) == 0 {
		return defaults
	}

	res := defaults
	if err := json.Unmarshal(raw, &res); err != nil {
		return defaults
	}
	return res
}

func (r *SettingsRepository) GetPublicSettings(ctx context.Context) models.PublicSettingsResponse {
	return models.PublicSettingsResponse{
		SiteInfo:         r.GetSiteInfo(ctx),
		ThemeSettings:    r.GetThemeSettings(ctx),
		MediaLimits:      r.GetMediaLimits(ctx),
		ChatSettings:     r.GetChatSettings(ctx),
		CallSettings:     r.GetCallSettings(ctx),
		SecuritySettings: r.GetSecuritySettings(ctx),
	}
}
