package cron

import (
	"context"
	"database/sql"
	"log"
	"time"

	"aura/internal/database"
	"aura/internal/storage"
	auraws "aura/internal/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type ExpiredMessagesCleaner struct {
	db      *sql.DB
	storage *storage.StorageService
	hub     *auraws.Hub
}

func NewExpiredMessagesCleaner(db *sql.DB, storage *storage.StorageService, hub *auraws.Hub) *ExpiredMessagesCleaner {
	return &ExpiredMessagesCleaner{
		db:      db,
		storage: storage,
		hub:     hub,
	}
}

func (c *ExpiredMessagesCleaner) Start(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		log.Printf("🧹 [Cleaner] Süresi dolan mesajları ve hikayeleri temizleme servisi başlatıldı (Aralık: %v).", interval)
		for {
			select {
			case <-ctx.Done():
				ticker.Stop()
				log.Println("🛑 [Cleaner] Temizleme servisi durduruldu.")
				return
			case <-ticker.C:
				c.cleanupExpiredMessages(ctx)
				c.archiveExpiredSecurityStories(ctx)
				c.cleanupExpiredStories(ctx)
			}
		}
	}()
}

func (c *ExpiredMessagesCleaner) cleanupExpiredMessages(ctx context.Context) {
	query := `
		SELECT id, conversation_id, sender_id, recipient_id, media_url
		FROM messages
		WHERE expires_at IS NOT NULL AND expires_at <= NOW()
		LIMIT 100
	`
	rows, err := c.db.QueryContext(ctx, query)
	if err != nil {
		log.Printf("⚠️ [Cleaner] Süresi dolan mesajlar sorgulanamadı: %v", err)
		return
	}
	defer rows.Close()

	type ExpiredItem struct {
		ID             uuid.UUID
		ConversationID uuid.UUID
		SenderID       uuid.UUID
		RecipientID    uuid.UUID
		MediaURL       string
	}

	var items []ExpiredItem
	for rows.Next() {
		var item ExpiredItem
		if err := rows.Scan(&item.ID, &item.ConversationID, &item.SenderID, &item.RecipientID, &item.MediaURL); err == nil {
			items = append(items, item)
		}
	}

	if len(items) == 0 {
		return
	}

	log.Printf("🧹 [Cleaner] %d adet süresi dolan mesaj temizleniyor...", len(items))

	for _, item := range items {
		// MinIO'daki dosyayı sil
		if item.MediaURL != "" {
			_ = c.storage.DeleteMedia(ctx, item.MediaURL)
		}

		// Veritabanından sil
		_, _ = c.db.ExecContext(ctx, "DELETE FROM messages WHERE id = $1", item.ID)

		// WebSocket ile istemcilere silindi bildir
		delPayload, _ := auraws.NewWSMessage("message_deleted", fiber.Map{
			"message_id":         item.ID,
			"conversation_id":    item.ConversationID,
			"is_deleted_for_all": false,
		})
		c.hub.SendToUser(item.SenderID, delPayload)
		c.hub.SendToUser(item.RecipientID, delPayload)
	}
}

func (c *ExpiredMessagesCleaner) cleanupExpiredStories(ctx context.Context) {
	query := `
		SELECT s.id, s.user_id, s.media_url
		FROM stories s
		WHERE s.expires_at <= NOW()
		  AND NOT EXISTS (
		      SELECT 1 FROM story_highlight_items shi WHERE shi.story_id = s.id
		  )
		LIMIT 50
	`
	rows, err := c.db.QueryContext(ctx, query)
	if err != nil {
		log.Printf("⚠️ [Cleaner] Süresi dolan hikayeler sorgulanamadı: %v", err)
		return
	}
	defer rows.Close()

	type ExpiredStory struct {
		ID       uuid.UUID
		UserID   uuid.UUID
		MediaURL string
	}

	var stories []ExpiredStory
	for rows.Next() {
		var s ExpiredStory
		if err := rows.Scan(&s.ID, &s.UserID, &s.MediaURL); err == nil {
			stories = append(stories, s)
		}
	}

	if len(stories) == 0 {
		return
	}

	log.Printf("🧹 [Cleaner] %d adet süresi dolan hikaye temizleniyor...", len(stories))

	for _, s := range stories {
		// MinIO'daki dosyayı sil (DeleteMedia artık url parsing hatasız çalışıyor)
		if s.MediaURL != "" && c.storage != nil {
			_ = c.storage.DeleteMedia(ctx, s.MediaURL)
		}

		// Veritabanından sil (story_views ve story_reactions cascade ile temizlenir)
		_, _ = c.db.ExecContext(ctx, "DELETE FROM stories WHERE id = $1", s.ID)

		// WebSocket ile tüm istemcilere hikayenin silindiğini/süresinin dolduğunu bildir
		if c.hub != nil {
			c.hub.BroadcastStoryDeleted(s.ID, s.UserID)
		}
	}
}

// archiveExpiredSecurityStories 24 saati dolan Aura Güvenlik hikayelerini tarih başlığıyla ("29.09.2026") öne çıkanlar albümüne arşivler.
func (c *ExpiredMessagesCleaner) archiveExpiredSecurityStories(ctx context.Context) {
	query := `
		SELECT s.id, s.created_at
		FROM stories s
		WHERE s.user_id = $1
		  AND s.expires_at <= NOW()
		  AND NOT EXISTS (
		      SELECT 1 FROM story_highlight_items shi WHERE shi.story_id = s.id
		  )
		ORDER BY s.created_at ASC
		LIMIT 100
	`
	rows, err := c.db.QueryContext(ctx, query, database.SecurityBotID)
	if err != nil {
		return
	}
	defer rows.Close()

	type SecStory struct {
		ID        uuid.UUID
		CreatedAt time.Time
	}
	var stories []SecStory
	for rows.Next() {
		var s SecStory
		if err := rows.Scan(&s.ID, &s.CreatedAt); err == nil {
			stories = append(stories, s)
		}
	}

	if len(stories) == 0 {
		return
	}

	for _, s := range stories {
		// Olayın gerçekleştiği tarih başlığı (Örn: "29.09.2026")
		dateTitle := s.CreatedAt.In(time.Local).Format("02.01.2006")

		// 1. Bu tarih için Aura Güvenlik öne çıkan albümü var mı?
		var highlightID uuid.UUID
		findHlQuery := `SELECT id FROM story_highlights WHERE user_id = $1 AND title = $2 LIMIT 1`
		err := c.db.QueryRowContext(ctx, findHlQuery, database.SecurityBotID, dateTitle).Scan(&highlightID)
		if err != nil {
			// Yoksa tarih başlığıyla yeni bir highlight oluştur
			createHlQuery := `
				INSERT INTO story_highlights (id, user_id, title, cover_url, created_at, updated_at)
				VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
				RETURNING id
			`
			coverURL := "https://api.dicebear.com/7.x/bottts/svg?seed=AuraSecurityShield&backgroundColor=1e1b4b"
			err = c.db.QueryRowContext(ctx, createHlQuery, database.SecurityBotID, dateTitle, coverURL).Scan(&highlightID)
			if err != nil {
				log.Printf("⚠️ [Cleaner] Güvenlik öne çıkan albümü oluşturulamadı (%s): %v", dateTitle, err)
				continue
			}
		}

		// 2. Hikayeyi bu albüme ekle
		insertItemQuery := `
			INSERT INTO story_highlight_items (highlight_id, story_id, position, created_at)
			VALUES ($1, $2, (SELECT COALESCE(MAX(position), 0) + 1 FROM story_highlight_items WHERE highlight_id = $1), NOW())
			ON CONFLICT (highlight_id, story_id) DO NOTHING
		`
		_, _ = c.db.ExecContext(ctx, insertItemQuery, highlightID, s.ID)
		_, _ = c.db.ExecContext(ctx, "UPDATE story_highlights SET updated_at = NOW() WHERE id = $1", highlightID)

		log.Printf("🛡️ [Cleaner] Aura Güvenlik hikayesi (%s) profile arşivlendi: Highlight [%s]", s.ID, dateTitle)
	}
}


