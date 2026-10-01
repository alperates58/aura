package models

import (
	"time"

	"github.com/google/uuid"
)

// UserSession kullanıcının aktif giriş yaptığı cihaz ve oturum bilgileridir
type UserSession struct {
	ID           uuid.UUID `json:"id"`
	UserID       uuid.UUID `json:"user_id"`
	SessionID    string    `json:"session_id"`
	DeviceName   string    `json:"device_name"`
	DeviceType   string    `json:"device_type"` // 'desktop', 'mobile', 'tablet'
	OS           string    `json:"os"`
	Browser      string    `json:"browser"`
	IPAddress    string    `json:"ip_address"`
	Location     string    `json:"location"`
	UserAgent    string    `json:"user_agent,omitempty"`
	IsCurrent    bool      `json:"is_current"`
	LastActiveAt time.Time `json:"last_active_at"`
	CreatedAt    time.Time `json:"created_at"`
}
