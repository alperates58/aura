package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"aura/internal/models"
	"github.com/google/uuid"
	"github.com/lib/pq"
)

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
