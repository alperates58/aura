package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type SecurityLog struct {
	ID             uuid.UUID       `json:"id"`
	EventType      string          `json:"event_type"` // 'unknown_user_attempt', 'failed_password_attempt'
	AttemptedLogin string          `json:"attempted_login"`
	IPAddress      string          `json:"ip_address"`
	UserAgent      string          `json:"user_agent"`
	DeviceInfo     string          `json:"device_info"`
	Details        json.RawMessage `json:"details"`
	CreatedAt      time.Time       `json:"created_at"`
}

type SecurityAlertPayload struct {
	ID             uuid.UUID `json:"id"`
	EventType      string    `json:"event_type"`
	AttemptedLogin string    `json:"attempted_login"`
	IPAddress      string    `json:"ip_address"`
	DeviceInfo     string    `json:"device_info"`
	Message        string    `json:"message"`
	CreatedAt      time.Time `json:"created_at"`
}

type SecurityStats struct {
	TotalIncidents int `json:"total_incidents"`
	UniqueIPs      int `json:"unique_ips"`
	Last24hCount   int `json:"last_24h_count"`
}
