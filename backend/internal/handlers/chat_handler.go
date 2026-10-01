package handlers

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"aura/internal/database"
	"aura/internal/models"
	auraredis "aura/internal/redis"
	"aura/internal/storage"
	auraws "aura/internal/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type ChatHandler struct {
	chatRepo        *database.ChatRepository
	userRepo        *database.UserRepository
	presenceService *auraredis.PresenceService
	storage         *storage.StorageService
	hub             *auraws.Hub
	settingsRepo    *database.SettingsRepository
	rdb             *redis.Client
}

func NewChatHandler(
	chatRepo *database.ChatRepository,
	userRepo *database.UserRepository,
	presenceService *auraredis.PresenceService,
	storage *storage.StorageService,
	hub *auraws.Hub,
	settingsRepo *database.SettingsRepository,
	rdb *redis.Client,
) *ChatHandler {
	return &ChatHandler{
		chatRepo:        chatRepo,
		userRepo:        userRepo,
		presenceService: presenceService,
		storage:         storage,
		hub:             hub,
		settingsRepo:    settingsRepo,
		rdb:             rdb,
	}
}

func (h *ChatHandler) StartConversation(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	var req models.StartConversationRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Geçersiz istek formatı.",
		})
	}

	if req.RecipientID == userID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Kendinizle sohbet başlatamazsınız.",
		})
	}

	otherUser, err := h.userRepo.GetUserByID(c.Context(), req.RecipientID)
	if err != nil || otherUser == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Sohbet başlatılacak kullanıcı bulunamadı.",
		})
	}

	isBlocked, _ := h.chatRepo.IsUserBlocked(c.Context(), userID, req.RecipientID)
	if isBlocked {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "Bu kullanıcı ile iletişim engellenmiştir.",
		})
	}

	conv, err := h.chatRepo.GetOrCreateConversation(c.Context(), userID, req.RecipientID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Sohbet oluşturulamadı.",
		})
	}

	isOnline := h.presenceService.IsUserOnline(c.Context(), otherUser.ID)

	return c.JSON(models.ConversationResponse{
		ID:          conv.ID,
		OtherUser:   otherUser.ToPublicResponse(),
		UnreadCount: 0,
		IsOnline:    isOnline,
		IsBlocked:   conv.IsBlocked,
		CreatedAt:   conv.CreatedAt,
		UpdatedAt:   conv.UpdatedAt,
	})
}

func (h *ChatHandler) GetConversations(c *fiber.Ctx) error {
	if isPanic, ok := c.Locals("is_panic_mode").(bool); ok && isPanic {
		return c.JSON([]models.ConversationResponse{})
	}

	userID := c.Locals("user_id").(uuid.UUID)

	convs, err := h.chatRepo.GetUserConversations(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Konuşmalar listelenemedi.",
		})
	}

	for i := range convs {
		isOnline := h.presenceService.IsUserOnline(c.Context(), convs[i].OtherUser.ID)
		convs[i].IsOnline = isOnline
		if isOnline {
			convs[i].OtherUser.OnlineStatus = 1
		} else {
			convs[i].OtherUser.OnlineStatus = 0
		}
	}

	return c.JSON(convs)
}

func (h *ChatHandler) GetMessages(c *fiber.Ctx) error {
	if isPanic, ok := c.Locals("is_panic_mode").(bool); ok && isPanic {
		return c.JSON([]models.MessageResponse{})
	}

	userID := c.Locals("user_id").(uuid.UUID)
	convID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz konuşma ID."})
	}

	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	var beforeTime *time.Time
	if beforeStr := c.Query("before"); beforeStr != "" {
		if t, err := time.Parse(time.RFC3339, beforeStr); err == nil {
			beforeTime = &t
		}
	}

	messages, err := h.chatRepo.GetMessages(c.Context(), convID, userID, limit, beforeTime)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(messages)
}

func (h *ChatHandler) ClearHistory(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	convID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz konuşma ID."})
	}

	if err := h.chatRepo.ClearConversationHistory(c.Context(), convID, userID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Sohbet geçmişi temizlenemedi.",
		})
	}

	// 6.2 Düzeltmesi: Kullanıcının tüm açık sekmelerine sohbet geçmişinin temizlendiğini bildir
	if h.hub != nil {
		clearPayload, _ := auraws.NewWSMessage("conversation_cleared", fiber.Map{
			"conversation_id": convID,
		})
		h.hub.SendToUser(userID, clearPayload)
	}

	return c.JSON(fiber.Map{
		"message": "Sohbet geçmişi başarıyla temizlendi.",
	})
}

func (h *ChatHandler) GetMessageInfo(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	msgID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz mesaj ID."})
	}

	info, err := h.chatRepo.GetMessageInfo(c.Context(), msgID, userID)
	if err != nil || info == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Mesaj bilgisi bulunamadı."})
	}

	return c.JSON(info)
}

func (h *ChatHandler) EditMessage(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	msgID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz mesaj ID."})
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := c.BodyParser(&req); err != nil || strings.TrimSpace(req.Content) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Mesaj içeriği boş olamaz."})
	}

	if h.settingsRepo != nil {
		chatSettings := h.settingsRepo.GetChatSettings(c.Context())
		if !chatSettings.AllowMessageEdit {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Mesaj düzenleme yönetici tarafından devre dışı bırakılmıştır."})
		}
		if err := h.chatRepo.EditMessage(c.Context(), msgID, userID, strings.TrimSpace(req.Content), chatSettings.EditTimeLimitMinutes); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
	} else {
		if err := h.chatRepo.EditMessage(c.Context(), msgID, userID, strings.TrimSpace(req.Content), 15); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
	}

	// WebSocket ile karşı tarafa mesaj düzenleme bildirimi bas
	msg, _ := h.chatRepo.GetMessageByID(c.Context(), msgID)
	if msg != nil {
		editPayload, _ := auraws.NewWSMessage("message_edited", fiber.Map{
			"message_id": msgID,
			"content":    req.Content,
		})
		h.hub.SendToUser(msg.RecipientID, editPayload)
		h.hub.SendToUser(msg.SenderID, editPayload)
	}

	return c.JSON(fiber.Map{"message": "Mesaj başarıyla düzenlendi."})
}

func (h *ChatHandler) DeleteMessage(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	msgID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz mesaj ID."})
	}

	deleteType := c.Query("type", "for_me") // "for_me" veya "for_all"

	if deleteType == "for_all" {
		timeLimit := 60
		if h.settingsRepo != nil {
			chatSettings := h.settingsRepo.GetChatSettings(c.Context())
			if !chatSettings.AllowDeleteForAll {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Herkesten silme özelliği devre dışı bırakılmıştır."})
			}
			timeLimit = chatSettings.DeleteTimeLimitMinutes
		}

		deletedMsg, err := h.chatRepo.DeleteMessageForAll(c.Context(), msgID, userID, timeLimit)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}

		// MinIO'daki dosyayı sil
		if deletedMsg.MediaURL != "" {
			_ = h.storage.DeleteMedia(c.Context(), deletedMsg.MediaURL)
		}

		// WebSocket ile iki tarafa da anında silindi bildirimi bas
		delPayload, _ := auraws.NewWSMessage("message_deleted", fiber.Map{
			"message_id":         msgID,
			"conversation_id":    deletedMsg.ConversationID,
			"is_deleted_for_all": true,
		})
		h.hub.SendToUser(deletedMsg.RecipientID, delPayload)
		h.hub.SendToUser(deletedMsg.SenderID, delPayload)

		return c.JSON(fiber.Map{"message": "Mesaj herkesten silindi."})
	}

	// Sadece benden sil
	if err := h.chatRepo.DeleteMessageForMe(c.Context(), msgID, userID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Mesaj silinemedi."})
	}

	// 6.2 Düzeltmesi: Kullanıcının diğer açık sekmelerine mesajın benden silindiğini bildir
	if h.hub != nil {
		convID := uuid.Nil
		msg, _ := h.chatRepo.GetMessageByID(c.Context(), msgID)
		if msg != nil {
			convID = msg.ConversationID
		}
		delPayload, _ := auraws.NewWSMessage("message_deleted_for_me", fiber.Map{
			"message_id":      msgID,
			"conversation_id": convID,
		})
		h.hub.SendToUser(userID, delPayload)
	}

	return c.JSON(fiber.Map{"message": "Mesaj sizden silindi."})
}

// DeleteMessagesBatch toplu mesaj silme HTTP handler'ı
func (h *ChatHandler) DeleteMessagesBatch(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	var req models.DeleteMessagesBatchRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz istek formatı."})
	}

	if req.ConversationID == uuid.Nil || len(req.MessageIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Konuşma ID'si ve en az bir mesaj ID'si gereklidir."})
	}

	if len(req.MessageIDs) > 100 {
		req.MessageIDs = req.MessageIDs[:100]
	}

	timeLimit := 60
	if req.ForAll && h.settingsRepo != nil {
		chatSettings := h.settingsRepo.GetChatSettings(c.Context())
		if !chatSettings.AllowDeleteForAll {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Herkesten silme özelliği devre dışı bırakılmıştır."})
		}
		timeLimit = chatSettings.DeleteTimeLimitMinutes
	}

	deletedIDs, mediaURLs, err := h.chatRepo.DeleteMessagesBatch(c.Context(), req.ConversationID, userID, req.MessageIDs, req.ForAll, timeLimit)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	if len(mediaURLs) > 0 && h.storage != nil {
		go func(urls []string) {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			for _, u := range urls {
				_ = h.storage.DeleteMedia(ctx, u)
			}
		}(mediaURLs)
	}

	conv, _ := h.chatRepo.GetConversationByID(c.Context(), req.ConversationID)

	if len(deletedIDs) > 0 {
		delPayload, _ := auraws.NewWSMessage("messages_batch_deleted", fiber.Map{
			"conversation_id":    req.ConversationID,
			"message_ids":        deletedIDs,
			"is_deleted_for_all": req.ForAll,
		})

		h.hub.SendToUser(userID, delPayload)

		if req.ForAll && conv != nil {
			otherUserID := conv.UserTwoID
			if conv.UserOneID != userID {
				otherUserID = conv.UserOneID
			}
			h.hub.SendToUser(otherUserID, delPayload)
		}
	}

	return c.JSON(fiber.Map{
		"status":      "success",
		"deleted_ids": deletedIDs,
		"for_all":     req.ForAll,
	})
}

func (h *ChatHandler) ToggleReaction(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	msgID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz mesaj ID."})
	}

	var req struct {
		Emoji string `json:"emoji"`
	}
	if err := c.BodyParser(&req); err != nil || req.Emoji == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Lütfen geçerli bir emoji belirtin."})
	}

	reactions, err := h.chatRepo.ToggleReaction(c.Context(), msgID, userID, req.Emoji)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	msg, _ := h.chatRepo.GetMessageByID(c.Context(), msgID)
	if msg != nil {
		rxPayload, _ := auraws.NewWSMessage("message_reaction", fiber.Map{
			"message_id": msgID,
			"reactions":  reactions,
		})
		h.hub.SendToUser(msg.RecipientID, rxPayload)
		h.hub.SendToUser(msg.SenderID, rxPayload)
	}

	return c.JSON(fiber.Map{
		"message":   "Reaksiyon güncellendi.",
		"reactions": reactions,
	})
}

func (h *ChatHandler) GetStarredMessages(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	list, err := h.chatRepo.GetStarredMessages(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Yıldızlı mesajlar alınamadı."})
	}
	return c.JSON(list)
}

func (h *ChatHandler) ToggleStar(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	msgID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz mesaj ID."})
	}

	starred, err := h.chatRepo.ToggleStar(c.Context(), msgID, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "İşlem başarısız."})
	}

	return c.JSON(fiber.Map{"is_starred": starred})
}

// CreateMessage - REST API üzerinden mesaj gönderir (örn: hikaye yanıtı veya harici istemciler)
func (h *ChatHandler) CreateMessage(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	convID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz konuşma ID."})
	}

	var req struct {
		Content     string     `json:"content"`
		MessageType string     `json:"message_type"`
		MediaURL    string     `json:"media_url"`
		ReplyToID   *uuid.UUID `json:"reply_to_id"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz istek formatı."})
	}

	if strings.TrimSpace(req.Content) == "" && req.MediaURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Mesaj içeriği boş olamaz."})
	}

	conv, err := h.chatRepo.GetConversationByID(c.Context(), convID)
	if err != nil || conv == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Konuşma bulunamadı."})
	}

	if conv.IsBlocked {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Bu konuşma engellenmiştir."})
	}

	var recipientID uuid.UUID
	if conv.UserOneID == userID {
		recipientID = conv.UserTwoID
	} else if conv.UserTwoID == userID {
		recipientID = conv.UserOneID
	} else {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Bu sohbete mesaj gönderme yetkiniz yok."})
	}

	msgType := req.MessageType
	if msgType == "" {
		msgType = "text"
	}

	msgModel := &models.Message{
		ConversationID: convID,
		SenderID:       userID,
		RecipientID:    recipientID,
		ReplyToID:      req.ReplyToID,
		MessageType:    msgType,
		Content:        strings.TrimSpace(req.Content),
		MediaURL:       req.MediaURL,
		MediaMetadata:  []byte("{}"),
	}

	if err := h.chatRepo.SaveMessage(c.Context(), msgModel); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Mesaj kaydedilemedi."})
	}

	// Alıcı online ise WebSocket ile ilet
	if h.hub != nil {
		// 1.6 Düzeltmesi: Gönderenin diğer açık sekmelerine de yeni mesajı bildir
		newMsgForSender := msgModel.ToResponse(userID)
		senderPayload, _ := auraws.NewWSMessage("new_message", newMsgForSender)
		h.hub.SendToUser(userID, senderPayload)

		recipientOnline := h.hub.IsUserConnected(recipientID)
		if recipientOnline {
			newMsgForRecipient := msgModel.ToResponse(recipientID)
			newMsgPayload, _ := auraws.NewWSMessage("new_message", newMsgForRecipient)
			h.hub.SendToUser(recipientID, newMsgPayload)

			deliveredIDs, deliveredAt, _ := h.chatRepo.MarkMessagesAsDelivered(c.Context(), recipientID, []uuid.UUID{msgModel.ID})
			if len(deliveredIDs) > 0 {
				deliveredPayload, _ := auraws.NewWSMessage("message_delivered", auraws.MessageDeliveredPayload{
					MessageIDs:  deliveredIDs,
					DeliveredAt: deliveredAt,
				})
				h.hub.SendToUser(userID, deliveredPayload)
			}
		}
	}

	return c.Status(fiber.StatusCreated).JSON(msgModel.ToResponse(userID))
}

// SearchMessages konuşma içindeki mesajlarda arama yapar
func (h *ChatHandler) SearchMessages(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	convID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz konuşma ID."})
	}
	q := c.Query("q")
	limit, _ := strconv.Atoi(c.Query("limit", "30"))

	results, err := h.chatRepo.SearchMessages(c.Context(), convID, userID, q, limit)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(results)
}

// BlockConversation konuşmayı engeller
func (h *ChatHandler) BlockConversation(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	convID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz konuşma ID."})
	}

	if err := h.chatRepo.BlockConversation(c.Context(), convID, userID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	conv, _ := h.chatRepo.GetConversationByID(c.Context(), convID)
	if conv != nil && h.hub != nil {
		otherID := conv.UserTwoID
		if conv.UserOneID != userID {
			otherID = conv.UserOneID
		}
		blockPayload, _ := auraws.NewWSMessage("conversation_blocked", fiber.Map{
			"conversation_id": convID,
			"blocked_by":      userID,
			"is_blocked":      true,
		})
		h.hub.SendToUser(userID, blockPayload)
		h.hub.SendToUser(otherID, blockPayload)
	}

	return c.JSON(fiber.Map{"message": "Kullanıcı engellendi.", "is_blocked": true})
}

// UnblockConversation engeli kaldırır
func (h *ChatHandler) UnblockConversation(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	convID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz konuşma ID."})
	}

	if err := h.chatRepo.UnblockConversation(c.Context(), convID, userID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	conv, _ := h.chatRepo.GetConversationByID(c.Context(), convID)
	if conv != nil && h.hub != nil {
		otherID := conv.UserTwoID
		if conv.UserOneID != userID {
			otherID = conv.UserOneID
		}
		unblockPayload, _ := auraws.NewWSMessage("conversation_unblocked", fiber.Map{
			"conversation_id": convID,
			"is_blocked":      false,
		})
		h.hub.SendToUser(userID, unblockPayload)
		h.hub.SendToUser(otherID, unblockPayload)
	}

	return c.JSON(fiber.Map{"message": "Engel kaldırıldı.", "is_blocked": false})
}

// GetActiveListenTogetherSession aktif Birlikte Dinle oturumunu Redis'ten getirir (Item 6.4)
func (h *ChatHandler) GetActiveListenTogetherSession(c *fiber.Ctx) error {
	convID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz konuşma ID."})
	}
	if h.rdb == nil {
		return c.JSON(fiber.Map{"active": false})
	}

	key := "listen_together:" + convID.String()
	val, err := h.rdb.Get(c.Context(), key).Result()
	if err != nil || val == "" {
		return c.JSON(fiber.Map{"active": false})
	}

	var session auraws.ListenTogetherSyncPayload
	if err := json.Unmarshal([]byte(val), &session); err != nil {
		return c.JSON(fiber.Map{"active": false})
	}

	return c.JSON(fiber.Map{
		"active":  true,
		"session": session,
	})
}

// GetConversationMedia konuşmaya ait tüm medya, ses, link ve belgeleri döner
func (h *ChatHandler) GetConversationMedia(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	convID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz konuşma ID."})
	}

	messages, err := h.chatRepo.GetConversationAssets(c.Context(), convID, userID)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(messages)
}


