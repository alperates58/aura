package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"aura/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/lib/pq"
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

func (r *ChatRepository) SaveMessage(ctx context.Context, msg *models.Message) error {
	query := `
		INSERT INTO messages (
			conversation_id, sender_id, recipient_id, reply_to_id, message_type, content,
			media_url, media_metadata, sent_at, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW()
		)
		RETURNING id, sent_at, created_at, updated_at
	`
	if len(msg.MediaMetadata) == 0 {
		msg.MediaMetadata = []byte("{}")
	}
	if len(msg.Reactions) == 0 {
		msg.Reactions = []byte("{}")
	}

	err := r.db.QueryRowContext(ctx, query,
		msg.ConversationID, msg.SenderID, msg.RecipientID, msg.ReplyToID,
		msg.MessageType, msg.Content, msg.MediaURL, msg.MediaMetadata,
	).Scan(&msg.ID, &msg.SentAt, &msg.CreatedAt, &msg.UpdatedAt)

	if err != nil {
		return fmt.Errorf("mesaj kaydedilemedi: %w", err)
	}

	// Konuşma zamanını tazele
	_, _ = r.db.ExecContext(ctx, "UPDATE conversations SET updated_at = NOW() WHERE id = $1", msg.ConversationID)
	return nil
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

func (r *ChatRepository) GetMessages(ctx context.Context, conversationID, userID uuid.UUID, limit int, beforeTime *time.Time) ([]models.MessageResponse, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}

	allowed, conv, err := r.CanUserAccessConversation(ctx, conversationID, userID)
	if err != nil || !allowed || conv == nil {
		return nil, errors.New("bu konuşmaya erişim yetkiniz yok")
	}

	clearedAt := conv.UserTwoClearedAt
	if conv.UserOneID == userID {
		clearedAt = conv.UserOneClearedAt
	}

	var rows *sql.Rows
	if beforeTime != nil {
		query := `
			SELECT id, conversation_id, sender_id, recipient_id, reply_to_id, message_type, content, media_url, media_metadata,
			       sent_at, delivered_at, read_at, is_edited, is_starred, is_deleted_for_all, reactions, created_at
			FROM messages
			WHERE conversation_id = $1
			  AND created_at > $2
			  AND created_at < $3
			  AND NOT ($4 = ANY(deleted_for_users))
			ORDER BY created_at DESC
			LIMIT $5
		`
		rows, err = r.db.QueryContext(ctx, query, conversationID, clearedAt, *beforeTime, userID, limit)
	} else {
		query := `
			SELECT id, conversation_id, sender_id, recipient_id, reply_to_id, message_type, content, media_url, media_metadata,
			       sent_at, delivered_at, read_at, is_edited, is_starred, is_deleted_for_all, reactions, created_at
			FROM messages
			WHERE conversation_id = $1
			  AND created_at > $2
			  AND NOT ($3 = ANY(deleted_for_users))
			ORDER BY created_at DESC
			LIMIT $4
		`
		rows, err = r.db.QueryContext(ctx, query, conversationID, clearedAt, userID, limit)
	}

	if err != nil {
		return nil, fmt.Errorf("mesajlar getirilemedi: %w", err)
	}
	defer rows.Close()

	var list []models.MessageResponse
	for rows.Next() {
		var m models.Message
		if err := rows.Scan(
			&m.ID, &m.ConversationID, &m.SenderID, &m.RecipientID, &m.ReplyToID, &m.MessageType, &m.Content,
			&m.MediaURL, &m.MediaMetadata, &m.SentAt, &m.DeliveredAt, &m.ReadAt, &m.IsEdited, &m.IsStarred,
			&m.IsDeletedForAll, &m.Reactions, &m.CreatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, m.ToResponse(userID))
	}

	// Kronolojik sıraya çevir (eskiden yeniye)
	for i, j := 0, len(list)-1; i < j; i, j = i+1, j-1 {
		list[i], list[j] = list[j], list[i]
	}

	if list == nil {
		list = []models.MessageResponse{}
	}
	return list, nil
}

func (r *ChatRepository) MarkMessagesAsDelivered(ctx context.Context, recipientID uuid.UUID, messageIDs []uuid.UUID) ([]uuid.UUID, time.Time, error) {
	now := time.Now()
	if len(messageIDs) == 0 {
		return nil, now, nil
	}

	query := `
		UPDATE messages
		SET delivered_at = $1
		WHERE recipient_id = $2
		  AND id = ANY($3)
		  AND delivered_at IS NULL
		RETURNING id
	`

	rows, err := r.db.QueryContext(ctx, query, now, recipientID, messageIDs)
	if err != nil {
		return nil, now, err
	}
	defer rows.Close()

	var updatedIDs []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err == nil {
			updatedIDs = append(updatedIDs, id)
		}
	}
	return updatedIDs, now, nil
}

func (r *ChatRepository) MarkMessagesAsRead(ctx context.Context, conversationID, readerID uuid.UUID, messageIDs []uuid.UUID) ([]uuid.UUID, time.Time, error) {
	now := time.Now()
	var rows *sql.Rows
	var err error

	if len(messageIDs) > 0 {
		query := `
			UPDATE messages
			SET read_at = $1, delivered_at = COALESCE(delivered_at, $1)
			WHERE conversation_id = $2
			  AND recipient_id = $3
			  AND id = ANY($4)
			  AND read_at IS NULL
			RETURNING id
		`
		rows, err = r.db.QueryContext(ctx, query, now, conversationID, readerID, messageIDs)
	} else {
		query := `
			UPDATE messages
			SET read_at = $1, delivered_at = COALESCE(delivered_at, $1)
			WHERE conversation_id = $2
			  AND recipient_id = $3
			  AND read_at IS NULL
			RETURNING id
		`
		rows, err = r.db.QueryContext(ctx, query, now, conversationID, readerID)
	}

	if err != nil {
		return nil, now, err
	}
	defer rows.Close()

	var updatedIDs []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err == nil {
			updatedIDs = append(updatedIDs, id)
		}
	}
	return updatedIDs, now, nil
}

func (r *ChatRepository) GetUndeliveredMessagesForUser(ctx context.Context, recipientID uuid.UUID) ([]models.Message, error) {
	query := `
		SELECT id, conversation_id, sender_id, recipient_id, reply_to_id, message_type, content, media_url, media_metadata,
		       sent_at, delivered_at, read_at, is_edited, is_starred, is_deleted_for_all, reactions, created_at
		FROM messages
		WHERE recipient_id = $1 AND delivered_at IS NULL
		ORDER BY created_at ASC
	`
	rows, err := r.db.QueryContext(ctx, query, recipientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []models.Message
	for rows.Next() {
		var m models.Message
		if err := rows.Scan(
			&m.ID, &m.ConversationID, &m.SenderID, &m.RecipientID, &m.ReplyToID, &m.MessageType, &m.Content,
			&m.MediaURL, &m.MediaMetadata, &m.SentAt, &m.DeliveredAt, &m.ReadAt, &m.IsEdited, &m.IsStarred,
			&m.IsDeletedForAll, &m.Reactions, &m.CreatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, nil
}

func (r *ChatRepository) GetMessageInfo(ctx context.Context, messageID, userID uuid.UUID) (*models.MessageInfoResponse, error) {
	query := `
		SELECT id, sent_at, delivered_at, read_at
		FROM messages
		WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)
	`
	var info models.MessageInfoResponse
	err := r.db.QueryRowContext(ctx, query, messageID, userID).Scan(
		&info.MessageID, &info.SentAt, &info.DeliveredAt, &info.ReadAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("mesaj bulunamadı")
	}
	if err != nil {
		return nil, err
	}
	return &info, nil
}

func (r *ChatRepository) GetMessageByID(ctx context.Context, messageID uuid.UUID) (*models.Message, error) {
	query := `
		SELECT id, conversation_id, sender_id, recipient_id, reply_to_id, message_type, content, media_url, media_metadata,
		       sent_at, delivered_at, read_at, is_edited, is_starred, is_deleted_for_all, reactions, created_at, updated_at
		FROM messages
		WHERE id = $1
	`
	var m models.Message
	err := r.db.QueryRowContext(ctx, query, messageID).Scan(
		&m.ID, &m.ConversationID, &m.SenderID, &m.RecipientID, &m.ReplyToID, &m.MessageType, &m.Content,
		&m.MediaURL, &m.MediaMetadata, &m.SentAt, &m.DeliveredAt, &m.ReadAt, &m.IsEdited, &m.IsStarred,
		&m.IsDeletedForAll, &m.Reactions, &m.CreatedAt, &m.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *ChatRepository) EditMessage(ctx context.Context, messageID, userID uuid.UUID, newContent string, timeLimitMinutes int) error {
	var query string
	if timeLimitMinutes > 0 {
		query = fmt.Sprintf(`
			UPDATE messages
			SET content = $1, is_edited = true, updated_at = NOW()
			WHERE id = $2 AND sender_id = $3 AND created_at > NOW() - INTERVAL '%d minutes' AND is_deleted_for_all = false
		`, timeLimitMinutes)
	} else {
		query = `
			UPDATE messages
			SET content = $1, is_edited = true, updated_at = NOW()
			WHERE id = $2 AND sender_id = $3 AND is_deleted_for_all = false
		`
	}
	res, err := r.db.ExecContext(ctx, query, newContent, messageID, userID)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		if timeLimitMinutes > 0 {
			return fmt.Errorf("mesaj düzenlenemez (%d dakikalık süre dolmuş veya yetkiniz yok)", timeLimitMinutes)
		}
		return errors.New("mesaj düzenlenemez veya yetkiniz yok")
	}
	return nil
}

func (r *ChatRepository) DeleteMessageForMe(ctx context.Context, messageID, userID uuid.UUID) error {
	query := `
		UPDATE messages
		SET deleted_for_users = array_append(deleted_for_users, $1)
		WHERE id = $2 AND NOT ($1 = ANY(deleted_for_users))
	`
	_, err := r.db.ExecContext(ctx, query, userID, messageID)
	return err
}

func (r *ChatRepository) DeleteMessageForAll(ctx context.Context, messageID, userID uuid.UUID, timeLimitMinutes int) (*models.Message, error) {
	var query string
	if timeLimitMinutes > 0 {
		query = fmt.Sprintf(`
			UPDATE messages
			SET is_deleted_for_all = true, content = '', updated_at = NOW()
			WHERE id = $1 AND sender_id = $2 AND created_at > NOW() - INTERVAL '%d minutes'
			RETURNING id, conversation_id, sender_id, recipient_id, media_url
		`, timeLimitMinutes)
	} else {
		query = `
			UPDATE messages
			SET is_deleted_for_all = true, content = '', updated_at = NOW()
			WHERE id = $1 AND sender_id = $2
			RETURNING id, conversation_id, sender_id, recipient_id, media_url
		`
	}
	var m models.Message
	err := r.db.QueryRowContext(ctx, query, messageID, userID).Scan(
		&m.ID, &m.ConversationID, &m.SenderID, &m.RecipientID, &m.MediaURL,
	)
	if errors.Is(err, sql.ErrNoRows) {
		if timeLimitMinutes > 0 {
			return nil, fmt.Errorf("mesaj bulunamadı, silme süresi (%d dakika) dolmuş veya yetkiniz yok", timeLimitMinutes)
		}
		return nil, errors.New("mesaj bulunamadı veya silme yetkiniz yok")
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// DeleteMessagesBatch toplu mesaj silme işlemi yapar (Benden Sil veya Herkesten Sil)
func (r *ChatRepository) DeleteMessagesBatch(ctx context.Context, conversationID, userID uuid.UUID, messageIDs []uuid.UUID, forAll bool, timeLimitMinutes int) ([]uuid.UUID, []string, error) {
	if len(messageIDs) == 0 {
		return nil, nil, errors.New("en az bir mesaj seçilmelidir")
	}

	allowed, _, err := r.CanUserAccessConversation(ctx, conversationID, userID)
	if err != nil || !allowed {
		return nil, nil, errors.New("bu konuşmaya erişim yetkiniz yok")
	}

	var deletedIDs []uuid.UUID
	var mediaURLs []string

	if forAll {
		var query string
		if timeLimitMinutes > 0 {
			query = fmt.Sprintf(`
				UPDATE messages
				SET is_deleted_for_all = TRUE, content = '', updated_at = NOW()
				WHERE conversation_id = $1 AND sender_id = $2 AND id = ANY($3)
				  AND created_at > NOW() - INTERVAL '%d minutes'
				  AND is_deleted_for_all = FALSE
				RETURNING id, media_url
			`, timeLimitMinutes)
		} else {
			query = `
				UPDATE messages
				SET is_deleted_for_all = TRUE, content = '', updated_at = NOW()
				WHERE conversation_id = $1 AND sender_id = $2 AND id = ANY($3)
				  AND is_deleted_for_all = FALSE
				RETURNING id, media_url
			`
		}

		rows, err := r.db.QueryContext(ctx, query, conversationID, userID, pq.Array(messageIDs))
		if err != nil {
			return nil, nil, err
		}
		defer rows.Close()

		for rows.Next() {
			var id uuid.UUID
			var mediaURL string
			if err := rows.Scan(&id, &mediaURL); err == nil {
				deletedIDs = append(deletedIDs, id)
				if mediaURL != "" {
					mediaURLs = append(mediaURLs, mediaURL)
				}
			}
		}
	} else {
		query := `
			UPDATE messages
			SET deleted_for_users = array_append(deleted_for_users, $2), updated_at = NOW()
			WHERE conversation_id = $1 AND id = ANY($3)
			  AND NOT ($2 = ANY(deleted_for_users))
			RETURNING id
		`
		rows, err := r.db.QueryContext(ctx, query, conversationID, userID, pq.Array(messageIDs))
		if err != nil {
			return nil, nil, err
		}
		defer rows.Close()

		for rows.Next() {
			var id uuid.UUID
			if err := rows.Scan(&id); err == nil {
				deletedIDs = append(deletedIDs, id)
			}
		}
	}

	if deletedIDs == nil {
		deletedIDs = []uuid.UUID{}
	}
	return deletedIDs, mediaURLs, nil
}

func (r *ChatRepository) ToggleReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) (map[string][]string, error) {
	m, err := r.GetMessageByID(ctx, messageID)
	if err != nil || m == nil {
		return nil, errors.New("mesaj bulunamadı")
	}

	allowed, _, err := r.CanUserAccessConversation(ctx, m.ConversationID, userID)
	if err != nil || !allowed {
		return nil, errors.New("bu mesaja tepki verme yetkiniz yok")
	}

	reactions := make(map[string][]string)
	if len(m.Reactions) > 0 && string(m.Reactions) != "null" {
		_ = json.Unmarshal(m.Reactions, &reactions)
	}
	if reactions == nil {
		reactions = make(map[string][]string)
	}

	uidStr := userID.String()

	// Kullanıcı daha önce aynı emojiye basmış mı kontrol et
	alreadyHadSame := false
	if users, ok := reactions[emoji]; ok {
		for _, u := range users {
			if u == uidStr {
				alreadyHadSame = true
				break
			}
		}
	}

	// Kullanıcının önceki tepkisini tüm emojilerden temizle (bir kullanıcı tek tepki verebilsin)
	for e, users := range reactions {
		var filtered []string
		for _, u := range users {
			if u != uidStr {
				filtered = append(filtered, u)
			}
		}
		if len(filtered) > 0 {
			reactions[e] = filtered
		} else {
			delete(reactions, e)
		}
	}

	// Eğer aynı emojiye basmamışsa yeni emojiyi ekle (basmışsa zaten kaldırılmış oldu - toggle)
	if !alreadyHadSame {
		reactions[emoji] = append(reactions[emoji], uidStr)
	}

	updatedBytes, err := json.Marshal(reactions)
	if err != nil {
		return nil, err
	}

	query := `UPDATE messages SET reactions = $1::jsonb WHERE id = $2`
	_, err = r.db.ExecContext(ctx, query, string(updatedBytes), messageID)
	if err != nil {
		return nil, err
	}

	return reactions, nil
}

func (r *ChatRepository) GetStarredMessages(ctx context.Context, userID uuid.UUID) ([]models.MessageResponse, error) {
	query := `
		SELECT id, conversation_id, sender_id, recipient_id, reply_to_id, message_type, content, media_url, media_metadata,
		       sent_at, delivered_at, read_at, is_edited, is_starred, is_deleted_for_all, reactions, created_at
		FROM messages
		WHERE (sender_id = $1 OR recipient_id = $1)
		  AND is_starred = TRUE
		  AND is_deleted_for_all = FALSE
		  AND NOT ($1 = ANY(deleted_for_users))
		ORDER BY created_at DESC
		LIMIT 100
	`
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("yildizli mesajlar getirilemedi: %w", err)
	}
	defer rows.Close()

	var list []models.MessageResponse
	for rows.Next() {
		var m models.Message
		if err := rows.Scan(
			&m.ID, &m.ConversationID, &m.SenderID, &m.RecipientID, &m.ReplyToID, &m.MessageType, &m.Content,
			&m.MediaURL, &m.MediaMetadata, &m.SentAt, &m.DeliveredAt, &m.ReadAt, &m.IsEdited, &m.IsStarred,
			&m.IsDeletedForAll, &m.Reactions, &m.CreatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, m.ToResponse(userID))
	}
	if list == nil {
		list = []models.MessageResponse{}
	}
	return list, nil
}

func (r *ChatRepository) ToggleStar(ctx context.Context, messageID, userID uuid.UUID) (bool, error) {
	query := `
		UPDATE messages
		SET is_starred = NOT is_starred, updated_at = NOW()
		WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)
		RETURNING is_starred
	`
	var starred bool
	err := r.db.QueryRowContext(ctx, query, messageID, userID).Scan(&starred)
	return starred, err
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

// SearchMessages konuşma içindeki mesajlarda yetkili metin araması yapar.
func (r *ChatRepository) SearchMessages(ctx context.Context, conversationID, userID uuid.UUID, queryStr string, limit int) ([]models.MessageResponse, error) {
	allowed, conv, err := r.CanUserAccessConversation(ctx, conversationID, userID)
	if err != nil || !allowed || conv == nil {
		return nil, errors.New("bu konuşmaya erişim yetkiniz yok")
	}

	cleanQuery := strings.TrimSpace(queryStr)
	if len(cleanQuery) < 2 {
		return nil, errors.New("arama terimi en az 2 karakter olmalıdır")
	}
	if len(cleanQuery) > 100 {
		cleanQuery = cleanQuery[:100]
	}

	if limit <= 0 || limit > 50 {
		limit = 30
	}

	clearedAt := conv.UserTwoClearedAt
	if conv.UserOneID == userID {
		clearedAt = conv.UserOneClearedAt
	}

	sqlQuery := `
		SELECT id, conversation_id, sender_id, recipient_id, reply_to_id, message_type, content, media_url, media_metadata,
		       sent_at, delivered_at, read_at, is_edited, is_starred, is_deleted_for_all, reactions, created_at
		FROM messages
		WHERE conversation_id = $1
		  AND created_at > $2
		  AND NOT ($3 = ANY(deleted_for_users))
		  AND is_deleted_for_all = FALSE
		  AND content ILIKE '%' || $4 || '%'
		ORDER BY created_at DESC
		LIMIT $5
	`
	rows, err := r.db.QueryContext(ctx, sqlQuery, conversationID, clearedAt, userID, cleanQuery, limit)
	if err != nil {
		return nil, fmt.Errorf("mesajlar aranamadı: %w", err)
	}
	defer rows.Close()

	var list []models.MessageResponse
	for rows.Next() {
		var m models.Message
		if err := rows.Scan(
			&m.ID, &m.ConversationID, &m.SenderID, &m.RecipientID, &m.ReplyToID, &m.MessageType, &m.Content,
			&m.MediaURL, &m.MediaMetadata, &m.SentAt, &m.DeliveredAt, &m.ReadAt, &m.IsEdited, &m.IsStarred,
			&m.IsDeletedForAll, &m.Reactions, &m.CreatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, m.ToResponse(userID))
	}
	if list == nil {
		list = []models.MessageResponse{}
	}
	return list, nil
}

// CanUserAccessMedia dosya nesnesinin adına ve kullanıcının yetkisine bakar.
// Avatarlar herkese açıktır.
// Özel mesaj medyaları için (ses, fotoğraf, video, belge):
// Kullanıcı admin ise, dosyanın yükleyicisi (sender) ise veya mesajın alıcısı ise erişebilir.
func (r *ChatRepository) CanUserAccessMedia(ctx context.Context, userID uuid.UUID, userRole string, bucket, objectName string) (bool, error) {
	// 1. Avatarlar herkese açık profil fotoğraflarıdır
	if bucket == "avatars" {
		return true, nil
	}

	// 2. Admin sistemdeki tüm medyaları inceleme yetkisine sahiptir
	if userRole == "admin" {
		return true, nil
	}

	// 3. Dosya adındaki sender ID kontrolü: objectName = "{senderUUID}_{timestamp}.ext"
	parts := strings.Split(objectName, "_")
	if len(parts) >= 2 {
		if senderUUID, err := uuid.Parse(parts[0]); err == nil {
			if senderUUID == userID {
				return true, nil
			}
		}
	}

	// 4. Eğer yükleyen değilse, alıcı mı? Veritabanındaki messages tablosunda bu dosya bulunuyor mu?
	baseObj := strings.TrimSuffix(objectName, filepath.Ext(objectName))
	query := `
		SELECT 1 FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		WHERE (m.media_url LIKE '%' || $1 || '%')
		  AND (m.sender_id = $2 OR m.recipient_id = $2)
		  AND c.is_blocked = FALSE
		LIMIT 1
	`
	var exists int
	err := r.db.QueryRowContext(ctx, query, baseObj, userID).Scan(&exists)
	if err == nil && exists == 1 {
		return true, nil
	}

	// 5. Hikayeler (stories) kontrolü:
	// Eğer dosya bir hikayeye aitse:
	// a) Yazar her zaman görebilir
	// b) Süresi dolmamış olmalı (expires_at > NOW())
	// c) Kullanıcı ile hikaye sahibi birbirini bloklamamış olmalı
	// d) Eğer hedef kitle close_friends ise kullanıcı yazar veya yakın arkadaş olmalı
	var storyAuthorID uuid.UUID
	var storyExpiresAt time.Time
	var storyAudience string
	storyQuery := `
		SELECT user_id, expires_at, COALESCE(audience, 'everyone')
		FROM stories
		WHERE media_url LIKE '%' || $1 || '%'
		ORDER BY created_at DESC
		LIMIT 1
	`
	if sErr := r.db.QueryRowContext(ctx, storyQuery, baseObj).Scan(&storyAuthorID, &storyExpiresAt, &storyAudience); sErr == nil {
		if storyAuthorID == userID {
			return true, nil
		}
		if time.Now().After(storyExpiresAt) {
			return false, nil
		}

		// Blok kontrolü: İki kullanıcı arasında bloklu sohbet var mı?
		var isBlocked bool
		blockQuery := `
			SELECT EXISTS(
				SELECT 1 FROM conversations
				WHERE ((user_one_id = $1 AND user_two_id = $2) OR (user_one_id = $2 AND user_two_id = $1))
				  AND is_blocked = TRUE
			)
		`
		if bErr := r.db.QueryRowContext(ctx, blockQuery, userID, storyAuthorID).Scan(&isBlocked); bErr == nil && isBlocked {
			return false, nil
		}

		// Close Friends kontrolü:
		if storyAudience == "close_friends" {
			var isCloseFriend bool
			cfQuery := `
				SELECT EXISTS(
					SELECT 1 FROM user_close_friends
					WHERE user_id = $1 AND friend_id = $2
				)
			`
			if cfErr := r.db.QueryRowContext(ctx, cfQuery, storyAuthorID, userID).Scan(&isCloseFriend); cfErr != nil || !isCloseFriend {
				return false, nil
			}
		}

		return true, nil
	}

	return false, nil
}

func (r *ChatRepository) IncrementSafetyNumberVersion(ctx context.Context, conversationID uuid.UUID) (int, error) {
	var newVer int
	err := r.db.QueryRowContext(ctx, `
		UPDATE conversations
		SET safety_number_version = COALESCE(safety_number_version, 1) + 1, updated_at = NOW()
		WHERE id = $1
		RETURNING safety_number_version
	`, conversationID).Scan(&newVer)
	return newVer, err
}

// Unused import warning prevention helper
var _ = pgx.ErrNoRows
var _ = stdlib.GetDefaultDriver


