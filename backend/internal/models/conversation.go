package models

import (
	"time"

	"github.com/google/uuid"
)

type Conversation struct {
	ID                          uuid.UUID   `json:"id"`
	UserOneID                   uuid.UUID   `json:"user_one_id"`
	UserTwoID                   uuid.UUID   `json:"user_two_id"`
	UserOneClearedAt            time.Time   `json:"user_one_cleared_at"`
	UserTwoClearedAt            time.Time   `json:"user_two_cleared_at"`
	IsBlocked                   bool        `json:"is_blocked"`
	BlockedBy                   *uuid.UUID  `json:"blocked_by,omitempty"`
	SafetyNumberVersion         int         `json:"safety_number_version"`
	SafetyNumberAcknowledgedBy  []uuid.UUID `json:"safety_number_acknowledged_by"`
	CreatedAt                   time.Time   `json:"created_at"`
	UpdatedAt                   time.Time   `json:"updated_at"`
}

type StartConversationRequest struct {
	RecipientID uuid.UUID `json:"recipient_id"`
}

type ConversationResponse struct {
	ID                  uuid.UUID        `json:"id"`
	OtherUser           UserResponse     `json:"other_user"`
	LastMessage         *MessageResponse `json:"last_message,omitempty"`
	UnreadCount         int              `json:"unread_count"`
	IsOnline            bool             `json:"is_online"`
	IsBlocked           bool             `json:"is_blocked"`
	SafetyNumberVersion int              `json:"safety_number_version"`
	CreatedAt           time.Time        `json:"created_at"`
	UpdatedAt           time.Time        `json:"updated_at"`
}
