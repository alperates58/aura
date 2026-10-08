package handlers

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"aura/internal/database"
	"aura/internal/models"
	auraws "aura/internal/websocket"
	"github.com/gofiber/fiber/v2"
)

type attemptInfo struct {
	count     int
	firstSeen time.Time
}

var (
	failedAttemptsMap sync.Map // map[string]*attemptInfo
	jailedIPsMap      sync.Map // map[string]time.Time
)

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
					DeviceInfo:     "Automated Scanner",
					Message:        fmt.Sprintf("🛡️ Kaba Kuvvet Saldırısı Engellendi: %s IP adresi 1 saat süreyle karantinaya alındı. (Konum: %s)", jailedIP, location),
					Severity:       "critical",
					CreatedAt:      time.Now(),
				})

				if h.storyRepo != nil && h.securityRepo != nil && h.securityRepo.CanPublishSecurityStory(ctx, 2*time.Second) {
					nowStr := time.Now().Format("15:04:05")
					caption := fmt.Sprintf(
						"🛡️ GÜVENLİK ALARMI ⚠️\nKaba Kuvvet Saldırısı Engellendi (IP Karantinası)!\n🌐 Engellenen IP: %s\n📍 Konum: %s\n⏰ Zaman: %s\n5 ardışık başarısız giriş denemesi sonrası IP adresi 1 saatliğine karantinaya alındı.",
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
					if err := h.storyRepo.CreateStory(ctx, &securityStory); err == nil {
						h.hub.BroadcastStoryNotification(
							database.SecurityBotID,
							"Aura Güvenlik",
							"https://api.dicebear.com/7.x/bottts/svg?seed=AuraSecurityShield&backgroundColor=1e1b4b",
							securityStory.Caption,
							"everyone",
						)
					}
				}

				chatMsg := fmt.Sprintf(
					"🛡️ **AURA GÜVENLİK UYARISI: KABA KUVVET (BRUTE-FORCE) ENGELİ**\n\nSistemimize yönelik ardışık başarısız giriş denemelerinde bulunan bir kaynak tespit edildi.\n\n🌐 **Engellenen IP:** %s\n📍 **Konum:** %s\n⏱️ **Karantina Süresi:** 1 Saat\n\nAura Tehdit Kalkanı ilgili IP adresinin tüm API ve soket erişimlerini 1 saat süreyle tamamen durdurmuştur.",
					jailedIP, location,
				)
				h.hub.SendSecurityNotificationMessage(nil, chatMsg)
			}
		}(ip)
	}
}

func (h *AuthHandler) clearFailedAttempts(ip string) {
	failedAttemptsMap.Delete(ip)
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
