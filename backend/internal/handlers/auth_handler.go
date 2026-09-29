package handlers

import (
	"fmt"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"aura/internal/config"
	"aura/internal/database"
	"aura/internal/middleware"
	"aura/internal/models"
	auraredis "aura/internal/redis"
	auraws "aura/internal/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

var usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_]{3,30}$`)

func isStrongPassword(pass string) bool {
	if len(pass) < 8 {
		return false
	}
	hasDigit := false
	hasLetter := false
	for _, ch := range pass {
		if ch >= '0' && ch <= '9' {
			hasDigit = true
		} else if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') {
			hasLetter = true
		}
	}
	return hasDigit && hasLetter
}

type AuthHandler struct {
	cfg             config.Config
	userRepo        *database.UserRepository
	presenceService *auraredis.PresenceService
	hub             *auraws.Hub
	accessRepo      *database.AccessRepository
	settingsRepo    *database.SettingsRepository
}

func NewAuthHandler(
	cfg config.Config,
	userRepo *database.UserRepository,
	presenceService *auraredis.PresenceService,
	hub *auraws.Hub,
	accessRepo *database.AccessRepository,
	settingsRepo *database.SettingsRepository,
) *AuthHandler {
	return &AuthHandler{
		cfg:             cfg,
		userRepo:        userRepo,
		presenceService: presenceService,
		hub:             hub,
		accessRepo:      accessRepo,
		settingsRepo:    settingsRepo,
	}
}

func (h *AuthHandler) setAuthCookies(c *fiber.Ctx, accessToken, refreshToken string) {
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

func (h *AuthHandler) clearAuthCookies(c *fiber.Ctx) {
	cookiePath := h.cfg.AppBasePath
	if cookiePath == "" {
		cookiePath = "/"
	}

	c.Cookie(&fiber.Cookie{
		Name:     "access_token",
		Value:    "",
		Expires:  time.Now().Add(-1 * time.Hour),
		HTTPOnly: true,
		Path:     cookiePath,
	})
	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    "",
		Expires:  time.Now().Add(-1 * time.Hour),
		HTTPOnly: true,
		Path:     cookiePath,
	})
}

func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req models.RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Geçersiz istek formatı.",
		})
	}

	req.Username = strings.TrimSpace(req.Username)
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	// 0. Sistem Ayarları Denetimi
	if h.settingsRepo != nil {
		siteInfo := h.settingsRepo.GetSiteInfo(c.Context())
		if !siteInfo.AllowRegistration {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Yeni üye kaydı yönetici tarafından durdurulmuştur.",
			})
		}
		if siteInfo.MaintenanceMode {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"error": "Sistem şu anda bakım modundadır.",
			})
		}
		sec := h.settingsRepo.GetSecuritySettings(c.Context())
		if sec.RequireStrongPasswords {
			if !isStrongPassword(req.Password) {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"error": "Güçlü şifre zorunludur: Şifreniz en az 8 karakter olmalı, en az bir harf ve bir rakam içermelidir.",
				})
			}
		}
	}

	// Doğrulamalar
	if !usernameRegex.MatchString(req.Username) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Kullanıcı adı 3-30 karakter uzunluğunda olmalı ve sadece harf, rakam veya alt çizgi içermelidir.",
		})
	}

	if req.DisplayName == "" {
		req.DisplayName = req.Username
	}

	if _, err := mail.ParseAddress(req.Email); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Lütfen geçerli bir e-posta adresi girin.",
		})
	}

	if len(req.Password) < 6 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Şifreniz en az 6 karakter olmalıdır.",
		})
	}

	// Benzersizlik denetimi
	exists, msg, err := h.userRepo.CheckUserExists(c.Context(), req.Username, req.Email)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Veritabanı kontrolü başarısız.",
		})
	}
	if exists {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": msg,
		})
	}

	// Şifre hash'leme
	hash, err := middleware.HashPassword(req.Password)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Şifre şifrelenemedi.",
		})
	}

	user := models.User{
		Username:     req.Username,
		DisplayName:  req.DisplayName,
		Email:        req.Email,
		PasswordHash: hash,
		AvatarURL:    "",
		Bio:          "Merhaba, ben Aura kullanıyorum!",
		Role:         "member",
		OnlineStatus: 0, // WebSocket bağlanana kadar offline
	}

	if err := h.userRepo.CreateUser(c.Context(), &user); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Kullanıcı kaydı oluşturulamadı.",
		})
	}

	// Token üretimi
	accessToken, err := middleware.GenerateAccessToken(user.ID, user.Username, h.cfg.JWTAccessSecret, h.cfg.JWTAccessExpiryMin)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Erişim anahtarı üretilemedi."})
	}

	refreshToken, err := middleware.GenerateRefreshToken(user.ID, h.cfg.JWTRefreshSecret, h.cfg.JWTRefreshExpiryDays)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Yenileme anahtarı üretilemedi."})
	}

	h.setAuthCookies(c, accessToken, refreshToken)

	if h.accessRepo != nil {
		_ = h.accessRepo.LogAccess(c.Context(), user.ID, c.IP(), c.Get("User-Agent"))
	}

	return c.Status(fiber.StatusCreated).JSON(models.AuthResponse{
		User:        user.ToResponse(),
		AccessToken: accessToken,
	})
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req models.LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Geçersiz giriş bilgileri.",
		})
	}

	req.Login = strings.TrimSpace(req.Login)
	if req.Login == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Kullanıcı adı/e-posta ve şifre zorunludur.",
		})
	}

	user, err := h.userRepo.GetUserByLogin(c.Context(), req.Login)
	if err != nil || user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Kullanıcı adı veya şifre hatalı.",
		})
	}

	if !middleware.CheckPasswordHash(req.Password, user.PasswordHash) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Kullanıcı adı veya şifre hatalı.",
		})
	}

	// 1. Hesap Ban Kontrolü
	if user.IsBanned {
		reason := user.BanReason
		if reason == "" {
			reason = "Hesabınız yönetici tarafından askıya alınmıştır."
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": fmt.Sprintf("Giriş engellendi: %s", reason),
		})
	}

	// 2. Bakım Modu Kontrolü
	if h.settingsRepo != nil {
		siteInfo := h.settingsRepo.GetSiteInfo(c.Context())
		if siteInfo.MaintenanceMode && user.Role != "admin" && user.Role != "moderator" {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"error": "Sistem şu anda bakım modundadır. Yalnızca yöneticiler giriş yapabilir.",
			})
		}
	}

	accessToken, err := middleware.GenerateAccessToken(user.ID, user.Username, h.cfg.JWTAccessSecret, h.cfg.JWTAccessExpiryMin)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oturum anahtarı üretilemedi."})
	}

	refreshToken, err := middleware.GenerateRefreshToken(user.ID, h.cfg.JWTRefreshSecret, h.cfg.JWTRefreshExpiryDays)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Yenileme anahtarı üretilemedi."})
	}

	h.setAuthCookies(c, accessToken, refreshToken)

	if h.accessRepo != nil {
		_ = h.accessRepo.LogAccess(c.Context(), user.ID, c.IP(), c.Get("User-Agent"))
	}

	return c.JSON(models.AuthResponse{
		User:        user.ToResponse(),
		AccessToken: accessToken,
	})
}

func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	refreshToken := c.Cookies("refresh_token")
	if refreshToken == "" {
		var body struct {
			RefreshToken string `json:"refresh_token"`
		}
		_ = c.BodyParser(&body)
		refreshToken = body.RefreshToken
	}

	if refreshToken == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Yenileme tokenı bulunamadı.",
		})
	}

	claims, err := middleware.ValidateToken(refreshToken, h.cfg.JWTRefreshSecret)
	if err != nil || !claims.IsRefresh {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Geçersiz veya süresi dolmuş yenileme tokenı.",
		})
	}

	user, err := h.userRepo.GetUserByID(c.Context(), claims.UserID)
	if err != nil || user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Kullanıcı hesabı bulunamadı.",
		})
	}

	newAccessToken, err := middleware.GenerateAccessToken(user.ID, user.Username, h.cfg.JWTAccessSecret, h.cfg.JWTAccessExpiryMin)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Yeni token üretilemedi."})
	}

	h.setAuthCookies(c, newAccessToken, refreshToken)

	return c.JSON(fiber.Map{
		"access_token": newAccessToken,
		"user":         user.ToResponse(),
	})
}

func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	var userID uuid.UUID
	if id, ok := c.Locals("user_id").(uuid.UUID); ok {
		userID = id
	} else {
		tokenStr := c.Cookies("access_token")
		if tokenStr == "" {
			authHeader := c.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}
		if tokenStr != "" {
			if claims, err := middleware.ValidateToken(tokenStr, h.cfg.JWTAccessSecret); err == nil {
				userID = claims.UserID
			}
		}
	}

	if userID != uuid.Nil {
		ctx := c.Context()
		if h.hub != nil {
			h.hub.DisconnectUser(userID)
		}
		if h.presenceService != nil {
			_ = h.presenceService.SetUserOffline(ctx, userID)
		}
		if h.userRepo != nil {
			_ = h.userRepo.UpdateOnlineStatus(ctx, userID, 0)
		}
	}

	h.clearAuthCookies(c)
	return c.JSON(fiber.Map{
		"message": "Oturum başarıyla kapatıldı.",
	})
}

func (h *AuthHandler) Me(c *fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(uuid.UUID)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Yetkisiz istek."})
	}

	user, err := h.userRepo.GetUserByID(c.Context(), userID)
	if err != nil || user == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Kullanıcı bulunamadı."})
	}

	return c.JSON(user.ToResponse())
}

// GetPublicSettings returns public system configurations (site name, allow registration, theme, etc.)
func (h *AuthHandler) GetPublicSettings(c *fiber.Ctx) error {
	if h.settingsRepo == nil {
		return c.JSON(fiber.Map{})
	}
	return c.JSON(h.settingsRepo.GetPublicSettings(c.Context()))
}

