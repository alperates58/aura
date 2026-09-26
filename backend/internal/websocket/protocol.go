package websocket

import (
	"encoding/json"
	"time"

	"fisilti/internal/models"
	"github.com/google/uuid"
)

type WSMessage struct {
	Action  string          `json:"action"`
	Payload json.RawMessage `json:"payload"`
}

func NewWSMessage(action string, payload interface{}) ([]byte, error) {
	bytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	msg := WSMessage{
		Action:  action,
		Payload: bytes,
	}
	return json.Marshal(msg)
}

// Gelen Paketler (Client -> Server)
type SendMessagePayload struct {
	TempID         string          `json:"temp_id,omitempty"`
	ConversationID uuid.UUID       `json:"conversation_id"`
	MessageType    string          `json:"message_type"` // text, voice, image...
	Content        string          `json:"content"`
	MediaURL       string          `json:"media_url,omitempty"`
	MediaMetadata  json.RawMessage `json:"media_metadata,omitempty"`
	ReplyToID      *uuid.UUID      `json:"reply_to_id,omitempty"`
}

type DeliveredAckPayload struct {
	MessageIDs []uuid.UUID `json:"message_ids"`
}

type ReadAckPayload struct {
	ConversationID uuid.UUID   `json:"conversation_id"`
	MessageIDs     []uuid.UUID `json:"message_ids,omitempty"`
}

type TypingPayload struct {
	ConversationID uuid.UUID `json:"conversation_id"`
}

type ListenTogetherSyncPayload struct {
	ConversationID uuid.UUID `json:"conversation_id"`
	SenderID       uuid.UUID `json:"sender_id,omitempty"`
	MediaType      string    `json:"media_type"` // "youtube", "youtube_music", "youtube_playlist", "audio"
	URL            string    `json:"url"`
	YouTubeID      string    `json:"youtube_id,omitempty"`
	PlaylistID     string    `json:"playlist_id,omitempty"`
	PlaylistIndex  int       `json:"playlist_index,omitempty"`
	Title          string    `json:"title,omitempty"`
	Artist         string    `json:"artist,omitempty"`
	Thumbnail      string    `json:"thumbnail,omitempty"`
	StartedByName  string    `json:"started_by_name,omitempty"`
	StartedByID    string    `json:"started_by_id,omitempty"`
	IsPlaying      bool      `json:"is_playing"`
	CurrentTime    float64   `json:"current_time"`
	Duration       float64   `json:"duration,omitempty"`
	ActionType     string    `json:"action_type,omitempty"` // "start", "play", "pause", "seek", "next", "prev", "stop"
}

// Giden Paketler (Server -> Client)
type MessageSentPayload struct {
	TempID  string                 `json:"temp_id,omitempty"`
	Message models.MessageResponse `json:"message"`
}

type MessageDeliveredPayload struct {
	MessageIDs  []uuid.UUID `json:"message_ids"`
	DeliveredAt time.Time   `json:"delivered_at"`
}

type MessageReadPayload struct {
	ConversationID uuid.UUID   `json:"conversation_id"`
	MessageIDs     []uuid.UUID `json:"message_ids"`
	ReadAt         time.Time   `json:"read_at"`
}

type UserTypingPayload struct {
	ConversationID uuid.UUID `json:"conversation_id"`
	UserID         uuid.UUID `json:"user_id"`
	IsTyping       bool      `json:"is_typing"`
}

type PresenceUpdatePayload struct {
	UserID     uuid.UUID `json:"user_id"`
	Status     int       `json:"status"` // 0: offline, 1: online
	LastSeenAt time.Time `json:"last_seen_at"`
}
