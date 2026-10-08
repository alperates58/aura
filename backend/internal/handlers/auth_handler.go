package handlers

import (
	"fmt"
	"log"
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
	"github.com/redis/go-redis/v9"
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
	sessionRepo     *database.SessionRepository
	settingsRepo    *database.SettingsRepository
	securityRepo    *database.SecurityRepository
	storyRepo       *database.StoryRepository
	rdb             *redis.Client
}

func NewAuthHandler(
	cfg config.Config,
	userRepo *database.UserRepository,
	presenceService *auraredis.PresenceService,
	hub *auraws.Hub,
	accessRepo *database.AccessRepository,
	sessionRepo *database.SessionRepository,
	settingsRepo *database.SettingsRepository,
	securityRepo *database.SecurityRepository,
	storyRepo *database.StoryRepository,
	rdb *redis.Client,
) *AuthHandler {
	return &AuthHandler{
		cfg:             cfg,
		userRepo:        userRepo,
		presenceService: presenceService,
		hub:             hub,
		accessRepo:      accessRepo,
		sessionRepo:     sessionRepo,
		settingsRepo:    settingsRepo,
		securityRepo:    securityRepo,
		storyRepo:       storyRepo,
		rdb:             rdb,
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
	paths := []string{"/"}
	if h.cfg.AppBasePath != "" && h.cfg.AppBasePath != "/" {
		paths = append(paths, h.cfg.AppBasePath)
	}

	for _, p := range paths {
		c.Cookie(&fiber.Cookie{
			Name:     "access_token",
			Value:    "",
			Expires:  time.Now().Add(-24 * time.Hour),
			MaxAge:   -1,
			HTTPOnly: true,
			Path:     p,
		})
		c.Cookie(&fiber.Cookie{
			Name:     "refresh_token",
			Value:    "",
			Expires:  time.Now().Add(-24 * time.Hour),
			MaxAge:   -1,
			HTTPOnly: true,
			Path:     p,
		})
	}
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

	// 0. Sistem Ayarları Denetimi (Fail-Closed)
	if h.settingsRepo == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "Sistem ayarları yüklenemedi. Yeni üye kaydı geçici olarak durdurulmuştur.",
		})
	}
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

	realIP := GetRealIP(c)
	currentUA := c.Get("User-Agent")

	if h.accessRepo != nil {
		_ = h.accessRepo.LogAccess(c.Context(), user.ID, realIP, currentUA)
	}

	sessionID := strings.TrimSpace(c.Get("X-Session-ID"))
	if sessionID == "" {
		sessionID = uuid.New().String()
	}
	devName, devType, devOS, devBrowser := database.ParseUserAgentDetailed(currentUA)
	loc := ResolveIPLocation(realIP)
	if h.sessionRepo != nil {
		_ = h.sessionRepo.UpsertSession(c.Context(), &models.UserSession{
			UserID:     user.ID,
			SessionID:  sessionID,
			DeviceName: devName,
			DeviceType: devType,
			OS:         devOS,
			Browser:    devBrowser,
			IPAddress:  realIP,
			Location:   loc,
			UserAgent:  currentUA,
		})
	}

	if h.rdb != nil {
		_ = h.rdb.Del(c.Context(), fmt.Sprintf("inactivity_breached_user:%s", user.ID.String())).Err()
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

	realIP := GetRealIP(c)
	if jailed, remaining := h.isIPJailed(realIP); jailed {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"error": fmt.Sprintf("Çok fazla başarısız deneme nedeniyle IP adresiniz geçici olarak karantinaya alındı. Kalan süre: %d dakika.", int(remaining.Minutes())+1),
		})
	}

	var user *models.User
	isPanic := false

	// 1. Normal kullanıcı adı / e-posta denetimi
	normalUser, err := h.userRepo.GetUserByLogin(c.Context(), req.Login)
	if err != nil {
		log.Printf("❌ [Login DB Hatası] %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Giriş işlemi sırasında sunucu hatası oluştu. Lütfen tekrar deneyin.",
		})
	}
	if normalUser != nil {
		if middleware.CheckPasswordHash(req.Password, normalUser.PasswordHash) {
			user = normalUser
			isPanic = false
		} else if normalUser.PanicPasswordHash != "" && middleware.CheckPasswordHash(req.Password, normalUser.PanicPasswordHash) {
			user = normalUser
			isPanic = true
		}
	}

	// 2. Özel "Panik E-posta / Kullanıcı Adı" (panic_login) denetimi
	if user == nil {
		panicUser, pErr := h.userRepo.GetUserByPanicLogin(c.Context(), req.Login)
		if pErr != nil {
			log.Printf("❌ [Login Panik DB Hatası] %v", pErr)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Giriş işlemi sırasında sunucu hatası oluştu. Lütfen tekrar deneyin.",
			})
		}
		if panicUser != nil && panicUser.PanicPasswordHash != "" {
			if middleware.CheckPasswordHash(req.Password, panicUser.PanicPasswordHash) {
				user = panicUser
				isPanic = true
			}
		}
	}

	if user == nil {
		h.recordFailedAttempt(realIP)
		eventType := "unknown_user_attempt"
		if normalUser != nil {
			eventType = "failed_password_attempt"
		}
		h.handleSecurityBreach(c, eventType, req.Login)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Kullanıcı adı veya şifre hatalı.",
		})
	}

	h.clearFailedAttempts(realIP)

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

	var lastAccess *models.AccessLog
	if h.accessRepo != nil {
		logs, _ := h.accessRepo.GetUserAccessLogs(c.Context(), user.ID, 1)
		if len(logs) > 0 {
			lastAccess = &logs[0]
		}
	}

	currentIP := realIP
	currentUA := c.Get("User-Agent")
	currentDeviceInfo := database.ParseUserAgent(currentUA)

	// Geo-velocity (İmkansız Seyahat) Denetimi
	if lastAccess != nil && !isPanic {
		h.handleImpossibleTravelBreach(c, user, currentIP, currentUA, currentDeviceInfo, lastAccess)
	}

	// 3. Eşzamanlı Oturum / İkinci Cihazdan Giriş Denetimi
	currentSessionID := strings.TrimSpace(c.Get("X-Session-ID"))
	isConcurrent := false
	var otherDevInfo, otherDevIP string
	var activeCount int
	if h.hub != nil {
		isConcurrent, activeCount, otherDevInfo, otherDevIP = h.hub.HasActiveSessionExcluding(user.ID, currentSessionID, currentIP)
	}

	if !isPanic && isConcurrent {
		prevAccessInfo := &models.AccessLog{
			DeviceInfo: otherDevInfo,
			IPAddress:  otherDevIP,
		}
		if otherDevIP == "" && lastAccess != nil {
			prevAccessInfo = lastAccess
		}
		h.handleConcurrentLoginBreach(c, user, currentIP, currentUA, currentDeviceInfo, prevAccessInfo, activeCount+1)
	}

	accessToken, err := middleware.GenerateCustomAccessToken(user.ID, user.Username, h.cfg.JWTAccessSecret, h.cfg.JWTAccessExpiryMin, user.TokenVersion, isPanic)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oturum anahtarı üretilemedi."})
	}

	refreshToken, err := middleware.GenerateCustomRefreshToken(user.ID, h.cfg.JWTRefreshSecret, h.cfg.JWTRefreshExpiryDays, user.TokenVersion, isPanic)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Yenileme anahtarı üretilemedi."})
	}

	h.setAuthCookies(c, accessToken, refreshToken)

	if h.accessRepo != nil {
		_ = h.accessRepo.LogAccess(c.Context(), user.ID, currentIP, currentUA)
	}

	sessionID := strings.TrimSpace(c.Get("X-Session-ID"))
	if sessionID == "" {
		sessionID = uuid.New().String()
	}
	devName, devType, devOS, devBrowser := database.ParseUserAgentDetailed(currentUA)
	loc := ResolveIPLocation(currentIP)
	if h.sessionRepo != nil {
		_ = h.sessionRepo.UpsertSession(c.Context(), &models.UserSession{
			UserID:     user.ID,
			SessionID:  sessionID,
			DeviceName: devName,
			DeviceType: devType,
			OS:         devOS,
			Browser:    devBrowser,
			IPAddress:  currentIP,
			Location:   loc,
			UserAgent:  currentUA,
		})
	}

	if h.rdb != nil {
		_ = h.rdb.Set(c.Context(), "user:"+user.ID.String()+":token_version", user.TokenVersion, 24*time.Hour).Err()
		_ = h.rdb.Del(c.Context(), fmt.Sprintf("inactivity_breached_user:%s", user.ID.String())).Err()
	}

	redirectURL := ""
	if isPanic {
		redirectURL = user.PanicRedirectURL
		if redirectURL == "" {
			redirectURL = "https://zodiacrf.com"
		} else {
			if !strings.HasPrefix(redirectURL, "http://") && !strings.HasPrefix(redirectURL, "https://") {
				redirectURL = "https://" + redirectURL
			}
			redirectURL = strings.Replace(redirectURL, "://www.zodiacrf.com", "://zodiacrf.com", 1)
		}
		h.handlePanicBreach(c, user, currentIP, currentUA, currentDeviceInfo, redirectURL)
	}

	return c.JSON(models.AuthResponse{
		User:             user.ToResponse(),
		AccessToken:      accessToken,
		IsPanicMode:      isPanic,
		PanicRedirectURL: redirectURL,
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

	// Token version validation (Remote Kill Session support)
	if claims.TokenVersion < user.TokenVersion {
		h.clearAuthCookies(c)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Oturumunuz başka bir cihazdan sonlandırıldı. Lütfen tekrar giriş yapın.",
		})
	}

	newAccessToken, err := middleware.GenerateCustomAccessToken(user.ID, user.Username, h.cfg.JWTAccessSecret, h.cfg.JWTAccessExpiryMin, user.TokenVersion, claims.IsPanicMode)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Yeni token üretilemedi."})
	}

	h.setAuthCookies(c, newAccessToken, refreshToken)

	currentSessionID := strings.TrimSpace(c.Get("X-Session-ID"))
	if h.sessionRepo != nil && currentSessionID != "" {
		currentIP := GetRealIP(c)
		loc := ResolveIPLocation(currentIP)
		_ = h.sessionRepo.TouchSession(c.Context(), user.ID, currentSessionID, currentIP, loc)
	}

	return c.JSON(fiber.Map{
		"access_token":  newAccessToken,
		"user":          user.ToResponse(),
		"is_panic_mode": claims.IsPanicMode,
	})
}

func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	reason := c.Query("reason")
	if reason == "inactivity_timeout" {
		return h.InactivityAlert(c)
	}
	var checkBody struct {
		Reason string `json:"reason"`
	}
	if err := c.BodyParser(&checkBody); err == nil && checkBody.Reason == "inactivity_timeout" {
		return h.InactivityAlert(c)
	}

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
			newVer, err := h.userRepo.IncrementTokenVersion(ctx, userID)
			if err == nil && h.rdb != nil {
				_ = h.rdb.Set(ctx, "user:"+userID.String()+":token_version", newVer, 24*time.Hour).Err()
			}
		}
		currentSessionID := strings.TrimSpace(c.Get("X-Session-ID"))
		if h.sessionRepo != nil && currentSessionID != "" {
			_ = h.sessionRepo.DeleteSession(ctx, userID, currentSessionID)
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

	currentSessionID := strings.TrimSpace(c.Get("X-Session-ID"))
	if currentSessionID != "" && h.sessionRepo != nil {
		currentIP := GetRealIP(c)
		currentUA := c.Get("User-Agent")
		devName, devType, devOS, devBrowser := database.ParseUserAgentDetailed(currentUA)
		loc := ResolveIPLocation(currentIP)
		_ = h.sessionRepo.UpsertSession(c.Context(), &models.UserSession{
			UserID:     userID,
			SessionID:  sessionID,
			DeviceName: devName,
			DeviceType: devType,
			OS:         devOS,
			Browser:    devBrowser,
			IPAddress:  currentIP,
			Location:   loc,
			UserAgent:  currentUA,
		})
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
