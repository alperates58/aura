package handlers

import (
	"encoding/json"
	"fmt"
	"time"

	"aura/internal/database"
	"aura/internal/livekit"
	"aura/internal/models"
	auraws "aura/internal/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type CallHandler struct {
	callRepo       *database.CallRepository
	chatRepo       *database.ChatRepository
	userRepo       *database.UserRepository
	livekitService *livekit.LiveKitService
	hub            *auraws.Hub
	redisClient    *redis.Client
	settingsRepo   *database.SettingsRepository
}

func NewCallHandler(
	callRepo *database.CallRepository,
	chatRepo *database.ChatRepository,
	userRepo *database.UserRepository,
	livekitService *livekit.LiveKitService,
	hub *auraws.Hub,
	redisClient *redis.Client,
	settingsRepo *database.SettingsRepository,
) *CallHandler {
	return &CallHandler{
		callRepo:       callRepo,
		chatRepo:       chatRepo,
		userRepo:       userRepo,
		livekitService: livekitService,
		hub:            hub,
		redisClient:    redisClient,
		settingsRepo:   settingsRepo,
	}
}

type InitiateCallRequest struct {
	ConversationID uuid.UUID `json:"conversation_id"`
	CallType       string    `json:"call_type"` // "audio" veya "video"
}

func (h *CallHandler) InitiateCall(c *fiber.Ctx) error {
	callerID := c.Locals("user_id").(uuid.UUID)

	var req InitiateCallRequest
	if err := c.BodyParser(&req); err != nil || req.ConversationID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz arama parametreleri."})
	}
	if req.CallType != "audio" && req.CallType != "video" {
		req.CallType = "audio"
	}

	// 0. Sistem Arama Parametreleri Denetimi
	if h.settingsRepo != nil {
		callSettings := h.settingsRepo.GetCallSettings(c.Context())
		if req.CallType == "audio" && !callSettings.EnableAudioCalls {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Sesli arama özelliği yönetici tarafından geçici olarak kapatılmıştır.",
			})
		}
		if req.CallType == "video" && !callSettings.EnableVideoCalls {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Görüntülü arama özelliği yönetici tarafından geçici olarak kapatılmıştır.",
			})
		}
	}

	// 1. Konuşmayı ve Karşı Tarafı Bul
	conv, err := h.chatRepo.GetConversationByID(c.Context(), req.ConversationID)
	if err != nil || conv == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Konuşma bulunamadı."})
	}

	if conv.UserOneID != callerID && conv.UserTwoID != callerID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Bu konuşmada arama başlatma yetkiniz yok."})
	}

	if conv.IsBlocked {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Bu kullanıcı ile iletişim engellenmiştir."})
	}

	receiverID := conv.UserTwoID
	if conv.UserOneID != callerID {
		receiverID = conv.UserOneID
	}

	// 2. Arayan ve Alıcı Bilgileri
	caller, err := h.userRepo.GetUserByID(c.Context(), callerID)
	if err != nil || caller == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Arayan kullanıcı bulunamadı."})
	}

	receiver, err := h.userRepo.GetUserByID(c.Context(), receiverID)
	if err != nil || receiver == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Aranan kullanıcı bulunamadı."})
	}

	// 3. Karşı taraf aramalara izin veriyor mu?
	var privacy models.PrivacySettings
	if len(receiver.PrivacySettings) > 0 {
		_ = json.Unmarshal(receiver.PrivacySettings, &privacy)
		if !privacy.AllowCalls {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":  "Kullanıcı gelen aramaları kabul etmiyor.",
				"reason": "busy",
			})
		}
	}

	// 4. Karşı taraf meşgul mü? (Redis kontrolü)
	inCallKey := fmt.Sprintf("in_call:%s", receiverID.String())
	if exists, _ := h.redisClient.Exists(c.Context(), inCallKey).Result(); exists > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error":  "Kullanıcı şu anda başka bir görüşmede.",
			"reason": "busy",
		})
	}

	// 5. LiveKit Oda Adı ve Tokenları Üret
	roomName := fmt.Sprintf("call_%s_%d", req.ConversationID.String()[:8], time.Now().Unix())

	callerToken, err := h.livekitService.CreateRoomToken(roomName, callerID, caller.DisplayName)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Arama tokenı üretilemedi."})
	}

	receiverToken, err := h.livekitService.CreateRoomToken(roomName, receiverID, receiver.DisplayName)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Alıcı tokenı üretilemedi."})
	}

	// 6. DB Çağrı Kaydı Aç
	callLog, err := h.callRepo.CreateCallLog(c.Context(), req.ConversationID, callerID, receiverID, req.CallType, "ringing")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Çağrı kaydı oluşturulamadı."})
	}

	// 7. Redis Arama Kilitleri (60 saniye arama süresi)
	callerInCall := fmt.Sprintf("in_call:%s", callerID.String())
	h.redisClient.Set(c.Context(), inCallKey, callLog.ID.String(), 60*time.Second)
	h.redisClient.Set(c.Context(), callerInCall, callLog.ID.String(), 60*time.Second)

	// Canlı SFU URL'sini belirle: localhost veya IP üzerinde çalışırken :7880 portunu koru (Item 3.5)
	livekitURL := h.livekitService.GetPublicURL()
	reqHost := c.Hostname()
	if livekitURL == "" || livekitURL == fmt.Sprintf("https://livekit.%s", reqHost) || livekitURL == fmt.Sprintf("http://livekit.%s", reqHost) {
		proto := "https"
		port := ""
		if c.Protocol() == "http" && (reqHost == "localhost" || reqHost == "127.0.0.1") {
			proto = "http"
			port = ":7880"
		}
		livekitURL = fmt.Sprintf("%s://%s%s", proto, reqHost, port)
	}

	// 8. WebSocket ile Alıcıya incoming_call Sinyali Bas
	incomingPayload, _ := auraws.NewWSMessage("incoming_call", fiber.Map{
		"call_id":         callLog.ID,
		"conversation_id": req.ConversationID,
		"caller": fiber.Map{
			"id":           caller.ID,
			"display_name": caller.DisplayName,
			"avatar_url":   caller.AvatarURL,
		},
		"call_type":   req.CallType,
		"room_name":   roomName,
		"room_token":  receiverToken,
		"livekit_url": livekitURL,
	})
	h.hub.SendToUser(receiverID, incomingPayload)

	return c.JSON(fiber.Map{
		"call_id":     callLog.ID,
		"room_name":   roomName,
		"token":       callerToken,
		"livekit_url": livekitURL,
	})
}

type AcceptCallRequest struct {
	CallID         uuid.UUID `json:"call_id"`
	ConversationID uuid.UUID `json:"conversation_id"`
}

func (h *CallHandler) AcceptCall(c *fiber.Ctx) error {
	receiverID := c.Locals("user_id").(uuid.UUID)

	var req AcceptCallRequest
	if err := c.BodyParser(&req); err != nil || req.CallID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz istek."})
	}

	callLog, err := h.callRepo.GetCallByID(c.Context(), req.CallID)
	if err != nil || callLog == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Arama kaydı bulunamadı."})
	}
	if callLog.ReceiverID != receiverID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Bu aramayı yalnızca aranan taraf kabul edebilir."})
	}

	// Redis kilitlerini görüşme süresine uzat (2 saat)
	conv, _ := h.chatRepo.GetConversationByID(c.Context(), req.ConversationID)
	if conv != nil {
		callerID := conv.UserOneID
		if callerID == receiverID {
			callerID = conv.UserTwoID
		}

		h.redisClient.Expire(c.Context(), fmt.Sprintf("in_call:%s", receiverID.String()), 2*time.Hour)
		h.redisClient.Expire(c.Context(), fmt.Sprintf("in_call:%s", callerID.String()), 2*time.Hour)

		// Arayana kabul sinyali gönder
		acceptedPayload, _ := auraws.NewWSMessage("call_answered", fiber.Map{
			"call_id": req.CallID,
		})
		h.hub.SendToUser(callerID, acceptedPayload)
		// Alıcıya da sinyal bas (tüm açık oturumlarında zil sussun)
		h.hub.SendToUser(receiverID, acceptedPayload)
	}

	return c.JSON(fiber.Map{"status": "accepted"})
}

type RejectCallRequest struct {
	CallID         uuid.UUID `json:"call_id"`
	ConversationID uuid.UUID `json:"conversation_id"`
	Reason         string    `json:"reason"`
}

func (h *CallHandler) RejectCall(c *fiber.Ctx) error {
	rejecterID := c.Locals("user_id").(uuid.UUID)

	var req RejectCallRequest
	if err := c.BodyParser(&req); err != nil || req.CallID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz istek."})
	}

	callLog, err := h.callRepo.GetCallByID(c.Context(), req.CallID)
	if err != nil || callLog == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Arama kaydı bulunamadı."})
	}
	if callLog.CallerID != rejecterID && callLog.ReceiverID != rejecterID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Bu aramaya müdahale etme yetkiniz yok."})
	}

	reason := req.Reason
	if reason == "" {
		reason = "rejected"
	}

	_ = h.callRepo.UpdateCallStatus(c.Context(), req.CallID, reason, 0)

	// Redis kilitlerini kaldır
	h.redisClient.Del(c.Context(), fmt.Sprintf("in_call:%s", rejecterID.String()))

	conv, _ := h.chatRepo.GetConversationByID(c.Context(), req.ConversationID)
	if conv != nil {
		otherID := conv.UserOneID
		if otherID == rejecterID {
			otherID = conv.UserTwoID
		}
		h.redisClient.Del(c.Context(), fmt.Sprintf("in_call:%s", otherID.String()))

		rejectedPayload, _ := auraws.NewWSMessage("call_rejected", fiber.Map{
			"call_id": req.CallID,
			"reason":  reason,
		})
		h.hub.SendToUser(otherID, rejectedPayload)
		h.hub.SendToUser(rejecterID, rejectedPayload)

		// Reddedilen arama kaydı mesajı ekle
		isCaller := false
		callType := callLog.CallType
		senderID := otherID
		recipientID := rejecterID
		if rejecterID == callLog.CallerID {
			isCaller = true
		}

		var content string
		if callType == "video" {
			if isCaller {
				content = "📹 Cevapsız Görüntülü Arama"
			} else {
				content = "📹 Reddedilen Görüntülü Arama"
			}
		} else {
			if isCaller {
				content = "📞 Cevapsız Sesli Arama"
			} else {
				content = "📞 Reddedilen Sesli Arama"
			}
		}

		callMsg := &models.Message{
			ConversationID: req.ConversationID,
			SenderID:       senderID,
			RecipientID:    recipientID,
			MessageType:    "call_log",
			Content:        content,
		}
		if err := h.chatRepo.SaveMessage(c.Context(), callMsg); err == nil && h.hub != nil {
			// 3.2 Düzeltmesi: Reddedilen/cevapsız arama kaydını anında WebSocket üzerinden ilet
			senderResp := callMsg.ToResponse(senderID)
			recvResp := callMsg.ToResponse(recipientID)
			sPayload, _ := auraws.NewWSMessage("new_message", senderResp)
			rPayload, _ := auraws.NewWSMessage("new_message", recvResp)
			h.hub.SendToUser(senderID, sPayload)
			h.hub.SendToUser(recipientID, rPayload)
		}
	}

	return c.JSON(fiber.Map{"status": "rejected"})
}

type EndCallRequest struct {
	CallID          uuid.UUID `json:"call_id"`
	ConversationID  uuid.UUID `json:"conversation_id"`
	DurationSeconds int       `json:"duration_seconds"`
}

func (h *CallHandler) EndCall(c *fiber.Ctx) error {
	enderID := c.Locals("user_id").(uuid.UUID)

	var req EndCallRequest
	if err := c.BodyParser(&req); err != nil || req.CallID == uuid.Nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz istek."})
	}

	callLog, err := h.callRepo.GetCallByID(c.Context(), req.CallID)
	if err != nil || callLog == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Arama kaydı bulunamadı."})
	}
	if callLog.CallerID != enderID && callLog.ReceiverID != enderID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Bu aramayı sonlandırma yetkiniz yok."})
	}

	// 3.3 Düzeltmesi: İstemcinin ilettiği duration_seconds değerini sunucu tarafında doğrula
	maxDuration := 0
	if callLog.StartedAt != nil {
		maxDuration = int(time.Since(*callLog.StartedAt).Seconds()) + 10
	} else {
		maxDuration = int(time.Since(callLog.CreatedAt).Seconds()) + 10
	}
	if maxDuration < 0 {
		maxDuration = 0
	}
	if req.DurationSeconds < 0 || req.DurationSeconds > maxDuration {
		req.DurationSeconds = maxDuration - 10
		if req.DurationSeconds < 0 {
			req.DurationSeconds = 0
		}
	}

	_ = h.callRepo.UpdateCallStatus(c.Context(), req.CallID, "completed", req.DurationSeconds)

	h.redisClient.Del(c.Context(), fmt.Sprintf("in_call:%s", enderID.String()))

	conv, _ := h.chatRepo.GetConversationByID(c.Context(), req.ConversationID)
	if conv != nil {
		otherID := conv.UserOneID
		if otherID == enderID {
			otherID = conv.UserTwoID
		}
		h.redisClient.Del(c.Context(), fmt.Sprintf("in_call:%s", otherID.String()))

		endPayload, _ := auraws.NewWSMessage("call_ended", fiber.Map{
			"call_id":          req.CallID,
			"duration_seconds": req.DurationSeconds,
		})
		h.hub.SendToUser(otherID, endPayload)
		h.hub.SendToUser(enderID, endPayload)

		// Sohbet içine arama kaydı mesajı ekle (video vs sesli arama ayrımı)
		callLog, _ := h.callRepo.GetCallByID(c.Context(), req.CallID)
		callType := "audio"
		senderID := enderID
		recipientID := otherID
		if callLog != nil {
			callType = callLog.CallType
			senderID = callLog.CallerID
			recipientID = callLog.ReceiverID
		}

		mins := req.DurationSeconds / 60
		secs := req.DurationSeconds % 60
		var content string
		if callType == "video" {
			if req.DurationSeconds == 0 {
				content = "📹 Cevapsız Görüntülü Arama"
			} else {
				content = fmt.Sprintf("📹 Görüntülü Arama (%02d:%02d)", mins, secs)
			}
		} else {
			if req.DurationSeconds == 0 {
				content = "📞 Cevapsız Sesli Arama"
			} else {
				content = fmt.Sprintf("📞 Sesli Arama (%02d:%02d)", mins, secs)
			}
		}

		callMsg := &models.Message{
			ConversationID: req.ConversationID,
			SenderID:       senderID,
			RecipientID:    recipientID,
			MessageType:    "call_log",
			Content:        content,
		}
		if err := h.chatRepo.SaveMessage(c.Context(), callMsg); err == nil && h.hub != nil {
			// 3.2 Düzeltmesi: Sonlanan görüşme kaydını anında WebSocket üzerinden ilet
			senderResp := callMsg.ToResponse(senderID)
			recvResp := callMsg.ToResponse(recipientID)
			sPayload, _ := auraws.NewWSMessage("new_message", senderResp)
			rPayload, _ := auraws.NewWSMessage("new_message", recvResp)
			h.hub.SendToUser(senderID, sPayload)
			h.hub.SendToUser(recipientID, rPayload)
		}
	}

	return c.JSON(fiber.Map{"status": "ended"})
}
