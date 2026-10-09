package handlers

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"aura/internal/database"
	"aura/internal/middleware"
	"aura/internal/models"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

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

// markUserOfflineWithRealLastSeen kullanıcıyı çevrimdışı işaretler ve son görülmeyi
// kullanıcının GERÇEK son etkileşim anına (Redis user:<id>:last_active) yazar.
// Redis'te geçerli damga yoksa fallback kullanılır. Kullanıcı zaten çevrimdışıysa ve
// daha eski (doğru) bir son görülme yazılmışsa değer asla ileri taşınmaz.
func (h *AuthHandler) markUserOfflineWithRealLastSeen(ctx context.Context, userID uuid.UUID, fallback time.Time) {
	if h.presenceService != nil {
		_ = h.presenceService.SetUserOffline(ctx, userID)
	}
	if h.userRepo == nil {
		return
	}
	realLastSeen := h.presenceService.ResolveLastSeen(ctx, userID, fallback)
	if existing, err := h.userRepo.GetUserByID(ctx, userID); err == nil && existing != nil {
		if existing.OnlineStatus == 0 && !existing.LastSeenAt.IsZero() && existing.LastSeenAt.Before(realLastSeen) {
			return
		}
	}
	_ = h.userRepo.UpdateOnlineStatusWithLastSeen(ctx, userID, 0, realLastSeen)
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

		// 2. OTURUM BAĞLANTI & ÇEVRİMİÇİ KONTROLÜ (YANLIŞ ALARM ÖNLEME):
		// Kullanıcı sekmesini veya tarayıcısını kendi isteğiyle kapatmışsa (WebSocket bağlantısı yoksa ve çevrimdışıysa),
		// ortada sahipsiz/açık bırakılmış bir ekran yoktur; kullanıcı zaten daha önce kendi isteğiyle ayrılmıştır.
		// Bu nedenle tüm siteye ve sohbetlere "hareketsizlik zaman aşımı ihlali" mesajı / hikayesi ATILMAZ!
		// Yalnızca süresi dolan eski oturum kaydı veritabanından sessizce temizlenir.
		isSessionConnected := h.hub != nil && cand.SessionID != "" && h.hub.IsSessionConnected(cand.UserID, cand.SessionID)
		isUserConnected := h.hub != nil && h.hub.IsUserConnected(cand.UserID)
		isUserOnline := h.presenceService != nil && h.presenceService.IsUserOnline(ctx, cand.UserID)

		if !isSessionConnected && !isUserConnected && !isUserOnline {
			_ = h.sessionRepo.DeleteSession(ctx, cand.UserID, cand.SessionID)
			continue
		}

		if cand.SessionID != "" && !isSessionConnected {
			// Bu spesifik oturum (cihaz/sekme) artık bağlı değil, sessizce sil
			_ = h.sessionRepo.DeleteSession(ctx, cand.UserID, cand.SessionID)
			continue
		}

		// Redis'teki en son GERÇEK kullanıcı etkileşimini kontrol et (heartbeat ping'leri sayılmaz)
		if lastActiveTime, ok := h.presenceService.GetLastActive(ctx, cand.UserID); ok {
			if time.Since(lastActiveTime) < time.Duration(timeoutMinutes)*time.Minute {
				// Kullanıcı Redis'te belirlenen süre içinde aktif olmuş. DB oturum saatini gerçek etkileşim anına çek ve atma!
				_ = h.sessionRepo.TouchSessionActivityAt(ctx, cand.UserID, cand.SessionID, lastActiveTime)
				continue
			}
			if lastActiveTime.After(cand.LastActiveAt) {
				cand.LastActiveAt = lastActiveTime
			}
		}

		elapsedMinutes := float64(timeoutMinutes)
		if !cand.LastActiveAt.IsZero() {
			actualElapsed := time.Since(cand.LastActiveAt).Minutes()
			if actualElapsed > elapsedMinutes {
				elapsedMinutes = actualElapsed
			}
		}

		// Mükerrer bildirim kontrolü
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

		// İhlal bayraklarını Redis'e yaz
		if h.rdb != nil {
			_ = h.rdb.Set(ctx, breachSessionKey, "1", 10*time.Minute).Err()
			_ = h.rdb.Set(ctx, breachUserKey, "1", 5*time.Minute).Err()
		}

		log.Printf("🚨 [Inactivity Worker] İnaktivite süresini (%d dk) aşan oturum tespit edildi: @%s (Cihaz: %s, Inaktif Süre: %.1f dk). Güvenlik protokolü devreye giriyor...",
			timeoutMinutes, cand.Username, cand.DeviceName, elapsedMinutes)

		// Güvenlik olayını tetikle, hikaye ve bildirimleri yayınla
		h.handleInactivityTimeoutBreach(
			cand.Username,
			cand.IPAddress,
			cand.UserAgent,
			cand.DeviceName,
			timeoutMinutes,
			elapsedMinutes,
			targetURL,
		)

		// Oturumu ve yetkileri güvenle sonlandır (tanımlı hedef URL bilgisiyle)
		if h.hub != nil {
			h.hub.DisconnectSessionWithReason(
				cand.UserID,
				cand.SessionID,
				"inactivity_timeout",
				targetURL,
				fmt.Sprintf("Hareketsizlik nedeniyle oturumunuz sonlandırıldı ve %s adresine yönlendiriliyorsunuz.", targetURL),
			)
		}
		_ = h.sessionRepo.DeleteSession(ctx, cand.UserID, cand.SessionID)

		// Not: Soket 200ms gecikmeyle kapandığından genellikle kullanıcı burada hâlâ bağlı görünür;
		// bu durumda son görülme hub.onUserOffline içinde gerçek etkileşim anıyla yazılır.
		if h.hub != nil && !h.hub.IsUserConnected(cand.UserID) {
			fallback := cand.LastActiveAt
			if fallback.IsZero() {
				fallback = time.Now().Add(-time.Duration(timeoutMinutes) * time.Minute)
			}
			h.markUserOfflineWithRealLastSeen(ctx, cand.UserID, fallback)
		}

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

	// Kullanıcı belirlenemiyorsa sahte @Kullanıcı uyarısı gönderme!
	if user == nil {
		h.clearAuthCookies(c)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Geçerli bir kullanıcı oturumu bulunamadı.",
		})
	}

	username := user.Username
	userID = user.ID

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

	// Redis'te gerçek etkileşim damgası yoksa: istemcinin bildirdiği geçen süre, o da yoksa timeout kadar öncesi
	lastSeenFallback := time.Now().Add(-time.Duration(timeoutMinutes) * time.Minute)
	if req.ElapsedMinutes > 0 {
		lastSeenFallback = time.Now().Add(-time.Duration(req.ElapsedMinutes * float64(time.Minute)))
	}

	if alreadyBreached {
		log.Printf("ℹ️ [Inactivity Alert] @%s için inaktivite bildirimi daha önce işlendi, mükerrer bildirim engellendi.", username)
		if userID != uuid.Nil {
			if h.hub != nil {
				h.hub.DisconnectUser(userID)
			}
			h.markUserOfflineWithRealLastSeen(ctx, userID, lastSeenFallback)
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

	h.handleInactivityTimeoutBreach(username, realIP, ua, deviceInfo, timeoutMinutes, req.ElapsedMinutes, targetURL)

	if userID != uuid.Nil {
		if h.hub != nil {
			h.hub.DisconnectUser(userID)
		}
		h.markUserOfflineWithRealLastSeen(ctx, userID, lastSeenFallback)
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
