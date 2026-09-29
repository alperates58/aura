package handlers

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"aura/internal/config"
	"aura/internal/database"
	"aura/internal/middleware"
	"aura/internal/models"
	auraredis "aura/internal/redis"
	"aura/internal/storage"
	auraws "aura/internal/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type UserHandler struct {
	cfg             config.Config
	userRepo        *database.UserRepository
	storage         *storage.StorageService
	presenceService *auraredis.PresenceService
	accessRepo      *database.AccessRepository
	hub             *auraws.Hub
	rdb             *redis.Client
}

func NewUserHandler(
	cfg config.Config,
	userRepo *database.UserRepository,
	storage *storage.StorageService,
	presenceService *auraredis.PresenceService,
	accessRepo *database.AccessRepository,
	hub *auraws.Hub,
	rdb *redis.Client,
) *UserHandler {
	return &UserHandler{
		cfg:             cfg,
		userRepo:        userRepo,
		storage:         storage,
		presenceService: presenceService,
		accessRepo:      accessRepo,
		hub:             hub,
		rdb:             rdb,
	}
}

func (h *UserHandler) setAuthCookies(c *fiber.Ctx, accessToken, refreshToken string) {
	isSecure := h.cfg.Environment == "production"
	cookiePath := h.cfg.AppBasePath
	if cookiePath == "" {
		cookiePath = "/"
	}

	c.Cookie(&fiber.Cookie{
		Name:     "access_token",
		Value:    accessToken,
		Expires:  time.Now().Add(time.Duration(h.cfg.JWTAccessExpiryMin) * time.Minute),
		HTTPOnly: true,
		Secure:   isSecure,
		SameSite: "Lax",
		Path:     cookiePath,
	})

	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    refreshToken,
		Expires:  time.Now().Add(time.Duration(h.cfg.JWTRefreshExpiryDays) * 24 * time.Hour),
		HTTPOnly: true,
		Secure:   isSecure,
		SameSite: "Lax",
		Path:     cookiePath,
	})
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

func (h *UserHandler) SetPanicPassword(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	var req models.SetPanicPasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Geçersiz istek formatı.",
		})
	}

	req.PanicLogin = strings.TrimSpace(req.PanicLogin)
	req.PanicPassword = strings.TrimSpace(req.PanicPassword)
	redirectURL := strings.TrimSpace(req.PanicRedirectURL)
	if redirectURL == "" {
		redirectURL = "https://zodiacrf.com"
	} else {
		if !strings.HasPrefix(redirectURL, "http://") && !strings.HasPrefix(redirectURL, "https://") {
			redirectURL = "https://" + redirectURL
		}
		redirectURL = strings.Replace(redirectURL, "://www.zodiacrf.com", "://zodiacrf.com", 1)
	}

	currentUser, err := h.userRepo.GetUserByID(c.Context(), userID)
	if err != nil || currentUser == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Kullanıcı bulunamadı."})
	}

	// 1. Panik modunu tamamen kaldırma isteği (Kodu Kaldır butonu hem login hem password boş yollar)
	if req.PanicLogin == "" && req.PanicPassword == "" {
		if err := h.userRepo.SetPanicPassword(c.Context(), userID, "", "", redirectURL); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Panik şifresi kaldırılamadı.",
			})
		}
		return c.JSON(fiber.Map{
			"message":            "Panik şifresi başarıyla devre dışı bırakıldı.",
			"has_panic_password": false,
			"panic_login":        "",
			"panic_redirect_url": redirectURL,
		})
	}

	// 2. Şifre alanı boş bırakılmışsa:
	var hash string
	if req.PanicPassword == "" {
		// Kullanıcının zaten aktif bir panik şifresi varsa, ESKİ ŞİFREYİ KORU
		if currentUser.PanicPasswordHash != "" {
			hash = currentUser.PanicPasswordHash
		} else {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "İlk kez panik kodu kurarken bir panik şifresi belirlemeniz gerekir.",
			})
		}
	} else {
		// Yeni şifre belirleniyor:
		if len(req.PanicPassword) < 6 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Panik şifresi en az 6 karakter olmalıdır.",
			})
		}
		if middleware.CheckPasswordHash(req.PanicPassword, currentUser.PasswordHash) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Panik şifresi ana giriş şifrenizle aynı olamaz. Lütfen farklı bir şifre belirleyin.",
			})
		}
		var hErr error
		hash, hErr = middleware.HashPassword(req.PanicPassword)
		if hErr != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Şifre hash'lenemedi.",
			})
		}
	}

	if req.PanicLogin == "" {
		if currentUser.PanicLogin != "" {
			req.PanicLogin = currentUser.PanicLogin
		} else {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Lütfen panik durumunda kullanılacak sahte kullanıcı adı veya e-posta belirleyin.",
			})
		}
	}

	// Normal şifre veya kullanıcı adı/email ile aynı olup olmadığını denetle
	if strings.EqualFold(req.PanicLogin, currentUser.Username) || strings.EqualFold(req.PanicLogin, currentUser.Email) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Panik giriş adı gerçek kullanıcı adınız veya e-postanızla aynı olamaz. Lütfen sahte bir kimlik belirleyin.",
		})
	}

	// Başka bir kullanıcının bu panic_login'i kullanıp kullanmadığını denetle
	existingUser, _ := h.userRepo.GetUserByPanicLogin(c.Context(), req.PanicLogin)
	if existingUser != nil && existingUser.ID != userID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Bu panik giriş adı zaten kullanımda. Lütfen başka bir ad/e-posta seçin.",
		})
	}

	if err := h.userRepo.SetPanicPassword(c.Context(), userID, req.PanicLogin, hash, redirectURL); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Panik şifresi kaydedilemedi.",
		})
	}

	return c.JSON(fiber.Map{
		"message":            "Panik girişi (kullanıcı/şifre/link) başarıyla kaydedildi.",
		"has_panic_password": true,
		"panic_login":        req.PanicLogin,
		"panic_redirect_url": redirectURL,
	})
}

func (h *UserHandler) KillSessions(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)
	username, _ := c.Locals("username").(string)
	if username == "" {
		if u, err := h.userRepo.GetUserByID(c.Context(), userID); err == nil && u != nil {
			username = u.Username
		}
	}

	excludeSessionID := strings.TrimSpace(c.Get("X-Session-ID"))

	newVer, err := h.userRepo.IncrementTokenVersion(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Oturumlar sonlandırılamadı.",
		})
	}

	// Redis önbelleğindeki token_version değerini güncelle
	if h.rdb != nil {
		_ = h.rdb.Set(c.Context(), "user:"+userID.String()+":token_version", newVer, 24*time.Hour).Err()
	}

	// İşlemi yapan aktif cihaza yeni çerezleri ver (böylece mevcut cihaz düşmez)
	newAccessToken, err := middleware.GenerateCustomAccessToken(userID, username, h.cfg.JWTAccessSecret, h.cfg.JWTAccessExpiryMin, newVer, false)
	if err == nil {
		newRefreshToken, err := middleware.GenerateCustomRefreshToken(userID, h.cfg.JWTRefreshSecret, h.cfg.JWTRefreshExpiryDays, newVer, false)
		if err == nil {
			h.setAuthCookies(c, newAccessToken, newRefreshToken)
		}
	}

	// Diğer tüm cihazların bağlantısını uzaktan sonlandır
	if h.hub != nil {
		h.hub.TerminateOtherSessions(userID, excludeSessionID, newVer)

		// Güvenlik botu tüm kullanıcılara mesaj atsın!
		nowStr := time.Now().Format("15:04:05")
		chatMsg := fmt.Sprintf(
			"🛡️ **AURA GÜVENLİK BİLGİLENDİRMESİ**\n\n@%s kullanıcısı diğer tüm aktif cihaz ve oturumlarını tek tıkla uzaktan sonlandırdı.\n\n🌐 **İşlem IP:** %s\n⏰ **Zaman:** %s\n\nYetkisiz cihazların erişimi anında kesildi.",
			username, c.IP(), nowStr,
		)
		h.hub.SendSecurityNotificationMessage(nil, chatMsg)
	}

	// Giriş loglarına kaydet
	if h.accessRepo != nil {
		_ = h.accessRepo.LogAccess(c.Context(), userID, c.IP(), c.Get("User-Agent"))
	}

	return c.JSON(fiber.Map{
		"message":       "Tüm diğer cihaz ve oturumlar başarıyla sonlandırıldı.",
		"token_version": newVer,
		"access_token":  newAccessToken,
	})
}

func (h *UserHandler) RegenerateSecurityCode(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	newSalt := uuid.New().String()
	if err := h.userRepo.UpdateSecuritySalt(c.Context(), userID, newSalt); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Güvenlik kodu yenilenemedi.",
		})
	}

	return c.JSON(fiber.Map{
		"message":              "Uçtan uca güvenlik kodunuz başarıyla yenilendi.",
		"security_number_salt": newSalt,
	})
}

