package database

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"aura/internal/models"
	"github.com/google/uuid"
	"github.com/lib/pq"
)

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
	// b) Süresi dolmamış olmalı (veya Öne Çıkanlar'a eklenmiş olmalı)
	// c) Kullanıcı ile hikaye sahibi birbirini bloklamamış olmalı
	// d) Eğer hedef kitle close_friends ise kullanıcı yazar veya yakın arkadaş olmalı
	var storyID uuid.UUID
	var storyAuthorID uuid.UUID
	var storyExpiresAt time.Time
	var storyAudience string
	storyQuery := `
		SELECT id, user_id, expires_at, COALESCE(audience, 'everyone')
		FROM stories
		WHERE media_url LIKE '%' || $1 || '%'
		ORDER BY created_at DESC
		LIMIT 1
	`
	if sErr := r.db.QueryRowContext(ctx, storyQuery, baseObj).Scan(&storyID, &storyAuthorID, &storyExpiresAt, &storyAudience); sErr == nil {
		if storyAuthorID == userID {
			return true, nil
		}

		// 5.1 Düzeltmesi: Hikaye süresi dolsa bile Öne Çıkanlar (Story Highlights) albümündeyse erişime izin ver
		if time.Now().After(storyExpiresAt) {
			var inHighlight bool
			_ = r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM story_highlight_items WHERE story_id = $1)`, storyID).Scan(&inHighlight)
			if !inHighlight {
				return false, nil
			}
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

// GetMessageSenders teslim edilen mesajların gönderen kullanıcı ID'lerini döner
func (r *ChatRepository) GetMessageSenders(ctx context.Context, messageIDs []uuid.UUID) ([]uuid.UUID, error) {
	if len(messageIDs) == 0 {
		return nil, nil
	}
	query := `SELECT DISTINCT sender_id FROM messages WHERE id = ANY($1)`
	rows, err := r.db.QueryContext(ctx, query, pq.Array(messageIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var senders []uuid.UUID
	for rows.Next() {
		var sID uuid.UUID
		if err := rows.Scan(&sID); err == nil {
			senders = append(senders, sID)
		}
	}
	return senders, nil
}

// GetConversationAssets konuşmaya ait tüm medya, ses, link, belge ve yıldızlı mesajları döner
func (r *ChatRepository) GetConversationAssets(ctx context.Context, conversationID, userID uuid.UUID) ([]models.MessageResponse, error) {
	allowed, conv, err := r.CanUserAccessConversation(ctx, conversationID, userID)
	if err != nil || !allowed || conv == nil {
		return nil, errors.New("bu konuşmaya erişim yetkiniz yok")
	}

	clearedAt := conv.UserTwoClearedAt
	if conv.UserOneID == userID {
		clearedAt = conv.UserOneClearedAt
	}

	query := `
		SELECT id, conversation_id, sender_id, recipient_id, reply_to_id, message_type, content, media_url, media_metadata,
		       sent_at, delivered_at, read_at, is_edited, is_starred, is_deleted_for_all, reactions, created_at
		FROM messages
		WHERE conversation_id = $1
		  AND created_at > $2
		  AND is_deleted_for_all = FALSE
		  AND NOT ($3 = ANY(deleted_for_users))
		  AND (
		      (media_url != '' AND media_url IS NOT NULL)
		      OR message_type IN ('image', 'video', 'voice', 'file', 'doodle')
		      OR content ~* 'https?://'
		      OR is_starred = TRUE
		  )
		ORDER BY created_at DESC
		LIMIT 1000
	`
	rows, err := r.db.QueryContext(ctx, query, conversationID, clearedAt, userID)
	if err != nil {
		return nil, fmt.Errorf("medyalar getirilemedi: %w", err)
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
