package handlers

import (
	"encoding/json"
	"strings"

	"aura/internal/database"
	"aura/internal/models"
	auraredis "aura/internal/redis"
	"aura/internal/storage"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type UserHandler struct {
	userRepo        *database.UserRepository
	storage         *storage.StorageService
	presenceService *auraredis.PresenceService
	accessRepo      *database.AccessRepository
}

func NewUserHandler(
	userRepo *database.UserRepository,
	storage *storage.StorageService,
	presenceService *auraredis.PresenceService,
	accessRepo *database.AccessRepository,
) *UserHandler {
	return &UserHandler{
		userRepo:        userRepo,
		storage:         storage,
		presenceService: presenceService,
		accessRepo:      accessRepo,
	}
}

func (h *UserHandler) UpdateProfile(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	var req models.UpdateProfileRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Geçersiz istek formatı.",
		})
	}

	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if req.DisplayName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Görünen ad boş bırakılamaz.",
		})
	}

	if err := h.userRepo.UpdateProfile(c.Context(), userID, req.DisplayName, req.Bio); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Profil güncellenemedi.",
		})
	}

	user, _ := h.userRepo.GetUserByID(c.Context(), userID)
	return c.JSON(user.ToResponse())
}

func (h *UserHandler) UploadAvatar(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	fileHeader, err := c.FormFile("avatar")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Lütfen geçerli bir avatar dosyası seçin.",
		})
	}

	file, err := fileHeader.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Dosya açılamadı.",
		})
	}
	defer file.Close()

	avatarURL, err := h.storage.UploadAvatar(c.Context(), userID, file, fileHeader)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	if err := h.userRepo.UpdateAvatar(c.Context(), userID, avatarURL); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Avatar veritabanına kaydedilemedi.",
		})
	}

	return c.JSON(fiber.Map{
		"avatar_url": avatarURL,
		"message":    "Profil fotoğrafı başarıyla güncellendi.",
	})
}

func (h *UserHandler) UpdatePrivacy(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	var req models.UpdatePrivacyRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Geçersiz istek formatı.",
		})
	}

	user, err := h.userRepo.GetUserByID(c.Context(), userID)
	if err != nil || user == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Kullanıcı bulunamadı."})
	}

	var currentSettings models.PrivacySettings
	if len(user.PrivacySettings) > 0 {
		_ = json.Unmarshal(user.PrivacySettings, &currentSettings)
	} else {
		currentSettings = models.DefaultPrivacySettings()
	}

	if req.ReadReceipts != nil {
		currentSettings.ReadReceipts = *req.ReadReceipts
	}
	if req.LastSeen != nil {
		currentSettings.LastSeen = *req.LastSeen
	}
	if req.AllowCalls != nil {
		currentSettings.AllowCalls = *req.AllowCalls
	}
	if req.SoundAlerts != nil {
		currentSettings.SoundAlerts = *req.SoundAlerts
	}

	if err := h.userRepo.UpdatePrivacy(c.Context(), userID, currentSettings); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Gizlilik ayarları güncellenemedi.",
		})
	}

	return c.JSON(fiber.Map{
		"message":          "Gizlilik ayarları güncellendi.",
		"privacy_settings": currentSettings,
	})
}

func (h *UserHandler) SearchUsers(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	q := strings.TrimSpace(c.Query("q"))

	// 1 karakter girilmişse arama yapma, 0 (tüm rehber) veya >= 2 ise getir
	if len(q) == 1 {
		return c.JSON([]models.UserResponse{})
	}

	users, err := h.userRepo.SearchUsers(c.Context(), q, userID, 50)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Arama işlemi başarısız.",
		})
	}

	for i := range users {
		if h.presenceService != nil && h.presenceService.IsUserOnline(c.Context(), users[i].ID) {
			users[i].OnlineStatus = 1
		} else {
			users[i].OnlineStatus = 0
		}
	}

	return c.JSON(users)
}

func (h *UserHandler) GetAccessLogs(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	if h.accessRepo == nil {
		return c.JSON([]models.AccessLog{})
	}

	logs, err := h.accessRepo.GetUserAccessLogs(c.Context(), userID, 20)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Giriş kayıtları alınamadı.",
		})
	}

	return c.JSON(logs)
}
