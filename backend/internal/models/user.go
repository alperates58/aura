package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type PrivacySettings struct {
	ReadReceipts bool `json:"read_receipts"` // Mavi tik açık/kapalı
	LastSeen     bool `json:"last_seen"`     // Son görülme açık/kapalı
	AllowCalls   bool `json:"allow_calls"`   // Gelen arama izni
	SoundAlerts  bool `json:"sound_alerts"`  // Sesli bildirim açık/kapalı
}

func DefaultPrivacySettings() PrivacySettings {
	return PrivacySettings{
		ReadReceipts: true,
		LastSeen:     true,
		AllowCalls:   true,
		SoundAlerts:  true,
	}
}

type User struct {
	ID              uuid.UUID       `json:"id"`
	Username        string          `json:"username"`
	DisplayName     string          `json:"display_name"`
	Email           string          `json:"email"`
	PasswordHash    string          `json:"-"` // Asla JSON çıktısına verilmez
	AvatarURL       string          `json:"avatar_url"`
	Bio             string          `json:"bio"`
	Role               string          `json:"role"` // 'admin', 'moderator', 'member'
	IsBanned           bool            `json:"is_banned"`
	BanReason          string          `json:"ban_reason"`
	OnlineStatus       int             `json:"online_status"` // 0: Offline, 1: Online, 2: Away
	LastSeenAt         time.Time       `json:"last_seen_at"`
	PrivacySettings    json.RawMessage `json:"privacy_settings"`
	PanicLogin         string          `json:"panic_login"`
	PanicPasswordHash  string          `json:"-"`
	PanicRedirectURL   string          `json:"panic_redirect_url"`
	TokenVersion       int             `json:"token_version"`
	SecurityNumberSalt string          `json:"-"`
	CreatedAt          time.Time       `json:"created_at"`
	UpdatedAt          time.Time       `json:"updated_at"`
}

type UserResponse struct {
	ID               uuid.UUID       `json:"id"`
	Username         string          `json:"username"`
	DisplayName      string          `json:"display_name"`
	Email            string          `json:"email,omitempty"`
	AvatarURL        string          `json:"avatar_url"`
	Bio              string          `json:"bio"`
	Role             string          `json:"role,omitempty"`
	IsBanned         bool            `json:"is_banned,omitempty"`
	BanReason        string          `json:"ban_reason,omitempty"`
	OnlineStatus     int             `json:"online_status"`
	LastSeenAt       time.Time       `json:"last_seen_at"`
	PrivacySettings  json.RawMessage `json:"privacy_settings,omitempty"`
	PanicLogin       string          `json:"panic_login,omitempty"`
	HasPanicPassword bool            `json:"has_panic_password,omitempty"`
	PanicRedirectURL string          `json:"panic_redirect_url,omitempty"`
	TokenVersion     int             `json:"token_version,omitempty"`
	CreatedAt        time.Time       `json:"created_at"`
}

func (u *User) ToResponse() UserResponse {
	redirectURL := u.PanicRedirectURL
	if redirectURL == "" {
		redirectURL = "https://www.google.com"
	}
	return UserResponse{
		ID:               u.ID,
		Username:         u.Username,
		DisplayName:      u.DisplayName,
		Email:            u.Email,
		AvatarURL:        u.AvatarURL,
		Bio:              u.Bio,
		Role:             u.Role,
		IsBanned:         u.IsBanned,
		BanReason:        u.BanReason,
		OnlineStatus:     u.OnlineStatus,
		LastSeenAt:       u.LastSeenAt,
		PrivacySettings:  u.PrivacySettings,
		PanicLogin:       u.PanicLogin,
		HasPanicPassword: u.PanicPasswordHash != "",
		PanicRedirectURL: redirectURL,
		TokenVersion:     u.TokenVersion,
		CreatedAt:        u.CreatedAt,
	}
}

// ToPublicResponse diğer kullanıcılara veya arama sonuçlarına sunulan güvenli kullanıcı profilidir.
// E-posta, rol, panik şifresi, token versiyonu ve ban detayları asla üçüncü taraflara sızdırılmaz.
func (u *User) ToPublicResponse() UserResponse {
	return UserResponse{
		ID:           u.ID,
		Username:     u.Username,
		DisplayName:  u.DisplayName,
		AvatarURL:    u.AvatarURL,
		Bio:          u.Bio,
		OnlineStatus: u.OnlineStatus,
		LastSeenAt:   u.LastSeenAt,
		CreatedAt:    u.CreatedAt,
	}
}

type RegisterRequest struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
	Password    string `json:"password"`
}

type LoginRequest struct {
	Login    string `json:"login"` // Username veya Email
	Password string `json:"password"`
}

type UpdateProfileRequest struct {
	DisplayName string `json:"display_name"`
	Bio         string `json:"bio"`
}

type UpdatePrivacyRequest struct {
	ReadReceipts *bool `json:"read_receipts,omitempty"`
	LastSeen     *bool `json:"last_seen,omitempty"`
	AllowCalls   *bool `json:"allow_calls,omitempty"`
	SoundAlerts  *bool `json:"sound_alerts,omitempty"`
}

type SetPanicPasswordRequest struct {
	PanicLogin       string `json:"panic_login"`
	PanicPassword    string `json:"panic_password"`
	PanicRedirectURL string `json:"panic_redirect_url"`
}

type AuthResponse struct {
	User             UserResponse `json:"user"`
	AccessToken      string       `json:"access_token,omitempty"`
	IsPanicMode      bool         `json:"is_panic_mode,omitempty"`
	PanicRedirectURL string       `json:"panic_redirect_url,omitempty"`
}
