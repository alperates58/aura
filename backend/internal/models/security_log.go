package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type SecurityLog struct {
	ID                uuid.UUID       `json:"id"`
	EventType         string          `json:"event_type"` // 'unknown_user_attempt', 'failed_password_attempt'
	AttemptedLogin    string          `json:"attempted_login"`
	AttemptedUsername string          `json:"attempted_username,omitempty"`
	IPAddress         string          `json:"ip_address"`
	UserAgent         string          `json:"user_agent"`
	DeviceInfo        string          `json:"device_info"`
	Details           json.RawMessage `json:"details"`
	Severity          string          `json:"severity,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
}

type SecurityAlertPayload struct {
	ID             uuid.UUID `json:"id"`
	EventType      string    `json:"event_type"`
	AttemptedLogin string    `json:"username"`
	IPAddress      string    `json:"ip_address"`
	Location       string    `json:"location,omitempty"`
	DeviceInfo     string    `json:"device_info,omitempty"`
	Message        string    `json:"details,omitempty"`
	Severity       string    `json:"severity,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

type SecurityStats struct {
	TotalIncidents int `json:"total_incidents"`
	UniqueIPs      int `json:"unique_ips"`
	Last24hCount   int `json:"last_24h_count"`
}
