package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/mail"
	"net/url"
	"regexp"
	"strings"
	"sync"
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
	securityRepo    *database.SecurityRepository
	storyRepo       *database.StoryRepository
}

func NewAuthHandler(
	cfg config.Config,
	userRepo *database.UserRepository,
	presenceService *auraredis.PresenceService,
	hub *auraws.Hub,
	accessRepo *database.AccessRepository,
	settingsRepo *database.SettingsRepository,
	securityRepo *database.SecurityRepository,
	storyRepo *database.StoryRepository,
) *AuthHandler {
	return &AuthHandler{
		cfg:             cfg,
		userRepo:        userRepo,
		presenceService: presenceService,
		hub:             hub,
		accessRepo:      accessRepo,
		settingsRepo:    settingsRepo,
		securityRepo:    securityRepo,
		storyRepo:       storyRepo,
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
		_ = h.accessRepo.LogAccess(c.Context(), user.ID, GetRealIP(c), c.Get("User-Agent"))
	}

	return c.Status(fiber.StatusCreated).JSON(models.AuthResponse{
		User:        user.ToResponse(),
		AccessToken: accessToken,
	})
}

var geoCache sync.Map

type GeoIPResponse struct {
	Status      string `json:"status"`
	Country     string `json:"country"`
	CountryCode string `json:"countryCode"`
	City        string `json:"city"`
}

func isPrivateOrLocalIP(ipStr string) bool {
	ip := net.ParseIP(strings.TrimSpace(ipStr))
	if ip == nil {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast()
}

// GetRealIP, ters proxy (Traefik, Coolify, Nginx, Cloudflare) arkasındaki gerçek istemci IP adresini bulur.
func GetRealIP(c *fiber.Ctx) string {
	// 1. Cloudflare başlıkları
	if cf := strings.TrimSpace(c.Get("CF-Connecting-IP")); cf != "" {
		return cf
	}
	if tc := strings.TrimSpace(c.Get("True-Client-IP")); tc != "" {
		return tc
	}
	// 2. X-Real-IP başlığı
	if xri := strings.TrimSpace(c.Get("X-Real-IP")); xri != "" {
		return xri
	}
	// 3. X-Forwarded-For başlığı (virgülle ayrılmış liste: istemci, proxy1, proxy2...)
	if xff := strings.TrimSpace(c.Get("X-Forwarded-For")); xff != "" {
		parts := strings.Split(xff, ",")
		for _, part := range parts {
			cleanIP := strings.TrimSpace(part)
			if cleanIP != "" && !isPrivateOrLocalIP(cleanIP) {
				return cleanIP
			}
		}
		// Hepsi yerel ağ ise veya tek IP varsa ilk olanı al
		if len(parts) > 0 && strings.TrimSpace(parts[0]) != "" {
			return strings.TrimSpace(parts[0])
		}
	}
	// 4. Doğrudan TCP soket IP'si fallback
	return c.IP()
}

// ResolveIPLocation, IP adresinden şehir ve ülke bilgisini bayrak emojisi ile çözer.
func ResolveIPLocation(ipStr string) string {
	ipStr = strings.TrimSpace(ipStr)
	if ipStr == "" {
		return "Bilinmeyen Konum"
	}
	if isPrivateOrLocalIP(ipStr) {
		return "Yerel Ağ / Özel IP 🏠"
	}

	if val, ok := geoCache.Load(ipStr); ok {
		if loc, ok := val.(string); ok && loc != "" {
			return loc
		}
	}

	client := http.Client{
		Timeout: 2 * time.Second,
	}
	resp, err := client.Get(fmt.Sprintf("http://ip-api.com/json/%s?fields=status,country,countryCode,city", url.PathEscape(ipStr)))
	if err != nil {
		return "Bilinmeyen Konum"
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "Bilinmeyen Konum"
	}

	var data GeoIPResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil || data.Status != "success" {
		return "Bilinmeyen Konum"
	}

	flag := getCountryFlag(data.CountryCode)
	var location string
	if data.City != "" && data.Country != "" {
		location = fmt.Sprintf("%s, %s %s", data.City, data.Country, flag)
	} else if data.Country != "" {
		location = fmt.Sprintf("%s %s", data.Country, flag)
	} else {
		location = "Bilinmeyen Konum"
	}

	geoCache.Store(ipStr, location)
	return location
}

func getCountryFlag(countryCode string) string {
	code := strings.ToUpper(strings.TrimSpace(countryCode))
	if len(code) != 2 {
		return ""
	}
	r1 := rune(0x1F1E6 + int(code[0]-'A'))
	r2 := rune(0x1F1E6 + int(code[1]-'A'))
	return string([]rune{r1, r2})
}

func (h *AuthHandler) handleSecurityBreach(c *fiber.Ctx, eventType, attemptedLogin string) {
	ip := GetRealIP(c)
	ua := c.Get("User-Agent")
	deviceInfo := database.ParseUserAgent(ua)
	path := c.Path()
	method := c.Method()

	// Arka planda lokasyon tespiti, loglama, websocket yayını ve hikaye paylaşımını yürüt (giriş isteğini bloklamaz)
	go func(ip, ua, deviceInfo, path, method string) {
		ctx := context.Background()
		location := ResolveIPLocation(ip)

		// 1. Veritabanına Güvenlik Olayını Kaydet
		if h.securityRepo != nil {
			_, _ = h.securityRepo.LogSecurityEvent(ctx, eventType, attemptedLogin, ip, ua, deviceInfo, map[string]interface{}{
				"path":     path,
				"method":   method,
				"location": location,
			})
		}

		// 2. Canlı WebSocket Güvenlik Uyarısı Yayınla
		if h.hub != nil {
			alertMsg := fmt.Sprintf("⚠️ Bilinmeyen kullanıcı (@%s) ile yetkisiz giriş denemesi tespit edildi! (Konum: %s)", attemptedLogin, location)
			if eventType == "failed_password_attempt" {
				alertMsg = fmt.Sprintf("⚠️ Kayıtlı kullanıcı (@%s) için hatalı şifre denemesi tespit edildi! (Konum: %s)", attemptedLogin, location)
			}

			h.hub.BroadcastSecurityAlert(models.SecurityAlertPayload{
				EventType:      eventType,
				AttemptedLogin: attemptedLogin,
				IPAddress:      ip,
				Location:       location,
				DeviceInfo:     deviceInfo,
				Message:        alertMsg,
				Severity:       "critical",
				CreatedAt:      time.Now(),
			})
		}

		// 3. Otomatik "Aura Güvenlik" Hikayesi Yayınla (15 dakikada en fazla 1 kez spam korumalı)
		if h.storyRepo != nil && h.securityRepo != nil && h.securityRepo.CanPublishSecurityStory(ctx, 15*time.Minute) {
			nowStr := time.Now().Format("15:04:05")
			caption := fmt.Sprintf(
				"🛡️ GÜVENLİK ALARMI ⚠️\nYetkisiz Giriş Teşebbüsü!\n👤 Denenen: @%s\n🌐 IP: %s\n📍 Konum: %s\n📱 Cihaz: %s\n⏰ Zaman: %s\nAura Tehdit Kalkanı devrede.",
				attemptedLogin, ip, location, deviceInfo, nowStr,
			)
			if eventType == "failed_password_attempt" {
				caption = fmt.Sprintf(
					"🛡️ GÜVENLİK ALARMI ⚠️\nŞüpheli Giriş Engellendi!\n👤 Kullanıcı: @%s\n🌐 IP: %s\n📍 Konum: %s\n📱 Cihaz: %s\n⏰ Zaman: %s\nAura Tehdit Kalkanı devrede.",
					attemptedLogin, ip, location, deviceInfo, nowStr,
				)
			}

			securityStory := models.Story{
				UserID:          database.SecurityBotID,
				MediaType:       "text",
				BackgroundColor: "from-rose-950 via-slate-900 to-black",
				Caption:         caption,
				DurationSeconds: 10,
				Audience:        "everyone",
				ExpiresAt:       time.Now().Add(24 * time.Hour),
			}

			if err := h.storyRepo.CreateStory(ctx, &securityStory); err == nil {
				if h.hub != nil {
					h.hub.BroadcastStoryNotification(
						database.SecurityBotID,
						"Aura Güvenlik",
						"https://api.dicebear.com/7.x/bottts/svg?seed=AuraSecurityShield&backgroundColor=1e1b4b",
						securityStory.Caption,
						"everyone",
					)
				}
			}
		}
	}(ip, ua, deviceInfo, path, method)
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
		h.handleSecurityBreach(c, "unknown_user_attempt", req.Login)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Kullanıcı adı veya şifre hatalı.",
		})
	}

	if !middleware.CheckPasswordHash(req.Password, user.PasswordHash) {
		h.handleSecurityBreach(c, "failed_password_attempt", user.Username)
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
		_ = h.accessRepo.LogAccess(c.Context(), user.ID, GetRealIP(c), c.Get("User-Agent"))
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

