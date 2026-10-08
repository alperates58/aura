package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"aura/internal/models"
	"github.com/google/uuid"
)

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

// GetMessagesAround hedef mesajın (messageID) etrafındaki mesaj bloğunu (öncesi ve sonrası) getirir.
func (r *ChatRepository) GetMessagesAround(ctx context.Context, conversationID, userID, targetMsgID uuid.UUID, limit int) ([]models.MessageResponse, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	allowed, conv, err := r.CanUserAccessConversation(ctx, conversationID, userID)
	if err != nil || !allowed || conv == nil {
		return nil, errors.New("bu konuşmaya erişim yetkiniz yok")
	}

	clearedAt := conv.UserTwoClearedAt
	if conv.UserOneID == userID {
		clearedAt = conv.UserOneClearedAt
	}

	// 1. Hedef mesajın zaman damgasını al
	var targetCreatedAt time.Time
	err = r.db.QueryRowContext(ctx, `
		SELECT created_at FROM messages
		WHERE id = $1 AND conversation_id = $2
		  AND created_at > $3
		  AND NOT ($4 = ANY(deleted_for_users))
	`, targetMsgID, conversationID, clearedAt, userID).Scan(&targetCreatedAt)
	if err != nil {
		return nil, fmt.Errorf("hedef mesaj bulunamadı: %w", err)
	}

	halfLimit := limit / 2
	if halfLimit < 15 {
		halfLimit = 25
	}

	// 2. Hedef mesaj ve öncesindeki mesajları çek (DESC)
	queryBefore := `
		SELECT id, conversation_id, sender_id, recipient_id, reply_to_id, message_type, content, media_url, media_metadata,
		       sent_at, delivered_at, read_at, is_edited, is_starred, is_deleted_for_all, reactions, created_at
		FROM messages
		WHERE conversation_id = $1
		  AND created_at > $2
		  AND created_at <= $3
		  AND NOT ($4 = ANY(deleted_for_users))
		ORDER BY created_at DESC
		LIMIT $5
	`
	rowsBefore, err := r.db.QueryContext(ctx, queryBefore, conversationID, clearedAt, targetCreatedAt, userID, halfLimit+1)
	if err != nil {
		return nil, fmt.Errorf("önceki mesajlar getirilemedi: %w", err)
	}
	defer rowsBefore.Close()

	var beforeMsgs []models.MessageResponse
	for rowsBefore.Next() {
		var m models.Message
		if err := rowsBefore.Scan(
			&m.ID, &m.ConversationID, &m.SenderID, &m.RecipientID, &m.ReplyToID, &m.MessageType, &m.Content,
			&m.MediaURL, &m.MediaMetadata, &m.SentAt, &m.DeliveredAt, &m.ReadAt, &m.IsEdited, &m.IsStarred,
			&m.IsDeletedForAll, &m.Reactions, &m.CreatedAt,
		); err == nil {
			beforeMsgs = append(beforeMsgs, m.ToResponse(userID))
		}
	}

	// 3. Hedef mesajdan sonraki mesajları çek (ASC)
	queryAfter := `
		SELECT id, conversation_id, sender_id, recipient_id, reply_to_id, message_type, content, media_url, media_metadata,
		       sent_at, delivered_at, read_at, is_edited, is_starred, is_deleted_for_all, reactions, created_at
		FROM messages
		WHERE conversation_id = $1
		  AND created_at > $2
		  AND created_at > $3
		  AND NOT ($4 = ANY(deleted_for_users))
		ORDER BY created_at ASC
		LIMIT $5
	`
	rowsAfter, err := r.db.QueryContext(ctx, queryAfter, conversationID, clearedAt, targetCreatedAt, userID, halfLimit)
	if err != nil {
		return nil, fmt.Errorf("sonraki mesajlar getirilemedi: %w", err)
	}
	defer rowsAfter.Close()

	var afterMsgs []models.MessageResponse
	for rowsAfter.Next() {
		var m models.Message
		if err := rowsAfter.Scan(
			&m.ID, &m.ConversationID, &m.SenderID, &m.RecipientID, &m.ReplyToID, &m.MessageType, &m.Content,
			&m.MediaURL, &m.MediaMetadata, &m.SentAt, &m.DeliveredAt, &m.ReadAt, &m.IsEdited, &m.IsStarred,
			&m.IsDeletedForAll, &m.Reactions, &m.CreatedAt,
		); err == nil {
			afterMsgs = append(afterMsgs, m.ToResponse(userID))
		}
	}

	// 4. Kronolojik sıra ile birleştir
	var fullList []models.MessageResponse
	for i := len(beforeMsgs) - 1; i >= 0; i-- {
		fullList = append(fullList, beforeMsgs[i])
	}
	fullList = append(fullList, afterMsgs...)

	if fullList == nil {
		fullList = []models.MessageResponse{}
	}
	return fullList, nil
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
