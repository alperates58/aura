package handlers

import (
	"context"
	"encoding/json"

	"aura/internal/database"
	"aura/internal/models"
	"aura/internal/push"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type PushHandler struct {
	pushRepo     *database.PushRepository
	vapidService *push.VAPIDService
	userRepo     *database.UserRepository
}

func NewPushHandler(pushRepo *database.PushRepository, vapidService *push.VAPIDService, userRepo *database.UserRepository) *PushHandler {
	return &PushHandler{
		pushRepo:     pushRepo,
		vapidService: vapidService,
		userRepo:     userRepo,
	}
}

func (h *PushHandler) GetVapidKey(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"public_key": h.vapidService.PublicKey,
	})
}

type SubscribeRequest struct {
	Endpoint string `json:"endpoint"`
	P256dh   string `json:"p256dh"`
	Auth     string `json:"auth"`
}

func (h *PushHandler) Subscribe(c *fiber.Ctx) error {
	var userID uuid.UUID
	if val, ok := c.Locals("user_id").(uuid.UUID); ok {
		userID = val
	} else if val, ok := c.Locals("userID").(uuid.UUID); ok {
		userID = val
	}
	if userID == uuid.Nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Yetkisiz erişim"})
	}

	var req SubscribeRequest
	if err := c.BodyParser(&req); err != nil || req.Endpoint == "" || req.P256dh == "" || req.Auth == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz abonelik bilgileri"})
	}

	userAgent := c.Get("User-Agent")
	if err := h.pushRepo.SaveSubscription(context.Background(), userID, req.Endpoint, req.P256dh, req.Auth, userAgent); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Abonelik kaydedilemedi"})
	}

	return c.JSON(fiber.Map{
		"message": "Push bildirimi aboneliği başarıyla kaydedildi.",
	})
}

type UnsubscribeRequest struct {
	Endpoint string `json:"endpoint"`
}

func (h *PushHandler) Unsubscribe(c *fiber.Ctx) error {
	var req UnsubscribeRequest
	if err := c.BodyParser(&req); err != nil || req.Endpoint == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz endpoint"})
	}

	if err := h.pushRepo.DeleteSubscription(context.Background(), req.Endpoint); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Abonelik silinemedi"})
	}

	return c.JSON(fiber.Map{
		"message": "Push aboneliği iptal edildi.",
	})
}

func (h *PushHandler) TestNotification(c *fiber.Ctx) error {
	var userID uuid.UUID
	if val, ok := c.Locals("user_id").(uuid.UUID); ok {
		userID = val
	} else if val, ok := c.Locals("userID").(uuid.UUID); ok {
		userID = val
	}
	if userID == uuid.Nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Yetkisiz erişim"})
	}

	subs, err := h.pushRepo.GetSubscriptionsForUser(context.Background(), userID)
	if err != nil || len(subs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Bu cihaz için aktif bir push aboneliği bulunamadı. Lütfen önce bildirim izni verin.",
		})
	}

	silent := false
	if h.userRepo != nil {
		user, _ := h.userRepo.GetUserByID(c.Context(), userID)
		if user != nil && len(user.PrivacySettings) > 0 {
			var ps models.PrivacySettings
			if err := json.Unmarshal(user.PrivacySettings, &ps); err == nil {
				if !ps.SoundAlerts {
					silent = true
				}
			}
		}
	}

	sentCount := 0
	for _, sub := range subs {
		if err := h.vapidService.SendPush(
			sub,
			"Aura Test Bildirimi",
			"Tebrikler! Web Push bildirimleri başarıyla çalışıyor.",
			"/icon-192.png",
			"/",
			silent,
		); err == nil {
			sentCount++
		}
	}

	return c.JSON(fiber.Map{
		"message":    "Test bildirimi gönderildi.",
		"sent_count": sentCount,
	})
}
