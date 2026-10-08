package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"aura/internal/models"
	"github.com/google/uuid"
)

type ChatRepository struct {
	db *sql.DB
}

func NewChatRepository(db *sql.DB) *ChatRepository {
	return &ChatRepository{db: db}
}

func sortUserIDs(u1, u2 uuid.UUID) (uuid.UUID, uuid.UUID) {
	if u1.String() < u2.String() {
		return u1, u2
	}
	return u2, u1
}

func (r *ChatRepository) GetOrCreateConversation(ctx context.Context, userA, userB uuid.UUID) (*models.Conversation, error) {
	u1, u2 := sortUserIDs(userA, userB)

	query := `
		INSERT INTO conversations (user_one_id, user_two_id, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (user_one_id, user_two_id) DO UPDATE
		SET updated_at = conversations.updated_at
		RETURNING id, user_one_id, user_two_id, user_one_cleared_at, user_two_cleared_at, is_blocked, blocked_by, COALESCE(safety_number_version, 1), created_at, updated_at
	`
	var c models.Conversation
	err := r.db.QueryRowContext(ctx, query, u1, u2).Scan(
		&c.ID, &c.UserOneID, &c.UserTwoID,
		&c.UserOneClearedAt, &c.UserTwoClearedAt,
		&c.IsBlocked, &c.BlockedBy,
		&c.SafetyNumberVersion,
		&c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("konusma olusturulamadi: %w", err)
	}
	return &c, nil
}

func (r *ChatRepository) GetConversationByID(ctx context.Context, id uuid.UUID) (*models.Conversation, error) {
	query := `
		SELECT id, user_one_id, user_two_id, user_one_cleared_at, user_two_cleared_at, is_blocked, blocked_by, COALESCE(safety_number_version, 1), created_at, updated_at
		FROM conversations
		WHERE id = $1
	`
	var c models.Conversation
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&c.ID, &c.UserOneID, &c.UserTwoID,
		&c.UserOneClearedAt, &c.UserTwoClearedAt,
		&c.IsBlocked, &c.BlockedBy,
		&c.SafetyNumberVersion,
		&c.CreatedAt, &c.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *ChatRepository) GetUserConversations(ctx context.Context, userID uuid.UUID) ([]models.ConversationResponse, error) {
	query := `
		SELECT 
			c.id, c.user_one_id, c.user_two_id, c.user_one_cleared_at, c.user_two_cleared_at, c.is_blocked, COALESCE(c.safety_number_version, 1), c.created_at, c.updated_at,
			u.id, u.username, u.display_name, u.email, u.avatar_url, u.bio, u.online_status, u.last_seen_at, u.privacy_settings, u.created_at,
			(
				SELECT row_to_json(sub) FROM (
					SELECT id, conversation_id, sender_id, recipient_id, reply_to_id, message_type, content, media_url, media_metadata,
					       sent_at, delivered_at, read_at, is_edited, is_starred, is_deleted_for_all, reactions, created_at
					FROM messages
					WHERE conversation_id = c.id
					  AND created_at > (CASE WHEN c.user_one_id = $1 THEN c.user_one_cleared_at ELSE c.user_two_cleared_at END)
					  AND NOT ($1 = ANY(deleted_for_users))
					ORDER BY created_at DESC
					LIMIT 1
				) sub
			) AS last_message_json,
			COALESCE(unread.count, 0) AS unread_count
		FROM conversations c
		JOIN users u ON u.id = CASE WHEN c.user_one_id = $1 THEN c.user_two_id ELSE c.user_one_id END
		LEFT JOIN LATERAL (
			SELECT COUNT(*) AS count FROM messages
			WHERE conversation_id = c.id
			  AND recipient_id = $1
			  AND read_at IS NULL
			  AND created_at > (CASE WHEN c.user_one_id = $1 THEN c.user_one_cleared_at ELSE c.user_two_cleared_at END)
			  AND NOT ($1 = ANY(deleted_for_users))
		) unread ON true
		WHERE (c.user_one_id = $1 OR c.user_two_id = $1)
		  AND (
		      (CASE WHEN c.user_one_id = $1 THEN c.user_one_cleared_at ELSE c.user_two_cleared_at END) <= c.created_at
		      OR
		      EXISTS (
		          SELECT 1 FROM messages m
		          WHERE m.conversation_id = c.id
		            AND m.created_at > (CASE WHEN c.user_one_id = $1 THEN c.user_one_cleared_at ELSE c.user_two_cleared_at END)
		            AND NOT ($1 = ANY(m.deleted_for_users))
		      )
		  )
		ORDER BY c.updated_at DESC
	`

	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("konusmalar alinamadi: %w", err)
	}
	defer rows.Close()

	var results []models.ConversationResponse
	for rows.Next() {
		var resp models.ConversationResponse
		var otherUser models.UserResponse
		var userOneID, userTwoID uuid.UUID
		var u1Cleared, u2Cleared time.Time
		var lastMsgBytes []byte

		err := rows.Scan(
			&resp.ID, &userOneID, &userTwoID, &u1Cleared, &u2Cleared, &resp.IsBlocked, &resp.SafetyNumberVersion, &resp.CreatedAt, &resp.UpdatedAt,
			&otherUser.ID, &otherUser.Username, &otherUser.DisplayName, &otherUser.Email, &otherUser.AvatarURL, &otherUser.Bio,
			&otherUser.OnlineStatus, &otherUser.LastSeenAt, &otherUser.PrivacySettings, &otherUser.CreatedAt,
			&lastMsgBytes,
			&resp.UnreadCount,
		)
		if err != nil {
			return nil, fmt.Errorf("satir okunamadi: %w", err)
		}

		// Guvenlik ve Gizlilik: Karsi tarafin ozel e-posta, rol veya panik modu detaylari asla baska kullanicilara sizdirilmaz.
		otherUser.Email = ""
		otherUser.Role = ""
		otherUser.BanReason = ""
		otherUser.PanicLogin = ""
		otherUser.HasPanicPassword = false
		otherUser.PanicRedirectURL = ""
		otherUser.TokenVersion = 0
		resp.OtherUser = otherUser
		if len(lastMsgBytes) > 0 {
			var msg models.Message
			if err := json.Unmarshal(lastMsgBytes, &msg); err == nil {
				lastMsgRes := msg.ToResponse(userID)
				resp.LastMessage = &lastMsgRes
			}
		}
		results = append(results, resp)
	}

	if results == nil {
		results = []models.ConversationResponse{}
	}
	return results, nil
}

func (r *ChatRepository) ClearConversationHistory(ctx context.Context, conversationID, userID uuid.UUID) error {
	conv, err := r.GetConversationByID(ctx, conversationID)
	if err != nil || conv == nil {
		return errors.New("konuşma bulunamadı")
	}

	var query string
	if conv.UserOneID == userID {
		query = "UPDATE conversations SET user_one_cleared_at = NOW(), updated_at = NOW() WHERE id = $1"
	} else if conv.UserTwoID == userID {
		query = "UPDATE conversations SET user_two_cleared_at = NOW(), updated_at = NOW() WHERE id = $1"
	} else {
		return errors.New("bu konuşmanın tarafı değilsiniz")
	}

	_, err = r.db.ExecContext(ctx, query, conversationID)
	return err
}

// CanUserAccessConversation kullanıcının verilen konuşmanın meşru bir tarafı (participant) olup olmadığını denetler.
func (r *ChatRepository) CanUserAccessConversation(ctx context.Context, conversationID, userID uuid.UUID) (bool, *models.Conversation, error) {
	conv, err := r.GetConversationByID(ctx, conversationID)
	if err != nil || conv == nil {
		return false, nil, errors.New("konuşma bulunamadı")
	}
	if conv.UserOneID != userID && conv.UserTwoID != userID {
		return false, nil, errors.New("bu konuşmaya erişim yetkiniz yok")
	}
	return true, conv, nil
}

// BlockConversation konuşmayı engeller (yalnızca konuşmanın tarafı olan kullanıcı engelleyebilir)
func (r *ChatRepository) BlockConversation(ctx context.Context, conversationID, blockerID uuid.UUID) error {
	allowed, _, err := r.CanUserAccessConversation(ctx, conversationID, blockerID)
	if err != nil || !allowed {
		return errors.New("bu konuşmayı engelleme yetkiniz yok")
	}
	query := `
		UPDATE conversations
		SET is_blocked = TRUE, blocked_by = $1, updated_at = NOW()
		WHERE id = $2 AND (user_one_id = $1 OR user_two_id = $1)
	`
	res, err := r.db.ExecContext(ctx, query, blockerID, conversationID)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return errors.New("konuşma engellenemedi")
	}
	return nil
}

// UnblockConversation engelli konuşmanın engelini kaldırır (yalnızca engelleyen kullanıcı kaldırabilir)
func (r *ChatRepository) UnblockConversation(ctx context.Context, conversationID, unblockerID uuid.UUID) error {
	allowed, conv, err := r.CanUserAccessConversation(ctx, conversationID, unblockerID)
	if err != nil || !allowed || conv == nil {
		return errors.New("bu konuşmaya erişim yetkiniz yok")
	}
	if conv.BlockedBy == nil || *conv.BlockedBy != unblockerID {
		return errors.New("bu engeli yalnızca engeli koyan kullanıcı kaldırabilir")
	}
	query := `
		UPDATE conversations
		SET is_blocked = FALSE, blocked_by = NULL, updated_at = NOW()
		WHERE id = $1 AND blocked_by = $2
	`
	_, err = r.db.ExecContext(ctx, query, conversationID, unblockerID)
	return err
}

// IsUserBlocked iki kullanıcı arasında aktif bir engelleme olup olmadığını kontrol eder.
func (r *ChatRepository) IsUserBlocked(ctx context.Context, userA, userB uuid.UUID) (bool, error) {
	query := `
		SELECT EXISTS(
			SELECT 1 FROM conversations
			WHERE ((user_one_id = $1 AND user_two_id = $2) OR (user_one_id = $2 AND user_two_id = $1))
			  AND is_blocked = TRUE
		)
	`
	var isBlocked bool
	err := r.db.QueryRowContext(ctx, query, userA, userB).Scan(&isBlocked)
	return isBlocked, err
}
