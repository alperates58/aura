package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"aura/internal/database"
	"aura/internal/models"
	"aura/internal/storage"
	auraws "aura/internal/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type StoryHandler struct {
	storyRepo *database.StoryRepository
	userRepo  *database.UserRepository
	storage   *storage.StorageService
	hub       *auraws.Hub
}

func NewStoryHandler(storyRepo *database.StoryRepository, userRepo *database.UserRepository, storage *storage.StorageService, hub *auraws.Hub) *StoryHandler {
	return &StoryHandler{
		storyRepo: storyRepo,
		userRepo:  userRepo,
		storage:   storage,
		hub:       hub,
	}
}

// GetActiveStories - 24 saatlik aktif hikayeleri kullanıcı bazlı gruplanmış olarak döner
func (h *StoryHandler) GetActiveStories(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	groups, err := h.storyRepo.GetActiveStories(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"story_groups": groups})
}

// CreateStory - Yeni hikaye paylaşır (fotoğraf, video, ses, müzik, çıkartma, hedef kitle)
func (h *StoryHandler) CreateStory(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	var req models.CreateStoryRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz hikaye verisi."})
	}

	if req.MediaType == "" {
		req.MediaType = "image"
	}
	allowedTypes := map[string]bool{"image": true, "video": true, "text": true, "audio": true}
	if !allowedTypes[req.MediaType] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz medya tipi."})
	}

	if len(req.Caption) > 500 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Hikaye başlığı en fazla 500 karakter olabilir."})
	}

	if req.BackgroundColor == "" {
		req.BackgroundColor = "from-pink-900 to-slate-950"
	}

	durationSec := req.DurationSeconds
	if durationSec <= 0 {
		durationSec = 10
	}
	if durationSec > 60 {
		durationSec = 60
	}

	if len(req.MusicURL) > 500 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Müzik adresi çok uzun."})
	}

	if req.Audience != "close_friends" {
		req.Audience = "everyone"
	}

	if len(req.Stickers) > 65536 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Çıkartma verisi izin verilen boyutu aşıyor."})
	}

	story := &models.Story{
		UserID:          userID,
		MediaType:       req.MediaType,
		MediaURL:        req.MediaURL,
		Caption:         req.Caption,
		BackgroundColor: req.BackgroundColor,
		MusicTitle:      req.MusicTitle,
		MusicArtist:     req.MusicArtist,
		MusicURL:        req.MusicURL,
		DurationSeconds: durationSec,
		MusicStart:      req.MusicStart,
		MusicEnd:        req.MusicEnd,
		Audience:        req.Audience,
		Stickers:        req.Stickers,
	}

	if err := h.storyRepo.CreateStory(c.Context(), story); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Yeni hikaye bildirimini WebSocket ve Web Push ile dağıt
	if h.hub != nil {
		go func() {
			ctx := context.Background()
			author, err := h.userRepo.GetUserByID(ctx, userID)
			authorName := "Birisi"
			authorAvatar := ""
			if err == nil && author != nil {
				if author.DisplayName != "" {
					authorName = author.DisplayName
				} else {
					authorName = author.Username
				}
				authorAvatar = author.AvatarURL
			}
			h.hub.BroadcastStoryNotification(userID, authorName, authorAvatar, story.Caption, story.Audience)
		}()
	}

	return c.Status(fiber.StatusCreated).JSON(story)
}

// MarkStoryViewed - Hikayeyi görüldü olarak işaretler
func (h *StoryHandler) MarkStoryViewed(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	storyIDStr := c.Params("id")
	storyID, err := uuid.Parse(storyIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz hikaye ID'si."})
	}

	if err := h.storyRepo.MarkStoryViewed(c.Context(), storyID, userID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

// GetStoryViewers - Hikayeyi görenlerin listesini döner (Yalnızca hikaye sahibi görebilir)
func (h *StoryHandler) GetStoryViewers(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	storyIDStr := c.Params("id")
	storyID, err := uuid.Parse(storyIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz hikaye ID'si."})
	}

	viewers, err := h.storyRepo.GetStoryViewers(c.Context(), storyID, userID)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Görüntüleme yetkiniz yok."})
	}

	return c.JSON(fiber.Map{"viewers": viewers})
}

// DeleteStory - Hikayeyi ve bağlı MinIO medyasını güvenli siler
func (h *StoryHandler) DeleteStory(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	storyIDStr := c.Params("id")
	storyID, err := uuid.Parse(storyIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz hikaye ID'si."})
	}

	mediaURL, authorID, err := h.storyRepo.GetStoryMediaAndAuthor(c.Context(), storyID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Hikaye bulunamadı."})
	}

	isAdmin := false
	if u, err := h.userRepo.GetUserByID(c.Context(), userID); err == nil && u != nil {
		isAdmin = (u.Role == "admin")
	}

	if !isAdmin && authorID != userID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Bu hikayeyi silme yetkiniz yok."})
	}

	if err := h.storyRepo.DeleteStory(c.Context(), storyID, userID, isAdmin); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// MinIO medyasını temizle
	if mediaURL != "" && h.storage != nil {
		_ = h.storage.DeleteMedia(c.Context(), mediaURL)
	}

	// WebSocket ile tüm istemcilere silindiğini bildir
	if h.hub != nil {
		h.hub.BroadcastStoryDeleted(storyID, authorID)
	}

	return c.JSON(fiber.Map{"status": "deleted"})
}

// AddStoryReaction - Hikayeye emoji reaksiyonu ekler
func (h *StoryHandler) AddStoryReaction(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	storyIDStr := c.Params("id")
	storyID, err := uuid.Parse(storyIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz hikaye ID'si."})
	}

	var req models.StoryReactionRequest
	if err := c.BodyParser(&req); err != nil || strings.TrimSpace(req.Reaction) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçerli bir reaksiyon belirtin."})
	}

	reaction := strings.TrimSpace(req.Reaction)
	if len(reaction) > 10 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz reaksiyon formatı."})
	}

	if err := h.storyRepo.AddStoryReaction(c.Context(), storyID, userID, reaction); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	if h.hub != nil {
		go func() {
			ctx := context.Background()
			_, authorID, _ := h.storyRepo.GetStoryMediaAndAuthor(ctx, storyID)
			sender, _ := h.userRepo.GetUserByID(ctx, userID)
			senderName := "Biri"
			if sender != nil {
				if sender.DisplayName != "" {
					senderName = sender.DisplayName
				} else {
					senderName = sender.Username
				}
			}
			h.hub.BroadcastStoryReaction(storyID, authorID, userID, senderName, reaction)
		}()
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

// GetCloseFriends - Yakın arkadaşlar listesini döner
func (h *StoryHandler) GetCloseFriends(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	friends, err := h.storyRepo.GetCloseFriends(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"friends": friends})
}

// AddCloseFriend - Yakın arkadaş ekler
func (h *StoryHandler) AddCloseFriend(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	friendID, err := uuid.Parse(c.Params("friendId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz kullanıcı ID'si."})
	}

	if err := h.storyRepo.AddCloseFriend(c.Context(), userID, friendID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "added"})
}

// RemoveCloseFriend - Yakın arkadaş siler
func (h *StoryHandler) RemoveCloseFriend(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	friendID, err := uuid.Parse(c.Params("friendId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz kullanıcı ID'si."})
	}

	if err := h.storyRepo.RemoveCloseFriend(c.Context(), userID, friendID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "removed"})
}

// GetYouTubeInfo - YouTube / YouTube Music linkinden şarkı ve sanatçı adını güvenli host denetimiyle çeker
func (h *StoryHandler) GetYouTubeInfo(c *fiber.Ctx) error {
	videoURL := strings.TrimSpace(c.Query("url"))
	if videoURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "url parametresi gerekli"})
	}

	parsed, err := url.Parse(videoURL)
	if err != nil || parsed.Hostname() == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz YouTube adresi."})
	}

	host := strings.ToLower(parsed.Hostname())
	allowedHosts := map[string]bool{
		"youtube.com":        true,
		"www.youtube.com":    true,
		"m.youtube.com":      true,
		"youtu.be":           true,
		"music.youtube.com":  true,
	}

	if !allowedHosts[host] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Yalnızca YouTube ve YouTube Music bağlantılarına izin verilmektedir."})
	}

	oembedURL := fmt.Sprintf("https://www.youtube.com/oembed?url=%s&format=json", url.QueryEscape(videoURL))
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(oembedURL)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "YouTube bilgisi alınamadı"})
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Video bulunamadı"})
	}

	var data struct {
		Title      string `json:"title"`
		AuthorName string `json:"author_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Yanıt ayrıştırılamadı"})
	}

	cleanAuthor := strings.TrimSuffix(data.AuthorName, " - Topic")

	return c.JSON(fiber.Map{
		"title":  data.Title,
		"artist": cleanAuthor,
	})
}

// UpdateStory - Mevcut hikayeyi günceller (süre, müzik, metin, çıkartmalar)
func (h *StoryHandler) UpdateStory(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	storyID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz hikaye ID'si."})
	}

	var req models.CreateStoryRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz veri formatı."})
	}

	stickersJSON, err := json.Marshal(req.Stickers)
	if err != nil {
		stickersJSON = []byte("[]")
	}

	durSec := req.DurationSeconds
	if durSec <= 0 {
		durSec = 10
	}
	if durSec > 60 {
		durSec = 60
	}

	if req.Audience != "close_friends" {
		req.Audience = "everyone"
	}

	story := &models.Story{
		ID:              storyID,
		UserID:          userID,
		Caption:         req.Caption,
		BackgroundColor: req.BackgroundColor,
		MusicTitle:      req.MusicTitle,
		MusicArtist:     req.MusicArtist,
		MusicURL:        req.MusicURL,
		DurationSeconds: durSec,
		MusicStart:      req.MusicStart,
		MusicEnd:        req.MusicEnd,
		Audience:        req.Audience,
		Stickers:        stickersJSON,
	}

	if err := h.storyRepo.UpdateStory(c.Context(), story); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "updated"})
}

// ==========================================
// STORY HIGHLIGHT HANDLERS (ÖNE ÇIKANLAR)
// ==========================================

// CreateHighlight - Yeni bir öne çıkan albüm oluşturur
func (h *StoryHandler) CreateHighlight(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	var req models.CreateHighlightRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz istek formatı."})
	}

	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		req.Title = "Öne Çıkanlar"
	}

	hl, err := h.storyRepo.CreateHighlight(c.Context(), userID, req.Title, req.CoverURL, req.StoryIDs)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(hl)
}

// UpdateHighlight - Öne çıkan başlığını ve kapağını günceller
func (h *StoryHandler) UpdateHighlight(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	hlID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz albüm ID'si."})
	}

	var req models.UpdateHighlightRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz veri."})
	}

	if err := h.storyRepo.UpdateHighlight(c.Context(), hlID, userID, req.Title, req.CoverURL); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "updated"})
}

// DeleteHighlight - Öne çıkan albümü siler
func (h *StoryHandler) DeleteHighlight(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	hlID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz albüm ID'si."})
	}

	if err := h.storyRepo.DeleteHighlight(c.Context(), hlID, userID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "deleted"})
}

// AddStoriesToHighlight - Albüme yeni hikayeler ekler
func (h *StoryHandler) AddStoriesToHighlight(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	hlID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz albüm ID'si."})
	}

	var req models.AddStoriesToHighlightRequest
	if err := c.BodyParser(&req); err != nil || len(req.StoryIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "En az bir hikaye seçilmelidir."})
	}

	if err := h.storyRepo.AddStoriesToHighlight(c.Context(), hlID, userID, req.StoryIDs); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "stories_added"})
}

// RemoveStoryFromHighlight - Albümden belirli bir hikayeyi çıkarır
func (h *StoryHandler) RemoveStoryFromHighlight(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	hlID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz albüm ID'si."})
	}
	storyID, err := uuid.Parse(c.Params("storyId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz hikaye ID'si."})
	}

	if err := h.storyRepo.RemoveStoryFromHighlight(c.Context(), hlID, userID, storyID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "story_removed"})
}

// GetUserHighlights - Bir kullanıcının öne çıkan albümlerini listeler
func (h *StoryHandler) GetUserHighlights(c *fiber.Ctx) error {
	viewerID := c.Locals("user_id").(uuid.UUID)
	targetUserID, err := uuid.Parse(c.Params("userId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz kullanıcı ID'si."})
	}

	highlights, err := h.storyRepo.GetUserHighlights(c.Context(), targetUserID, viewerID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"highlights": highlights})
}

// GetHighlightWithStories - Albüm detayını ve izinli hikayelerini döner
func (h *StoryHandler) GetHighlightWithStories(c *fiber.Ctx) error {
	viewerID := c.Locals("user_id").(uuid.UUID)
	hlID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz albüm ID'si."})
	}

	hl, err := h.storyRepo.GetHighlightWithStories(c.Context(), hlID, viewerID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(hl)
}

