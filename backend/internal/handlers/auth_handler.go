package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"net/mail"
	"net/url"
	"regexp"
	"strconv"
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
			if h.storyRepo != nil && h.securityRepo != nil && h.securityRepo.CanPublishSecurityStory(ctx, 2*time.Second) {
				nowStr := time.Now().Format("15:04:05")
				caption := fmt.Sprintf(
					"🛡️ GÜVENLİK ALARMI ⚠️\nKaba Kuvvet Karantinası (Çok Sayıda Hatalı Deneme)!\n🌐 Engellenen IP: %s\n📍 Konum: %s\n🔍 Sebep: Çok Sayıda Hatalı Giriş Denemesi\n⏰ Zaman: %s\nIP adresi 1 saat süreyle karantinaya alındı.",
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

func (h *AuthHandler) handleImpossibleTravelBreach(c *fiber.Ctx, user *models.User, currentIP, currentUA, currentDeviceInfo string, prevAccess *models.AccessLog) {
	if prevAccess == nil {
		return
	}
	go func() {
		ctx := context.Background()
		curGeo := ResolveIPLocationDetails(currentIP)
		prevGeo := ResolveIPLocationDetails(prevAccess.IPAddress)

		lat1, lon1 := prevAccess.Latitude, prevAccess.Longitude
		if lat1 == 0 && lon1 == 0 && prevGeo != nil {
			lat1, lon1 = prevGeo.Lat, prevGeo.Lon
		}

		lat2, lon2 := 0.0, 0.0
		if curGeo != nil {
			lat2, lon2 = curGeo.Lat, curGeo.Lon
		}

		if (lat1 == 0 && lon1 == 0) || (lat2 == 0 && lon2 == 0) {
			return
		}

		distanceKm := haversineDistanceKm(lat1, lon1, lat2, lon2)
		hours := time.Since(prevAccess.CreatedAt).Hours()
		if hours <= 0 {
			hours = 0.01 // minimum 36 sn
		}
		speedKmH := distanceKm / hours

		// Eşik: 300 km'den fazla mesafe ve 900 km/s üzeri hız (ve 24 saat içinde)
		if distanceKm < 300 || speedKmH < 900 || hours > 24 {
			return
		}

		curLoc := ResolveIPLocation(currentIP)
		prevLoc := ResolveIPLocation(prevAccess.IPAddress)
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
				"note":             fmt.Sprintf("%.0f km mesafe %.1f saatte aşılamaz (Hız: %.0f km/s)", distanceKm, hours, speedKmH),
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
		if h.storyRepo != nil && h.securityRepo != nil && h.securityRepo.CanPublishSecurityStory(ctx, 2*time.Second) {
			caption := fmt.Sprintf(
				"🛡️ GÜVENLİK ALARMI ⚠️\nİmkansız Seyahat Tespiti (Fiziksel Hız Sınırı)!\n👤 Kullanıcı: @%s\n🔍 Sebep: Fiziksel Hız Limiti Aşıldı (%.0f km/s)\n🌐 Yeni IP: %s\n📍 Yeni Konum: %s\n🗺️ Önceki: %s\n⚡ Hız: %.0f km/s\n⏰ Zaman: %s\nFiziksel seyahat limitleri aşıldı.",
				user.Username, speedKmH, currentIP, curLoc, prevLoc, speedKmH, nowStr,
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

		// 4. Kullanıcıya Sohbet Mesajı (Tüm Kullanıcılara İletilir)
		if h.hub != nil {
			chatMsg := fmt.Sprintf(
				"🛡️ **AURA GÜVENLİK UYARISI: İMKANSIZ SEYAHAT**\n\n@%s hesabına **fiziksel olarak imkansız** bir hız ve mesafeden giriş yapıldı!\n\n📍 **Yeni Konum:** %s (IP: %s)\n🗺️ **Önceki Konum:** %s\n⚡ **Hesaplanan Hız:** %.0f km/saat\n📱 **Cihaz:** %s\n⏰ **Zaman:** %s\n\nBu işlem bir VPN kullanımı değilse, hesap ele geçirilmiş olabilir. Aura Tehdit Kalkanı sistemi 7/24 devrededir.",
				user.Username, curLoc, currentIP, prevLoc, speedKmH, currentDeviceInfo, nowStr,
			)
			h.hub.SendSecurityNotificationMessage(nil, chatMsg)
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
			alertMsg := fmt.Sprintf("⚠️ Yetkisiz Giriş Teşebbüsü (Kayıtsız Kullanıcı): @%s ile yetkisiz giriş denemesi tespit edildi! (Konum: %s)", attemptedLogin, location)
			if eventType == "failed_password_attempt" {
				alertMsg = fmt.Sprintf("⚠️ Şüpheli Giriş Engellendi (Hatalı Şifre): @%s için hatalı şifre denemesi tespit edildi! (Konum: %s)", attemptedLogin, location)
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

		// 3. Otomatik "Aura Güvenlik" Hikayesi Yayınla
		if h.storyRepo != nil && h.securityRepo != nil && h.securityRepo.CanPublishSecurityStory(ctx, 2*time.Second) {
			nowStr := time.Now().Format("15:04:05")
			caption := fmt.Sprintf(
				"🛡️ GÜVENLİK ALARMI ⚠️\nYetkisiz Giriş Teşebbüsü (Kayıtsız Kullanıcı)!\n👤 Denenen: @%s\n🔍 Sebep: Kayıtsız Kullanıcı\n🌐 IP: %s\n📍 Konum: %s\n📱 Cihaz: %s\n⏰ Zaman: %s\nAura Tehdit Kalkanı devrede.",
				attemptedLogin, ip, location, deviceInfo, nowStr,
			)
			if eventType == "failed_password_attempt" {
				caption = fmt.Sprintf(
					"🛡️ GÜVENLİK ALARMI ⚠️\nŞüpheli Giriş Engellendi (Hatalı Şifre)!\n👤 Kullanıcı: @%s\n🔍 Sebep: Hatalı Şifre\n🌐 IP: %s\n📍 Konum: %s\n📱 Cihaz: %s\n⏰ Zaman: %s\nAura Tehdit Kalkanı devrede.",
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

		// 4. Sitedeki Tüm Kullanıcılara Doğrudan Güvenlik Mesajı Gönder
		if h.hub != nil {
			nowStr := time.Now().Format("15:04:05")
			if eventType == "failed_password_attempt" {
				chatMsg := fmt.Sprintf(
					"🛡️ **AURA GÜVENLİK UYARISI: ŞÜPHELİ GİRİŞ ENGELLENDİ (HATALI ŞİFRE)**\n\n@%s hesabına az önce **hatalı bir şifre** ile başarısız giriş denemesi yapıldı.\n\n🔍 **Ayrıntı / Sebep:** Hatalı Şifre Girişi\n🌐 **Kaynak IP:** %s\n📍 **Konum:** %s\n📱 **Cihaz:** %s\n⏰ **Zaman:** %s\n\nAura Tehdit Kalkanı şüpheli giriş denemesini engelledi ve kayıt altına aldı.",
					attemptedLogin, ip, location, deviceInfo, nowStr,
				)
				h.hub.SendSecurityNotificationMessage(nil, chatMsg)
			} else if eventType == "unknown_user_attempt" {
				chatMsg := fmt.Sprintf(
					"🛡️ **AURA SİSTEM GÜVENLİK BİLGİLENDİRMESİ: YETKİSİZ GİRİŞ (KAYITSIZ KULLANICI)**\n\nSistemimize kayıtsız bir kullanıcı (@%s) ile yetkisiz giriş teşebbüsünde bulunuldu.\n\n🔍 **Ayrıntı / Sebep:** Kayıtsız Kullanıcı Adı / E-posta\n🌐 **Kaynak IP:** %s\n📍 **Konum:** %s\n📱 **Cihaz:** %s\n⏰ **Zaman:** %s\n\nAura Tehdit Kalkanı şüpheli bağlantıyı engelledi ve kayıt altına aldı.",
					attemptedLogin, ip, location, deviceInfo, nowStr,
				)
				h.hub.SendSecurityNotificationMessage(nil, chatMsg)
			}
		}
	}(ip, ua, deviceInfo, path, method)
}

func (h *AuthHandler) handleConcurrentLoginBreach(c *fiber.Ctx, user *models.User, currentIP, currentUA, currentDeviceInfo string, prevAccess *models.AccessLog, sessionOrdinal int) {
	go func(user *models.User, newIP, ua, newDeviceInfo string, prevAccess *models.AccessLog, ordinal int) {
		ctx := context.Background()
		location := ResolveIPLocation(newIP)
		eventType := "concurrent_session_login"
		nowStr := time.Now().Format("15:04:05")

		prevDevice := "Diğer Aktif Cihaz (Masaüstü / Mobil)"
		prevIP := ""
		if prevAccess != nil {
			if prevAccess.DeviceInfo != "" {
				prevDevice = prevAccess.DeviceInfo
			}
			prevIP = prevAccess.IPAddress
		}

		ordinalStr := fmt.Sprintf("%d.", ordinal)
		if ordinal <= 1 {
			ordinalStr = "yeni bir"
		}

		// 1. Veritabanına Güvenlik Olayını Kaydet (Admin audit için)
		if h.securityRepo != nil {
			_, _ = h.securityRepo.LogSecurityEvent(ctx, eventType, user.Username, newIP, ua, newDeviceInfo, map[string]interface{}{
				"location":        location,
				"prev_device":     prevDevice,
				"prev_ip":         prevIP,
				"session_ordinal": ordinal,
				"note":            fmt.Sprintf("Eşzamanlı aktif oturum tespit edildi (%s cihazdan giriş)", ordinalStr),
			})
		}

		// 2. Canlı WebSocket Güvenlik Uyarısını Yalnızca İlgili Kullanıcıya Gönder (Tüm siteye değil!)
		if h.hub != nil {
			alertMsg := fmt.Sprintf("⚠️ Eşzamanlı Oturum: @%s hesabınızda %s cihazdan giriş yapıldı! (Cihaz: %s, Konum: %s)", user.Username, ordinalStr, newDeviceInfo, location)
			alertPayload, err := auraws.NewWSMessage("security_alert", models.SecurityAlertPayload{
				EventType:      eventType,
				AttemptedLogin: user.Username,
				IPAddress:      newIP,
				Location:       location,
				DeviceInfo:     newDeviceInfo,
				Message:        alertMsg,
				Severity:       "high",
				CreatedAt:      time.Now(),
			})
			if err == nil {
				h.hub.SendToUser(user.ID, alertPayload)
			}
		}

		// 3. Yalnızca İlgili Kullanıcıya Aura Güvenlik Botundan Özel Bilgilendirme Mesajı Gönder (Tüm siteye değil!)
		if h.hub != nil {
			chatMsg := fmt.Sprintf(
				"🛡️ **AURA GÜVENLİK BİLGİLENDİRMESİ**\n\n@%s hesabınızda eşzamanlı **%s oturum** açıldı!\n\n👤 **Kullanıcı:** @%s\n📱 **Yeni Giriş Yapan Cihaz:** %s\n🌐 **IP Adresi:** %s\n📍 **Konum:** %s\n⏰ **Zaman:** %s\n💻 **Önceki Aktif Cihaz:** %s\n\nBu giriş size ait değilse, Ayarlar > Aktif Cihazlarım menüsünden **'Diğer Tüm Oturumları Kapat'** seçeneğini kullanarak diğer cihazların erişimini hemen kesebilirsiniz.",
				user.Username, ordinalStr, user.Username, newDeviceInfo, newIP, location, nowStr, prevDevice,
			)
			h.hub.SendSecurityNotificationMessage(&user.ID, chatMsg)
		}
	}(user, currentIP, currentUA, currentDeviceInfo, prevAccess, sessionOrdinal)
}

func (h *AuthHandler) handlePanicBreach(c *fiber.Ctx, user *models.User, currentIP, currentUA, currentDeviceInfo, redirectURL string) {
	go func(user *models.User, ip, ua, deviceInfo, redirect string) {
		ctx := context.Background()
		location := ResolveIPLocation(ip)
		eventType := "panic_mode_triggered"
		nowStr := time.Now().Format("15:04:05")

		// 1. Veritabanına Acil Durum / Güvenlik Olayını Kaydet
		if h.securityRepo != nil {
			_, _ = h.securityRepo.LogSecurityEvent(ctx, eventType, user.Username, ip, ua, deviceInfo, map[string]interface{}{
				"location":     location,
				"redirect_url": redirect,
				"severity":     "critical",
				"note":         "Zorlama / Panik Kodu ile giriş yapıldı! Acil durum protokolü devrede.",
			})
		}

		// 2. Canlı WebSocket Güvenlik Uyarısı Yayınla (banner)
		if h.hub != nil {
			alertMsg := fmt.Sprintf("🚨 Panik / Zorlama Kodu Tetiklendi (Acil Durum): @%s için panik protokolü devrede!", user.Username)
			h.hub.BroadcastSecurityAlert(models.SecurityAlertPayload{
				EventType:      eventType,
				AttemptedLogin: user.Username,
				IPAddress:      ip,
				Location:       location,
				DeviceInfo:     deviceInfo,
				Message:        alertMsg,
				Severity:       "critical",
				CreatedAt:      time.Now(),
			})
		}

		// 3. Aura Güvenlik Hikayesi Paylaş (Herkese Açık)
		if h.storyRepo != nil && h.securityRepo != nil && h.securityRepo.CanPublishSecurityStory(ctx, 2*time.Second) {
			caption := fmt.Sprintf(
				"🚨 ACİL DURUM PROTOKOLÜ ⚠️\nPanik / Zorlama Kodu Tetiklendi (Acil Durum)!\n👤 Kullanıcı: @%s\n🔍 Sebep: Panik Şifresi ile Giriş\n🌐 IP: %s\n📍 Konum: %s\n📱 Cihaz: %s\n⏰ Zaman: %s\nPanik şifresi devreye sokuldu. Sistem sahte oturuma yönlendirildi.",
				user.Username, ip, location, deviceInfo, nowStr,
			)

			securityStory := models.Story{
				UserID:          database.SecurityBotID,
				MediaType:       "text",
				BackgroundColor: "from-red-950 via-rose-950 to-black",
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
			} else {
				log.Printf("❌ [Security Story Error] Panik durumu hikayesi eklenemedi: %v", err)
			}
		}

		// 4. Sitedeki Tüm Kullanıcılara Aura Güvenlik Botundan Sohbet Mesajı
		if h.hub != nil {
			chatMsg := fmt.Sprintf(
				"🚨 **AURA ACİL DURUM PROTOKOLÜ: PANİK KODU AKTİF**\n\n@%s hesabında önceden tanımlanan **Zorlama / Panik Şifresi** ile acil durum girişi yapıldı!\n\n🌐 **Kaynak IP:** %s\n📍 **Konum:** %s\n📱 **Cihaz:** %s\n⏰ **Zaman:** %s\n🔗 **Yönlendirme:** %s\n\nSistem tüm gizli sohbetleri gizledi veya sahte yönlendirmeyi başlattı. Veriler koruma altındadır.",
				user.Username, ip, location, deviceInfo, nowStr, redirect,
			)
			h.hub.SendSecurityNotificationMessage(nil, chatMsg)
		}
	}(user, currentIP, currentUA, currentDeviceInfo, redirectURL)
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
			// Kendi kullanıcı adı ile panik şifresi girilirse de destekle
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
	// Yalnızca halihazırda farklı bir cihazdan/oturumdan açık ve canlı bir WebSocket bağlantısı varsa tespit et.
	// Aynı cihaz/tarayıcı (aynı X-Session-ID veya aynı IP) ya da geçmiş erişim kayıtları asla eşzamanlı oturum sayılmaz.
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

type InactivityAlertRequest struct {
	Username       string  `json:"username"`
	TimeoutMinutes int     `json:"timeout_minutes"`
	ElapsedMinutes float64 `json:"elapsed_minutes"`
	RedirectURL    string  `json:"redirect_url"`
	Reason         string  `json:"reason"`
}

var inactivityAlertThrottle sync.Map // map[string]time.Time (15 saniye içinde aynı kullanıcı için mükerrer gönderimleri engeller)

func (h *AuthHandler) handleInactivityTimeoutBreach(username, realIP, ua, deviceInfo string, timeoutMinutes int, elapsedMinutes float64, targetURL string) {
	throttleKey := strings.ToLower(username)
	if val, ok := inactivityAlertThrottle.Load(throttleKey); ok {
		if lastTime, ok := val.(time.Time); ok && time.Since(lastTime) < 15*time.Second {
			return
		}
	}
	inactivityAlertThrottle.Store(throttleKey, time.Now())

	go func() {
		ctx := context.Background()
		location := ResolveIPLocation(realIP)
		nowStr := time.Now().Format("15:04:05")
		eventType := "inactivity_timeout_redirect"

		// 1. Veritabanına Güvenlik Olayını Kaydet
		if h.securityRepo != nil {
			_, _ = h.securityRepo.LogSecurityEvent(ctx, eventType, username, realIP, ua, deviceInfo, map[string]interface{}{
				"timeout_minutes": timeoutMinutes,
				"elapsed_minutes": elapsedMinutes,
				"redirect_url":    targetURL,
				"location":        location,
				"action":          "session_terminated_and_redirected",
			})
		}

		// 2. Canlı WebSocket Güvenlik Uyarısı (Tüm online kullanıcılara/adminlere banner)
		if h.hub != nil {
			alertMsg := fmt.Sprintf("⏱️ Hareketsizlik Zaman Aşımı: @%s belirlenen süreyi (%d dk) aştı ve %s adresine yönlendirildi.", username, timeoutMinutes, targetURL)
			h.hub.BroadcastSecurityAlert(models.SecurityAlertPayload{
				EventType:      eventType,
				AttemptedLogin: username,
				IPAddress:      realIP,
				Location:       location,
				DeviceInfo:     deviceInfo,
				Message:        alertMsg,
				Severity:       "warning",
				CreatedAt:      time.Now(),
			})
		}

		// 3. Aura Güvenlik Hikayesi Paylaş (Herkese Açık)
		if h.storyRepo != nil && h.securityRepo != nil && h.securityRepo.CanPublishSecurityStory(ctx, 2*time.Second) {
			caption := fmt.Sprintf(
				"🛡️ GÜVENLİK PROTOKOLÜ ⚠️\nHareketsizlik Zaman Aşımı & Güvenli Yönlendirme!\n\n👤 Kullanıcı: @%s\n⏱️ İnaktivite Süresi: %d Dakika (Aşıldı)\n🔗 Yönlendirilen Hedef: %s\n📍 Konum: %s\n📱 Cihaz: %s\n⏰ Zaman: %s\n\nAçık kalan oturum otomatik olarak sonlandırıldı ve kullanıcı harici hedefe yönlendirildi.",
				username, timeoutMinutes, targetURL, location, deviceInfo, nowStr,
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
			} else {
				log.Printf("❌ [Security Story Error] İnaktivite durumu hikayesi eklenemedi: %v", err)
			}
		}

		// 4. Sitedeki Tüm Kullanıcılara Aura Güvenlik Botundan Doğrudan Sohbet Mesajı
		if h.hub != nil {
			chatMsg := fmt.Sprintf(
				"🛡️ **AURA GÜVENLİK BİLGİLENDİRMESİ: HAREKETSİZLİK ZAMAN AŞIMI**\n\n@%s hesabı belirlenen inaktivite süresini (**%d dakika**) aştığı için oturumu güvenlik protokolü gereği otomatik olarak sonlandırıldı ve tanımlı hedef siteye yönlendirildi.\n\n👤 **Etkilenen Kullanıcı:** @%s\n⏱️ **Hareketsiz Kalınan Süre:** %d Dakika\n🔗 **Yönlendirilen Site:** %s\n🌐 **Kaynak IP:** %s\n📍 **Konum:** %s\n📱 **Cihaz:** %s\n⏰ **İşlem Zamanı:** %s\n\nAura Tehdit Kalkanı, cihaz başında olunmayan açık oturumları korumak adına tüm oturum anahtarlarını geçersiz kılarak güvenli yönlendirmeyi tamamlamıştır.",
				username, timeoutMinutes, username, timeoutMinutes, targetURL, realIP, location, deviceInfo, nowStr,
			)
			h.hub.SendSecurityNotificationMessage(nil, chatMsg)
		}
	}()
}

// IsInactivityScheduleActive inaktivite takviminin geçerli olup olmadığını hesaplar
func IsInactivityScheduleActive(sec models.SecuritySettings, now time.Time) bool {
	if !sec.InactivityScheduleEnabled {
		return true
	}

	weekday := now.Weekday() // 0: Pazar, 6: Cumartesi
	isWeekend := weekday == time.Sunday || weekday == time.Saturday

	if isWeekend && sec.InactivityWeekendFull {
		return true
	}

	currentMinutes := now.Hour()*60 + now.Minute()

	parseTimeToMinutes := func(t string, defaultMin int) int {
		if !strings.Contains(t, ":") {
			return defaultMin
		}
		parts := strings.Split(t, ":")
		if len(parts) < 2 {
			return defaultMin
		}
		h, err1 := strconv.Atoi(parts[0])
		m, err2 := strconv.Atoi(parts[1])
		if err1 != nil || err2 != nil {
			return defaultMin
		}
		return h*60 + m
	}

	startMinutes := parseTimeToMinutes(sec.InactivityWeekdayStart, 17*60+30) // 17:30
	endMinutes := parseTimeToMinutes(sec.InactivityWeekdayEnd, 8*60+30)      // 08:30

	if startMinutes > endMinutes {
		// Geceyi aşan aralık (Örn: Hafta içi 17:30 akşam başlar, ertesi sabah 08:30'a kadar sürer)
		return currentMinutes >= startMinutes || currentMinutes < endMinutes
	} else if startMinutes < endMinutes {
		// Aynı gün içi aralık (Örn: 09:00 - 18:00)
		return currentMinutes >= startMinutes && currentMinutes < endMinutes
	}

	return true
}

func (h *AuthHandler) isUserInCall(ctx context.Context, userID uuid.UUID) bool {
	if h.rdb == nil {
		return false
	}
	key := fmt.Sprintf("in_call:%s", userID.String())
	exists, err := h.rdb.Exists(ctx, key).Result()
	return err == nil && exists > 0
}

func (h *AuthHandler) StartInactivityWorker(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	go func() {
		log.Println("🛡️ [Inactivity Worker] Arka plan inaktivite takip servisi başlatıldı (Periyot: 30s).")
		for {
			select {
			case <-ctx.Done():
				ticker.Stop()
				return
			case <-ticker.C:
				h.checkInactiveSessions(ctx)
			}
		}
	}()
}

func (h *AuthHandler) checkInactiveSessions(ctx context.Context) {
	if h.settingsRepo == nil || h.sessionRepo == nil {
		return
	}

	sec := h.settingsRepo.GetSecuritySettings(ctx)
	if !sec.InactivityLogoutEnabled {
		return
	}

	now := time.Now()
	if !IsInactivityScheduleActive(sec, now) {
		return
	}

	timeoutMinutes := sec.InactivityTimeoutMinutes
	if timeoutMinutes <= 0 {
		timeoutMinutes = 15
	}

	candidates, err := h.sessionRepo.GetInactiveSessionCandidates(ctx, timeoutMinutes)
	if err != nil || len(candidates) == 0 {
		return
	}

	targetURL := strings.TrimSpace(sec.InactivityRedirectURL)
	if targetURL == "" {
		targetURL = "https://www.google.com"
	}

	for _, cand := range candidates {
		// 1. Kullanıcı görüşmedeyse (arama devam ediyorsa) kesinlikle dokunma
		if h.isUserInCall(ctx, cand.UserID) {
			continue
		}

		// 2. Bu oturumun canlı bir WebSocket bağlantısı varsa (kullanıcı açık ekranda aktif)
		// İstemcinin kendi 1 saniyelik intervali denetler, soketi açık oturumu sunucudan aniden düşürme
		if h.hub != nil && h.hub.IsSessionConnected(cand.UserID, cand.SessionID) {
			continue
		}

		// 3. Mükerrer bildirim kontrolü: Bu oturum veya kullanıcı için zaten bildirim gönderildi mi?
		breachSessionKey := fmt.Sprintf("inactivity_breached_session:%s", cand.SessionID)
		breachUserKey := fmt.Sprintf("inactivity_breached_user:%s", cand.UserID.String())
		if h.rdb != nil {
			if exists, _ := h.rdb.Exists(ctx, breachSessionKey).Result(); exists > 0 {
				_ = h.sessionRepo.DeleteSession(ctx, cand.UserID, cand.SessionID)
				continue
			}
			if exists, _ := h.rdb.Exists(ctx, breachUserKey).Result(); exists > 0 {
				_ = h.sessionRepo.DeleteSession(ctx, cand.UserID, cand.SessionID)
				continue
			}
		}

		// 4. İhlal bayraklarını Redis'e yaz (Oturum için 10 dk, kullanıcı çakışması için 2 dk mikro-tampon)
		if h.rdb != nil {
			_ = h.rdb.Set(ctx, breachSessionKey, "1", 10*time.Minute).Err()
			_ = h.rdb.Set(ctx, breachUserKey, "1", 2*time.Minute).Err()
		}

		elapsedMinutes := float64(timeoutMinutes)
		if !cand.LastActiveAt.IsZero() {
			actualElapsed := time.Since(cand.LastActiveAt).Minutes()
			if actualElapsed > elapsedMinutes {
				elapsedMinutes = actualElapsed
			}
		}

		log.Printf("🚨 [Inactivity Worker] Süresi dolan oturum tespit edildi: @%s (Cihaz: %s, Inaktif Süre: %.1f dk, Sınır: %d dk). Bildirim yayınlanıyor...",
			cand.Username, cand.DeviceName, elapsedMinutes, timeoutMinutes)

		// 5. Güvenlik olayını tetikle, hikaye ve mesajları tam zamanında yayınla
		h.handleInactivityTimeoutBreach(
			cand.Username,
			cand.IPAddress,
			cand.UserAgent,
			cand.DeviceName,
			timeoutMinutes,
			elapsedMinutes,
			targetURL,
		)

		// 6. Oturumu ve yetkileri güvenle sonlandır
		if h.hub != nil {
			h.hub.DisconnectSession(cand.UserID, cand.SessionID)
		}
		_ = h.sessionRepo.DeleteSession(ctx, cand.UserID, cand.SessionID)

		// Kullanıcının başka açık oturumu kalmadıysa offline yap
		if h.hub != nil && !h.hub.IsUserConnected(cand.UserID) {
			if h.presenceService != nil {
				_ = h.presenceService.SetUserOffline(ctx, cand.UserID)
			}
			if h.userRepo != nil {
				_ = h.userRepo.UpdateOnlineStatus(ctx, cand.UserID, 0)
			}
		}

		// Token Version'ı arttır (JWT'leri anında geçersiz kıl)
		if h.userRepo != nil {
			newVer, _ := h.userRepo.IncrementTokenVersion(ctx, cand.UserID)
			if h.rdb != nil && newVer > 0 {
				_ = h.rdb.Set(ctx, "user:"+cand.UserID.String()+":token_version", newVer, 24*time.Hour).Err()
			}
		}
	}
}

func (h *AuthHandler) InactivityAlert(c *fiber.Ctx) error {
	var req InactivityAlertRequest
	_ = c.BodyParser(&req)

	if req.Username == "" {
		req.Username = strings.TrimSpace(c.Query("username"))
	}
	if req.RedirectURL == "" {
		req.RedirectURL = strings.TrimSpace(c.Query("redirect_url"))
	}
	if req.TimeoutMinutes <= 0 {
		if tm, err := strconv.Atoi(c.Query("timeout_minutes")); err == nil {
			req.TimeoutMinutes = tm
		}
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

	ctx := c.Context()
	var user *models.User
	if userID != uuid.Nil && h.userRepo != nil {
		user, _ = h.userRepo.GetUserByID(ctx, userID)
	}
	if user == nil && req.Username != "" && h.userRepo != nil {
		user, _ = h.userRepo.GetUserByUsername(ctx, req.Username)
	}

	username := "Kullanıcı"
	if user != nil {
		username = user.Username
		if userID == uuid.Nil {
			userID = user.ID
		}
	} else if strings.TrimSpace(req.Username) != "" {
		username = strings.TrimSpace(req.Username)
	}

	timeoutMinutes := req.TimeoutMinutes
	if timeoutMinutes <= 0 {
		if h.settingsRepo != nil {
			sec := h.settingsRepo.GetSecuritySettings(ctx)
			if sec.InactivityTimeoutMinutes > 0 {
				timeoutMinutes = sec.InactivityTimeoutMinutes
			}
		}
		if timeoutMinutes <= 0 {
			timeoutMinutes = 15
		}
	}

	targetURL := strings.TrimSpace(req.RedirectURL)
	if targetURL == "" {
		if h.settingsRepo != nil {
			sec := h.settingsRepo.GetSecuritySettings(ctx)
			if sec.InactivityRedirectURL != "" {
				targetURL = sec.InactivityRedirectURL
			}
		}
		if targetURL == "" {
			targetURL = "https://www.google.com"
		}
	}

	currentSessionID := strings.TrimSpace(c.Get("X-Session-ID"))

	// Mükerrer bildirim kontrolü: Eğer sunucu worker'ı (veya az önce başka bir istek) bu kullanıcı/oturum için zaten bildirimi attıysa:
	breachSessionKey := ""
	if currentSessionID != "" {
		breachSessionKey = fmt.Sprintf("inactivity_breached_session:%s", currentSessionID)
	}
	breachUserKey := fmt.Sprintf("inactivity_breached_user:%s", userID.String())

	alreadyBreached := false
	if h.rdb != nil {
		if breachSessionKey != "" {
			if exists, _ := h.rdb.Exists(ctx, breachSessionKey).Result(); exists > 0 {
				alreadyBreached = true
			}
		}
		if !alreadyBreached && userID != uuid.Nil {
			if exists, _ := h.rdb.Exists(ctx, breachUserKey).Result(); exists > 0 {
				alreadyBreached = true
			}
		}
	}

	if alreadyBreached {
		log.Printf("ℹ️ [Inactivity Alert] @%s için inaktivite bildirimi daha önce işlendi, mükerrer bildirim engellendi.", username)
		// Oturumu güvenle sonlandır
		if userID != uuid.Nil {
			if h.hub != nil {
				h.hub.DisconnectUser(userID)
			}
			if h.presenceService != nil {
				_ = h.presenceService.SetUserOffline(ctx, userID)
			}
			if h.userRepo != nil {
				_ = h.userRepo.UpdateOnlineStatus(ctx, userID, 0)
			}
			if h.sessionRepo != nil && currentSessionID != "" {
				_ = h.sessionRepo.DeleteSession(ctx, userID, currentSessionID)
			}
		}
		h.clearAuthCookies(c)
		return c.JSON(fiber.Map{
			"status":          "success",
			"already_handled": true,
			"message":         "İnaktivite bildirimi daha önce işlendi, oturum temizlendi.",
		})
	}

	// Eğer sunucu henüz işlememişse (örn. masa başında ekran açıkken süre dolduysa veya acil tetiklendiyse):
	if h.rdb != nil {
		if breachSessionKey != "" {
			_ = h.rdb.Set(ctx, breachSessionKey, "1", 10*time.Minute).Err()
		}
		if userID != uuid.Nil {
			_ = h.rdb.Set(ctx, breachUserKey, "1", 2*time.Minute).Err()
		}
	}

	realIP := GetRealIP(c)
	ua := c.Get("User-Agent")
	deviceInfo := database.ParseUserAgent(ua)

	// Güvenlik olayını tetikle, hikaye ve mesajları yayınla
	h.handleInactivityTimeoutBreach(username, realIP, ua, deviceInfo, timeoutMinutes, req.ElapsedMinutes, targetURL)

	// Oturumu güvenle sonlandır
	if userID != uuid.Nil {
		if h.hub != nil {
			h.hub.DisconnectUser(userID)
		}
		if h.presenceService != nil {
			_ = h.presenceService.SetUserOffline(ctx, userID)
		}
		if h.userRepo != nil {
			_ = h.userRepo.UpdateOnlineStatus(ctx, userID, 0)
		}
		if h.sessionRepo != nil && currentSessionID != "" {
			_ = h.sessionRepo.DeleteSession(ctx, userID, currentSessionID)
		}
	}

	h.clearAuthCookies(c)

	return c.JSON(fiber.Map{
		"status":  "success",
		"message": "İnaktivite güvenlik bildirimi iletildi ve oturum sonlandırıldı.",
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
			SessionID:  currentSessionID,
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

