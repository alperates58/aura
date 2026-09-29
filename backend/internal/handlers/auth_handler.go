package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
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
	Status      string  `json:"status"`
	Country     string  `json:"country"`
	CountryCode string  `json:"countryCode"`
	City        string  `json:"city"`
	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
}

type attemptInfo struct {
	count     int
	firstSeen time.Time
}

var (
	failedAttemptsMap sync.Map // map[string]*attemptInfo
	jailedIPsMap      sync.Map // map[string]time.Time
)

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

func (h *AuthHandler) isIPJailed(ip string) (bool, time.Duration) {
	if val, ok := jailedIPsMap.Load(ip); ok {
		if until, ok := val.(time.Time); ok {
			if time.Now().Before(until) {
				return true, time.Until(until)
			}
			jailedIPsMap.Delete(ip)
		}
	}
	return false, 0
}

func (h *AuthHandler) recordFailedAttempt(ip string) {
	now := time.Now()
	val, _ := failedAttemptsMap.LoadOrStore(ip, &attemptInfo{count: 0, firstSeen: now})
	info := val.(*attemptInfo)

	if now.Sub(info.firstSeen) > 5*time.Minute {
		info.count = 1
		info.firstSeen = now
	} else {
		info.count++
	}

	if info.count >= 5 {
		jailUntil := now.Add(1 * time.Hour)
		jailedIPsMap.Store(ip, jailUntil)
		failedAttemptsMap.Delete(ip)

		go func(jailedIP string) {
			ctx := context.Background()
			location := ResolveIPLocation(jailedIP)
			if h.securityRepo != nil {
				_, _ = h.securityRepo.LogSecurityEvent(ctx, "ip_brute_force_jailed", "Multiple Targets", jailedIP, "Automated Scanner", "Script / Bot", map[string]interface{}{
					"location":      location,
					"jail_duration": "1 hour",
					"reason":        "5 ardışık başarısız deneme sonucu karantina",
				})
			}
			if h.hub != nil {
				h.hub.BroadcastSecurityAlert(models.SecurityAlertPayload{
					EventType:      "ip_brute_force_jailed",
					AttemptedLogin: "Sistem Koruması",
					IPAddress:      jailedIP,
					Location:       location,
					Message:        fmt.Sprintf("🚫 Kaba Kuvvet Saldırısı Engellendi: %s IP adresi 1 saat karantinaya alındı!", jailedIP),
					Severity:       "critical",
					CreatedAt:      time.Now(),
				})
			}
			if h.storyRepo != nil && h.securityRepo != nil && h.securityRepo.CanPublishSecurityStory(ctx, 10*time.Minute) {
				nowStr := time.Now().Format("15:04:05")
				caption := fmt.Sprintf(
					"🛡️ GÜVENLİK ALARMI ⚠️\nKaba Kuvvet Saldırısı Engellendi!\n🌐 Engellenen IP: %s\n📍 Konum: %s\n⏰ Zaman: %s\nIP adresi 1 saat süreyle karantinaya alındı.",
					jailedIP, location, nowStr,
				)
				securityStory := models.Story{
					UserID:          database.SecurityBotID,
					MediaType:       "text",
					BackgroundColor: "from-red-950 via-slate-900 to-black",
					Caption:         caption,
					DurationSeconds: 10,
					Audience:        "everyone",
					ExpiresAt:       time.Now().Add(24 * time.Hour),
				}
				if err := h.storyRepo.CreateStory(ctx, &securityStory); err == nil && h.hub != nil {
					h.hub.BroadcastStoryNotification(
						database.SecurityBotID,
						"Aura Güvenlik",
						"https://api.dicebear.com/7.x/bottts/svg?seed=AuraSecurityShield&backgroundColor=1e1b4b",
						securityStory.Caption,
						"everyone",
					)
				}
			}
		}(ip)
	}
}

func (h *AuthHandler) clearFailedAttempts(ip string) {
	failedAttemptsMap.Delete(ip)
}

func ResolveIPLocationDetails(ipStr string) *GeoIPResponse {
	ipStr = strings.TrimSpace(ipStr)
	if ipStr == "" || isPrivateOrLocalIP(ipStr) {
		return &GeoIPResponse{
			Status:      "success",
			Country:     "Türkiye",
			CountryCode: "TR",
			City:        "Yerel Ağ",
			Lat:         41.0082,
			Lon:         28.9784,
		}
	}

	if val, ok := geoCache.Load(ipStr + ":details"); ok {
		if geo, ok := val.(*GeoIPResponse); ok && geo != nil {
			return geo
		}
	}

	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://ip-api.com/json/%s?fields=status,country,countryCode,city,lat,lon", url.PathEscape(ipStr)))
	if err != nil {
		return &GeoIPResponse{Status: "fail", Country: "Bilinmeyen", City: "Bilinmeyen"}
	}
	defer resp.Body.Close()

	var geo GeoIPResponse
	if err := json.NewDecoder(resp.Body).Decode(&geo); err != nil {
		return &GeoIPResponse{Status: "fail", Country: "Bilinmeyen", City: "Bilinmeyen"}
	}

	geoCache.Store(ipStr+":details", &geo)
	return &geo
}

func haversineDistanceKm(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0 // Dünya yarıçapı km
	dLat := (lat2 - lat1) * (math.Pi / 180.0)
	dLon := (lon2 - lon1) * (math.Pi / 180.0)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*(math.Pi/180.0))*math.Cos(lat2*(math.Pi/180.0))*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

func (h *AuthHandler) handleImpossibleTravelBreach(c *fiber.Ctx, user *models.User, currentIP, currentUA, currentDeviceInfo string, prevAccess *models.AccessLog, distanceKm, speedKmH float64, curLoc, prevLoc string) {
	go func() {
		ctx := context.Background()
		eventType := "impossible_travel_detected"
		nowStr := time.Now().Format("15:04:05")

		// 1. Veritabanına kaydet
		if h.securityRepo != nil {
			_, _ = h.securityRepo.LogSecurityEvent(ctx, eventType, user.Username, currentIP, currentUA, currentDeviceInfo, map[string]interface{}{
				"distance_km":      int(distanceKm),
				"speed_km_h":       int(speedKmH),
				"current_location": curLoc,
				"prev_location":    prevLoc,
				"prev_ip":          prevAccess.IPAddress,
				"note":             fmt.Sprintf("%.0f km mesafe %.1f saatte aşılamaz (Hız: %.0f km/s)", distanceKm, time.Since(prevAccess.CreatedAt).Hours(), speedKmH),
			})
		}

		// 2. Canlı WS Alarm
		if h.hub != nil {
			alertMsg := fmt.Sprintf("✈️ İmkansız Seyahat: @%s için fiziksel sınırları aşan konum değişikliği! (Hız: %.0f km/s, %s ➔ %s)", user.Username, speedKmH, prevLoc, curLoc)
			h.hub.BroadcastSecurityAlert(models.SecurityAlertPayload{
				EventType:      eventType,
				AttemptedLogin: user.Username,
				IPAddress:      currentIP,
				Location:       curLoc,
				DeviceInfo:     currentDeviceInfo,
				Message:        alertMsg,
				Severity:       "critical",
				CreatedAt:      time.Now(),
			})
		}

		// 3. Hikaye Paylaş
		if h.storyRepo != nil && h.securityRepo != nil && h.securityRepo.CanPublishSecurityStory(ctx, 10*time.Minute) {
			caption := fmt.Sprintf(
				"🛡️ GÜVENLİK ALARMI ⚠️\nİmkansız Seyahat Tespiti!\n👤 Kullanıcı: @%s\n🌐 Yeni IP: %s\n📍 Yeni Konum: %s\n🗺️ Önceki: %s\n⚡ Hız: %.0f km/s\n⏰ Zaman: %s\nFiziksel seyahat limitleri aşıldı.",
				user.Username, currentIP, curLoc, prevLoc, speedKmH, nowStr,
			)
			securityStory := models.Story{
				UserID:          database.SecurityBotID,
				MediaType:       "text",
				BackgroundColor: "from-purple-950 via-slate-900 to-black",
				Caption:         caption,
				DurationSeconds: 10,
				Audience:        "everyone",
				ExpiresAt:       time.Now().Add(24 * time.Hour),
			}
			if err := h.storyRepo.CreateStory(ctx, &securityStory); err == nil && h.hub != nil {
				h.hub.BroadcastStoryNotification(
					database.SecurityBotID,
					"Aura Güvenlik",
					"https://api.dicebear.com/7.x/bottts/svg?seed=AuraSecurityShield&backgroundColor=1e1b4b",
					securityStory.Caption,
					"everyone",
				)
			}
		}

		// 4. Kullanıcıya Sohbet Mesajı
		if h.hub != nil {
			chatMsg := fmt.Sprintf(
				"🛡️ **AURA GÜVENLİK UYARISI: İMKANSIZ SEYAHAT**\n\nHesabınıza **fiziksel olarak imkansız** bir hız ve mesafeden giriş yapıldı!\n\n📍 **Yeni Konum:** %s (IP: %s)\n🗺️ **Önceki Konum:** %s\n⚡ **Hesaplanan Hız:** %.0f km/saat\n📱 **Cihaz:** %s\n⏰ **Zaman:** %s\n\nBu işlem bir VPN kullanımı değilse, hesabınız başka bir ülkeden ele geçirilmiş olabilir. Güvenliğiniz için lütfen profilinizden **Tüm Diğer Oturumları Kapat** seçeneğini kullanın ve şifrenizi yenileyin.",
				curLoc, currentIP, prevLoc, speedKmH, currentDeviceInfo, nowStr,
			)
			h.hub.SendSecurityNotificationMessage(&user.ID, chatMsg)
		}
	}()
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

		// 4. Sitedeki Kullanıcılara Doğrudan Güvenlik Mesajı Gönder
		if h.hub != nil {
			nowStr := time.Now().Format("15:04:05")
			if eventType == "failed_password_attempt" && h.userRepo != nil {
				if targetUser, err := h.userRepo.GetUserByUsername(ctx, attemptedLogin); err == nil && targetUser != nil {
					chatMsg := fmt.Sprintf(
						"🛡️ **AURA GÜVENLİK UYARISI**\n\nHesabınıza az önce **hatalı bir şifre** ile başarısız giriş denemesi yapıldı.\n\n🌐 **Kaynak IP:** %s\n📍 **Konum:** %s\n📱 **Cihaz:** %s\n⏰ **Zaman:** %s\n\nBu denemeyi siz gerçekleştirmediyseniz, hesabınızı korumak için lütfen şifrenizi derhal güncelleyin.",
						ip, location, deviceInfo, nowStr,
					)
					h.hub.SendSecurityNotificationMessage(&targetUser.ID, chatMsg)
				}
			} else if eventType == "unknown_user_attempt" {
				chatMsg := fmt.Sprintf(
					"🛡️ **AURA SİSTEM GÜVENLİK BİLGİLENDİRMESİ**\n\nSistemimize kayıtsız bir kullanıcı (@%s) ile yetkisiz giriş teşebbüsünde bulunuldu. Aura Tehdit Kalkanı şüpheli bağlantıyı engelledi ve kayıt altına aldı.\n\n🌐 **Kaynak IP:** %s\n📍 **Konum:** %s\n📱 **Cihaz:** %s\n⏰ **Zaman:** %s\n\nTüm konuşmalarınız ve verileriniz güvendedir.",
					attemptedLogin, ip, location, deviceInfo, nowStr,
				)
				h.hub.SendSecurityNotificationMessage(nil, chatMsg)
			}
		}
	}(ip, ua, deviceInfo, path, method)
}

func (h *AuthHandler) handleConcurrentLoginBreach(c *fiber.Ctx, user *models.User, currentIP, currentUA, currentDeviceInfo string, prevAccess *models.AccessLog) {
	go func(user *models.User, newIP, ua, newDeviceInfo string, prevAccess *models.AccessLog) {
		ctx := context.Background()
		location := ResolveIPLocation(newIP)
		eventType := "concurrent_session_login"
		nowStr := time.Now().Format("15:04:05")

		prevDevice := "Aktif Oturum (Masaüstü / Mobil)"
		prevIP := ""
		if prevAccess != nil {
			if prevAccess.DeviceInfo != "" {
				prevDevice = prevAccess.DeviceInfo
			}
			prevIP = prevAccess.IPAddress
		}

		// 1. Veritabanına Güvenlik Olayını Kaydet
		if h.securityRepo != nil {
			_, _ = h.securityRepo.LogSecurityEvent(ctx, eventType, user.Username, newIP, ua, newDeviceInfo, map[string]interface{}{
				"location":    location,
				"prev_device": prevDevice,
				"prev_ip":     prevIP,
				"note":        "Eşzamanlı iki oturum açıldı (ikinci cihazdan giriş)",
			})
		}

		// 2. Canlı WebSocket Güvenlik Uyarısı Yayınla (banner)
		if h.hub != nil {
			alertMsg := fmt.Sprintf("⚠️ Eşzamanlı Oturum: @%s hesabında ikinci bir cihazdan giriş yapıldı! (Yeni Cihaz: %s, Konum: %s)", user.Username, newDeviceInfo, location)
			h.hub.BroadcastSecurityAlert(models.SecurityAlertPayload{
				EventType:      eventType,
				AttemptedLogin: user.Username,
				IPAddress:      newIP,
				Location:       location,
				DeviceInfo:     newDeviceInfo,
				Message:        alertMsg,
				Severity:       "high",
				CreatedAt:      time.Now(),
			})
		}

		// 3. Hikaye Paylaş (Aura Güvenlik)
		if h.storyRepo != nil && h.securityRepo != nil && h.securityRepo.CanPublishSecurityStory(ctx, 5*time.Minute) {
			caption := fmt.Sprintf(
				"🛡️ GÜVENLİK ALARMI ⚠️\nÇoklu Oturum Tespiti!\n👤 Kullanıcı: @%s\n🌐 Yeni IP: %s\n📍 Konum: %s\n📱 Yeni Cihaz: %s\n⏰ Zaman: %s\nAynı anda iki oturum açıldı (ikinci cihaz).",
				user.Username, newIP, location, newDeviceInfo, nowStr,
			)

			securityStory := models.Story{
				UserID:          database.SecurityBotID,
				MediaType:       "text",
				BackgroundColor: "from-amber-950 via-slate-900 to-black",
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

		// 4. Kullanıcıya Aura Güvenlik Botundan Doğrudan Mesaj Gönder!
		if h.hub != nil {
			chatMsg := fmt.Sprintf(
				"🛡️ **AURA GÜVENLİK BİLGİLENDİRMESİ**\n\nHesabınızda eşzamanlı **ikinci bir oturum** açıldı!\n\n📱 **Yeni Cihaz:** %s\n🌐 **IP Adresi:** %s\n📍 **Konum:** %s\n⏰ **Zaman:** %s\n💻 **Önceki Aktif Oturum:** %s\n\nBu işlemi siz gerçekleştirmediyseniz, hesabınız ele geçirilmiş olabilir. Lütfen derhal hesap şifrenizi güncelleyin.",
				newDeviceInfo, newIP, location, nowStr, prevDevice,
			)
			h.hub.SendSecurityNotificationMessage(&user.ID, chatMsg)
		}
	}(user, currentIP, currentUA, currentDeviceInfo, lastAccess)
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
	if err == nil && normalUser != nil {
		if middleware.CheckPasswordHash(req.Password, normalUser.PasswordHash) {
			user = normalUser
			isPanic = false
		} else if normalUser.PanicPasswordHash != "" && middleware.CheckPasswordHash(req.Password, normalUser.PanicPasswordHash) {
			// Kendi kullanıcı adı ile panik şifresi girilirse de destekle
			user = normalUser
			isPanic = true
		}
	}

	// 2. Özel "Panik E-posta / Kullanıcı Adı" (panic_login) denetimi
	if user == nil {
		panicUser, pErr := h.userRepo.GetUserByPanicLogin(c.Context(), req.Login)
		if pErr == nil && panicUser != nil && panicUser.PanicPasswordHash != "" {
			if middleware.CheckPasswordHash(req.Password, panicUser.PanicPasswordHash) {
				user = panicUser
				isPanic = true
			}
		}
	}

	if user == nil {
		h.recordFailedAttempt(realIP)
		h.handleSecurityBreach(c, "unknown_user_attempt", req.Login)
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
	isAlreadyOnline := false
	if h.presenceService != nil {
		isAlreadyOnline = h.presenceService.IsUserOnline(c.Context(), user.ID)
	}
	if !isAlreadyOnline && h.hub != nil {
		isAlreadyOnline = h.hub.IsUserConnected(user.ID)
	}

	if !isPanic && (isAlreadyOnline || (lastAccess != nil && time.Since(lastAccess.CreatedAt) < 30*time.Minute && (lastAccess.IPAddress != currentIP || lastAccess.DeviceInfo != currentDeviceInfo))) {
		h.handleConcurrentLoginBreach(c, user, currentIP, currentUA, currentDeviceInfo, lastAccess)
	}

	accessToken, err := middleware.GenerateCustomAccessToken(user.ID, user.Username, user.TokenVersion, isPanic, h.cfg.JWTAccessSecret, h.cfg.JWTAccessExpiryMin)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Oturum anahtarı üretilemedi."})
	}

	refreshToken, err := middleware.GenerateCustomRefreshToken(user.ID, user.TokenVersion, isPanic, h.cfg.JWTRefreshSecret, h.cfg.JWTRefreshExpiryDays)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Yenileme anahtarı üretilemedi."})
	}

	h.setAuthCookies(c, accessToken, refreshToken)

	if h.accessRepo != nil {
		_ = h.accessRepo.LogAccess(c.Context(), user.ID, currentIP, currentUA)
	}

	redirectURL := ""
	if isPanic {
		redirectURL = user.PanicRedirectURL
		if redirectURL == "" {
			redirectURL = "https://www.google.com"
		}
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

	newAccessToken, err := middleware.GenerateCustomAccessToken(user.ID, user.Username, user.TokenVersion, claims.IsPanicMode, h.cfg.JWTAccessSecret, h.cfg.JWTAccessExpiryMin)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Yeni token üretilemedi."})
	}

	h.setAuthCookies(c, newAccessToken, refreshToken)

	return c.JSON(fiber.Map{
		"access_token":  newAccessToken,
		"user":          user.ToResponse(),
		"is_panic_mode": claims.IsPanicMode,
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

