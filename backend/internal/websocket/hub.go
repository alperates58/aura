package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"aura/internal/database"
	"aura/internal/models"
	"aura/internal/push"
	auraredis "aura/internal/redis"
	"strings"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type Hub struct {
	clients         map[*Client]bool
	userClients     map[uuid.UUID]map[*Client]bool
	register        chan *Client
	unregister      chan *Client
	broadcast       chan []byte
	presenceSync    chan uuid.UUID     // Ön plan/arka plan değişikliklerinde kullanıcı çevrimiçi durumunu yeniden hesaplatır
	userOnline      map[uuid.UUID]bool // Yalnızca Run goroutine'inde erişilir: kullanıcı için en son yayınlanan çevrimiçi durumu
	mu              sync.RWMutex
	chatRepo        *database.ChatRepository
	userRepo        *database.UserRepository
	pushRepo        *database.PushRepository
	vapidService    *push.VAPIDService
	presenceService *auraredis.PresenceService
	typingService   *auraredis.TypingService
	settingsRepo    *database.SettingsRepository
	storyRepo       *database.StoryRepository
	sessionRepo     *database.SessionRepository
	rdb             *redis.Client
	instanceID      string
}

func NewHub(
	chatRepo *database.ChatRepository,
	userRepo *database.UserRepository,
	pushRepo *database.PushRepository,
	vapidService *push.VAPIDService,
	presenceService *auraredis.PresenceService,
	typingService *auraredis.TypingService,
	settingsRepo *database.SettingsRepository,
	storyRepo *database.StoryRepository,
	sessionRepo *database.SessionRepository,
	rdb *redis.Client,
) *Hub {
	return &Hub{
		clients:         make(map[*Client]bool),
		userClients:     make(map[uuid.UUID]map[*Client]bool),
		register:        make(chan *Client),
		unregister:      make(chan *Client),
		broadcast:       make(chan []byte),
		presenceSync:    make(chan uuid.UUID, 1024),
		userOnline:      make(map[uuid.UUID]bool),
		chatRepo:        chatRepo,
		userRepo:        userRepo,
		pushRepo:        pushRepo,
		vapidService:    vapidService,
		presenceService: presenceService,
		typingService:   typingService,
		settingsRepo:    settingsRepo,
		storyRepo:       storyRepo,
		sessionRepo:     sessionRepo,
		rdb:             rdb,
		instanceID:      uuid.New().String(),
	}
}

func (h *Hub) RegisterClient(client *Client) {
	h.register <- client
}

func (h *Hub) Run() {
	if h.rdb != nil {
		go h.listenRedisEvents()
	}

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			if _, ok := h.userClients[client.userID]; !ok {
				h.userClients[client.userID] = make(map[*Client]bool)
			}
			// Çevrimiçi durumu "ilk bağlantı" ile değil, "en az bir ÖN PLAN bağlantısı" kuralıyla hesaplanır (WhatsApp tarzı)
			h.userClients[client.userID][client] = true
			h.mu.Unlock()

			h.syncUserPresence(client.userID)
			// (Arka planda açılan/yeniden bağlanan sekme kullanıcıyı çevrimiçi göstermez)


			// Kullanıcı bağlandığında, henüz teslim edilmemiş bekleyen mesajları ilet
			// Panik modundaki oturumlara gizlilik koruması gereği bekleyen mesajlar iletilmez
			if !client.isPanicMode {
				go h.deliverPendingMessages(client)
			}

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			// Bağlantı kaldırıldıktan sonra kullanıcının çevrimiçi durumu yeniden hesaplanır
			if clients, ok := h.userClients[client.userID]; ok {
				delete(clients, client)
				if len(clients) == 0 {
					delete(h.userClients, client.userID)
					// Kullanıcının bu podda başka bağlantısı kalmadı
				}
			}
			h.mu.Unlock()

			h.syncUserPresence(client.userID)
			// (Zaten arka planda/çevrimdışı olan kullanıcı için son görülme tekrar ezilmez)


		case userID := <-h.presenceSync:
			// İstemci ön plana/arka plana geçti → kullanıcı düzeyindeki çevrimiçi durumu uzlaştır
			h.syncUserPresence(userID)

		case message := <-h.broadcast:
			h.broadcastToLocal(message)
			h.publishRedisEvent("broadcast", nil, nil, message)
		}
	}
}

// RequestPresenceSync bir istemcinin ön plan/arka plan durumu değiştiğinde kullanıcının
// çevrimiçi durumunun Run goroutine'inde (sıralı ve yarışsız) yeniden hesaplanmasını ister.
func (h *Hub) RequestPresenceSync(userID uuid.UUID) {
	h.presenceSync <- userID
}

// syncUserPresence WHATSAPP TARZI ÇEVRİMİÇİ KURALI: Kullanıcı, bu poddaki bağlantılarından EN AZ BİRİ
// ön plandaysa (sekme görünür / uygulama açık) çevrimiçidir. Tüm bağlantıları arka planda ise (Chrome alta
// alındı, ekran kilitlendi) soket açık kalsa bile çevrimdışı görünür ve son görülme yazılır.
// Yalnızca durum DEĞİŞTİĞİNDE yayın yapılır. YALNIZCA Run goroutine'inden çağrılmalıdır.
func (h *Hub) syncUserPresence(userID uuid.UUID) {
	h.mu.RLock()
	shouldBeOnline := false
	for c := range h.userClients[userID] {
		if c.IsForeground() {
			shouldBeOnline = true
			break
		}
	}
	h.mu.RUnlock()

	wasOnline := h.userOnline[userID]
	if shouldBeOnline == wasOnline {
		return
	}

	if shouldBeOnline {
		h.userOnline[userID] = true
		h.onUserOnline(userID)
	} else {
		delete(h.userOnline, userID)
		h.onUserOffline(userID)
	}
}

func (h *Hub) onUserOnline(userID uuid.UUID) {
	ctx := context.Background()
	_ = h.presenceService.SetUserOnline(ctx, userID)
	_ = h.userRepo.UpdateOnlineStatus(ctx, userID, 1)

	lastSeenAt := time.Now()
	status := 1

	if h.userRepo != nil {
		user, _ := h.userRepo.GetUserByID(ctx, userID)
		if user != nil && len(user.PrivacySettings) > 0 {
			var ps models.PrivacySettings
			if err := json.Unmarshal(user.PrivacySettings, &ps); err == nil {
				if !ps.LastSeen {
					// 4.4 Düzeltmesi: Son görülme kapalıysa online durumu ve saat sızdırılmaz
					lastSeenAt = time.Time{}
					status = 0
				}
			}
		}
	}

	payload, _ := NewWSMessage("presence_update", PresenceUpdatePayload{
		UserID:     userID,
		Status:     status,
		LastSeenAt: lastSeenAt,
	})
	h.BroadcastToAll(payload)
	log.Printf("🟢 [Online] Kullanıcı bağlandı: %s", userID)
}

func (h *Hub) DisconnectUser(userID uuid.UUID) {
	h.mu.RLock()
	clients, ok := h.userClients[userID]
	var toClose []*Client
	if ok && len(clients) > 0 {
		for c := range clients {
			toClose = append(toClose, c)
		}
	}
	h.mu.RUnlock()

	if len(toClose) == 0 {
		h.onUserOffline(userID)
		return
	}

	for _, c := range toClose {
		_ = c.conn.Close()
	}
}

// TerminateOtherSessions kullanıcının diğer açık oturumlarına uyarı gönderip bağlantılarını sonlandırır.
// excludeSessionID: İşlemi başlatan aktif cihazın oturum kimliği (bu cihaz kapatılmaz ve tokenVersion'ı güncellenir).
func (h *Hub) TerminateOtherSessions(userID uuid.UUID, excludeSessionID string, newVer int) {
	h.mu.RLock()
	clients, ok := h.userClients[userID]
	var toClose []*Client
	if ok && len(clients) > 0 {
		for c := range clients {
			if excludeSessionID != "" && c.sessionID == excludeSessionID {
				// İşlemi yapan cihaz açık kalır, tokenVersion değeri yeni versiyona eşitlenir
				c.tokenVersion = newVer
			} else {
				toClose = append(toClose, c)
			}
		}
	}
	h.mu.RUnlock()

	termMsg, _ := NewWSMessage("session_terminated", map[string]string{
		"reason":  "remote_kill",
		"message": "Bu oturum başka bir cihazdan uzaktan sonlandırıldı.",
	})

	for _, c := range toClose {
		client := c
		select {
		case client.send <- termMsg:
		default:
		}
		// Paketin istemciye TCP üzerinden basılabilmesi için 200ms mühlet tanı
		time.AfterFunc(200*time.Millisecond, func() {
			_ = client.conn.Close()
		})
	}
}

// DisconnectSession belirli bir istemcinin oturumunu (sessionID) anında sonlandırır.
func (h *Hub) DisconnectSession(userID uuid.UUID, sessionID string) {
	h.DisconnectSessionWithReason(userID, sessionID, "session_deleted", "", "Bu cihazdaki oturumunuz kullanıcı tarafından kapatıldı.")
}

// DisconnectSessionWithReason belirli bir istemcinin oturumunu özel bir sebep ve yönlendirme hedefiyle sonlandırır
func (h *Hub) DisconnectSessionWithReason(userID uuid.UUID, sessionID string, reason, redirectURL, message string) {
	h.mu.RLock()
	clients, ok := h.userClients[userID]
	var toClose []*Client
	if ok && len(clients) > 0 {
		for c := range clients {
			if c.sessionID == sessionID {
				toClose = append(toClose, c)
			}
		}
	}
	h.mu.RUnlock()

	payload := map[string]string{
		"reason":  reason,
		"message": message,
	}
	if redirectURL != "" {
		payload["redirect_url"] = redirectURL
	}

	termMsg, _ := NewWSMessage("session_terminated", payload)

	for _, c := range toClose {
		client := c
		select {
		case client.send <- termMsg:
		default:
		}
		time.AfterFunc(200*time.Millisecond, func() {
			_ = client.conn.Close()
		})
	}
}

// DisconnectAllUsers sistemdeki tüm bağlı WebSocket istemcilerini anında sonlandırır.
func (h *Hub) DisconnectAllUsers() {
	h.mu.RLock()
	var allClients []*Client
	for client := range h.clients {
		allClients = append(allClients, client)
	}
	h.mu.RUnlock()

	termMsg, _ := NewWSMessage("session_terminated", map[string]string{
		"reason":  "emergency_global_logout",
		"message": "Sistem yöneticisi tarafından tüm oturumlar kapatıldı.",
	})

	for _, c := range allClients {
		client := c
		select {
		case client.send <- termMsg:
		default:
		}
		time.AfterFunc(100*time.Millisecond, func() {
			_ = client.conn.Close()
		})
	}
}

func (h *Hub) onUserOffline(userID uuid.UUID) {
	ctx := context.Background()
	_ = h.presenceService.SetUserOffline(ctx, userID)

	// SON GÖRÜLME = GERÇEK SON ETKİLEŞİM ANI (bağlantının koptuğu an DEĞİL!)
	// Örn: Kullanıcı 07:48'de son mesajını atıp telefonu kilitlediyse ve soket 08:18'de
	// inaktivite zaman aşımıyla kapatıldıysa son görülme 07:48 olmalıdır, 08:18 değil.
	// Oturum son aktiflik saatleri de artık NOW() ile ezilmez (inaktivite ölçümü bozulmasın).
	realLastSeen := h.presenceService.ResolveLastSeen(ctx, userID, time.Now())
	_ = h.userRepo.UpdateOnlineStatusWithLastSeen(ctx, userID, 0, realLastSeen)

	lastSeenAt := realLastSeen
	if h.userRepo != nil {
		user, _ := h.userRepo.GetUserByID(ctx, userID)
		if user != nil && len(user.PrivacySettings) > 0 {
			var ps models.PrivacySettings
			if err := json.Unmarshal(user.PrivacySettings, &ps); err == nil {
				if !ps.LastSeen {
					// 4.4 Düzeltmesi: Son görülme kapalıysa çıkış zamanı sızdırılmaz
					lastSeenAt = time.Time{}
				}
			}
		}
	}

	payload, _ := NewWSMessage("presence_update", PresenceUpdatePayload{
		UserID:     userID,
		Status:     0,
		LastSeenAt: lastSeenAt,
	})
	h.BroadcastToAll(payload)
	log.Printf("🔴 [Offline] Kullanıcı ayrıldı: %s", userID)
}

func (h *Hub) deliverPendingMessages(client *Client) {
	if client == nil || client.isPanicMode {
		return
	}
	recipientID := client.userID
	ctx := context.Background()
	pending, err := h.chatRepo.GetUndeliveredMessagesForUser(ctx, recipientID)
	if err != nil || len(pending) == 0 {
		return
	}

	var messageIDs []uuid.UUID
	for _, m := range pending {
		messageIDs = append(messageIDs, m.ID)
		// Alıcının soketine mesajı push et
		msgPayload, _ := NewWSMessage("new_message", m.ToResponse(recipientID))
		h.SendToUser(recipientID, msgPayload)
	}

	// Teslim edildi olarak DB'de güncelle
	updatedIDs, deliveredAt, _ := h.chatRepo.MarkMessagesAsDelivered(ctx, recipientID, messageIDs)
	if len(updatedIDs) > 0 {
		deliveredPayload, _ := NewWSMessage("message_delivered", MessageDeliveredPayload{
			MessageIDs:  updatedIDs,
			DeliveredAt: deliveredAt,
		})
		h.NotifySendersDelivered(ctx, updatedIDs, deliveredPayload)
	}
}

func (h *Hub) SendToUser(userID uuid.UUID, message []byte) {
	h.sendToLocalUser(userID, message)
	h.publishRedisEvent("user", &userID, nil, message)
}

func (h *Hub) sendToLocalUser(userID uuid.UUID, message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if clients, ok := h.userClients[userID]; ok {
		for client := range clients {
			if client.isPanicMode {
				// 4.3 Düzeltmesi: Panik modundaki oturumlara gizlilik ihlali olmaması için gerçek sohbet ve arama paketleri iletilmez
				continue
			}
			select {
			case client.send <- message:
			default:
			}
		}
	}
}

func (h *Hub) IsUserConnected(userID uuid.UUID) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.userClients[userID]) > 0
}

// IsSessionConnected belirli bir kullanıcının sessionID kimlikli canlı WebSocket bağlantısı olup olmadığını döndürür
func (h *Hub) IsSessionConnected(userID uuid.UUID, sessionID string) bool {
	if sessionID == "" {
		return false
	}
	h.mu.RLock()
	defer h.mu.RUnlock()

	clients, ok := h.userClients[userID]
	if !ok || len(clients) == 0 {
		return false
	}

	for c := range clients {
		if c.sessionID == sessionID {
			return true
		}
	}
	return false
}

// HasActiveSessionExcluding kullanıcının halihazırda farklı bir cihazda/tarayıcıda açık ve canlı bir WebSocket oturumu olup olmadığını denetler.
func (h *Hub) HasActiveSessionExcluding(userID uuid.UUID, excludeSessionID string, currentIP string) (bool, int, string, string) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	clients, ok := h.userClients[userID]
	if !ok || len(clients) == 0 {
		return false, 0, "", ""
	}

	activeCount := 0
	var firstOtherDevInfo, firstOtherDevIP string

	for c := range clients {
		// Aynı tarayıcı/cihaz oturum kimliği ise eşzamanlı farklı cihaz sayılmaz
		if excludeSessionID != "" && c.sessionID != "" && c.sessionID == excludeSessionID {
			continue
		}

		clientIP := ""
		if c.conn != nil && c.conn.RemoteAddr() != nil {
			clientIP = c.conn.RemoteAddr().String()
			if idx := strings.LastIndex(clientIP, ":"); idx != -1 {
				clientIP = clientIP[:idx]
			}
		}

		// Oturum kimliği gönderilmemiş olsa bile aynı IP adresi ise aynı yerel ağ/cihazdır
		if excludeSessionID == "" && clientIP != "" && currentIP != "" && clientIP == currentIP {
			continue
		}

		activeCount++
		if firstOtherDevInfo == "" {
			firstOtherDevInfo = "Aktif Oturum (Masaüstü / Mobil)"
			firstOtherDevIP = clientIP
		}
	}

	if activeCount > 0 {
		return true, activeCount, firstOtherDevInfo, firstOtherDevIP
	}

	return false, 0, "", ""
}

func (h *Hub) BroadcastToAll(message []byte) {
	h.broadcastToLocal(message)
	h.publishRedisEvent("broadcast", nil, nil, message)
}

func (h *Hub) broadcastToLocal(message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		if client.isPanicMode {
			continue
		}
		select {
		case client.send <- message:
		default:
		}
	}
}

func (h *Hub) NotifySendersDelivered(ctx context.Context, messageIDs []uuid.UUID, payload []byte) {
	if len(messageIDs) == 0 {
		return
	}
	senders, err := h.chatRepo.GetMessageSenders(ctx, messageIDs)
	if err != nil || len(senders) == 0 {
		return
	}
	for _, sID := range senders {
		h.SendToUser(sID, payload)
	}
}

func (h *Hub) BroadcastToActiveSenders(messageIDs []uuid.UUID, payload []byte) {
	h.NotifySendersDelivered(context.Background(), messageIDs, payload)
}

func (h *Hub) SendWebPushToUser(userID uuid.UUID, title, body, icon, url string) {
	if h.pushRepo == nil || h.vapidService == nil {
		return
	}

	go func() {
		ctx := context.Background()
		subs, err := h.pushRepo.GetSubscriptionsForUser(ctx, userID)
		if err != nil || len(subs) == 0 {
			return
		}

		silent := false
		if h.settingsRepo != nil {
			notifSettings := h.settingsRepo.GetNotificationSettings(ctx)
			if !notifSettings.EnableSoundAlerts {
				silent = true
			}
		}

		if h.userRepo != nil {
			user, _ := h.userRepo.GetUserByID(ctx, userID)
			if user != nil && len(user.PrivacySettings) > 0 {
				var ps models.PrivacySettings
				if err := json.Unmarshal(user.PrivacySettings, &ps); err == nil {
					if !ps.SoundAlerts {
						silent = true
					}
				}
			}
		}

		for _, sub := range subs {
			_ = h.vapidService.SendPush(sub, title, body, icon, url, silent)
		}
	}()
}

func (h *Hub) BroadcastStoryNotification(authorID uuid.UUID, authorName, authorAvatar, caption, audience string) {
	// 1. WebSocket Broadcast
	payload := map[string]interface{}{
		"action": "new_story",
		"payload": map[string]interface{}{
			"user_id":       authorID,
			"author_name":   authorName,
			"author_avatar": authorAvatar,
			"caption":       caption,
			"audience":      audience,
		},
	}
	jsonBytes, err := json.Marshal(payload)
	if err == nil {
		if audience == "close_friends" {
			// 5.4 Düzeltmesi: Yakın arkadaşlar hikayesi sızdırılmadan yalnızca yazara ve arkadaşlarına iletilir
			h.SendToUser(authorID, jsonBytes)
			if h.storyRepo != nil {
				friends, err := h.storyRepo.GetCloseFriends(context.Background(), authorID)
				if err == nil {
					for _, f := range friends {
						h.SendToUser(f.ID, jsonBytes)
					}
				}
			}
			log.Printf("📢 [Story Hub] 'new_story' (Yakın Arkadaşlar) bildirimi iletildi (Yazar: %s)", authorName)
		} else {
			h.BroadcastToAll(jsonBytes)
			log.Printf("📢 [Story Hub] 'new_story' bildirimi %d soket istemcisine yayınlandı (Yazar: %s)", len(h.clients), authorName)
		}
	}

	// 2. Web Push Notification: close_friends ise genel kitleye push atma
	if audience == "close_friends" {
		return
	}

	if h.pushRepo == nil || h.vapidService == nil {
		log.Printf("⚠️ [Story Push] Push servisi veya repo yapılandırılmamış.")
		return
	}

	go func() {
		ctx := context.Background()
		subs, err := h.pushRepo.GetAllSubscriptionsExceptUser(ctx, authorID)
		if err != nil {
			log.Printf("⚠️ [Story Push] Aboneler çekilirken hata: %v", err)
			return
		}
		if len(subs) == 0 {
			log.Printf("ℹ️ [Story Push] Yazar dışındaki diğer kullanıcılar için kayıtlı push aboneliği bulunamadı.")
			return
		}

		log.Printf("📱 [Story Push] %d adet kayıtlı aboneye Web Push bildirimi iletiliyor (Yazar: %s)...", len(subs), authorName)

		title := authorName
		body := "Yeni bir hikaye paylaştı 📸"
		if len(caption) > 0 {
			body = fmt.Sprintf("Yeni bir hikaye paylaştı: \"%s\"", caption)
		}
		icon := authorAvatar
		if icon == "" {
			icon = "/favicon.ico"
		}
		url := "/"

		for _, sub := range subs {
			silent := false
			if h.settingsRepo != nil {
				notifSettings := h.settingsRepo.GetNotificationSettings(ctx)
				if !notifSettings.EnableSoundAlerts {
					silent = true
				}
			}
			if h.userRepo != nil {
				user, _ := h.userRepo.GetUserByID(ctx, sub.UserID)
				if user != nil && len(user.PrivacySettings) > 0 {
					var ps models.PrivacySettings
					if err := json.Unmarshal(user.PrivacySettings, &ps); err == nil {
						if !ps.SoundAlerts {
							silent = true
						}
					}
				}
			}
			_ = h.vapidService.SendPushWithTag(sub, title, body, icon, url, "aura-story", silent)
		}
	}()
}

func (h *Hub) BroadcastStoryDeleted(storyID, authorID uuid.UUID) {
	payload := map[string]interface{}{
		"action": "story_deleted",
		"payload": map[string]interface{}{
			"story_id":  storyID,
			"author_id": authorID,
		},
	}
	jsonBytes, err := json.Marshal(payload)
	if err == nil {
		h.BroadcastToAll(jsonBytes)
	}
}

func (h *Hub) BroadcastStoryReaction(storyID, authorID, senderID uuid.UUID, senderName string, reaction string) {
	payload := map[string]interface{}{
		"action": "story_reaction",
		"payload": map[string]interface{}{
			"story_id":    storyID,
			"sender_id":   senderID,
			"sender_name": senderName,
			"reaction":    reaction,
		},
	}
	jsonBytes, err := json.Marshal(payload)
	if err == nil {
		// Yalnızca hikaye sahibine gönder
		h.SendToUser(authorID, jsonBytes)
	}
}

func (h *Hub) GetActiveConnectionsCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func (h *Hub) GetActiveUsersCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.userClients)
}

func (h *Hub) BroadcastSecurityAlert(alert models.SecurityAlertPayload) {
	payload := map[string]interface{}{
		"action":  "security_alert",
		"payload": alert,
	}
	jsonBytes, err := json.Marshal(payload)
	if err == nil {
		h.BroadcastToAll(jsonBytes)
		log.Printf("🛡️ [Security Hub] Güvenlik uyarısı yayınlandı: %s (IP: %s)", alert.AttemptedLogin, alert.IPAddress)
	}
}

// SendSecurityNotificationMessage Aura Güvenlik resmi botundan hedef kullanıcıya (veya herkese) doğrudan sohbet mesajı iletir.
func (h *Hub) SendSecurityNotificationMessage(targetUserID *uuid.UUID, content string) {
	if h.chatRepo == nil {
		return
	}

	go func() {
		ctx := context.Background()

		var targetIDs []uuid.UUID
		if targetUserID != nil {
			targetIDs = []uuid.UUID{*targetUserID}
		} else if h.userRepo != nil {
			// Genel sistem duyurusu ise tüm kayıtlı ve aktif kullanıcılara gönder (security bot hariç)
			ids, err := h.userRepo.GetAllActiveUserIDs(ctx, database.SecurityBotID)
			if err == nil {
				targetIDs = ids
			}
		}

		for _, recID := range targetIDs {
			// 1. Bot ile kullanıcı arasında konuşma oluştur veya al
			conv, err := h.chatRepo.GetOrCreateConversation(ctx, database.SecurityBotID, recID)
			if err != nil {
				log.Printf("⚠️ [Security Hub] Güvenlik konuşması oluşturulamadı: %v", err)
				continue
			}

			// 2. Mesajı veritabanına kaydet
			msgModel := models.Message{
				ConversationID: conv.ID,
				SenderID:       database.SecurityBotID,
				RecipientID:    recID,
				MessageType:    "text",
				Content:        content,
			}
			if err := h.chatRepo.SaveMessage(ctx, &msgModel); err != nil {
				log.Printf("⚠️ [Security Hub] Güvenlik mesajı kaydedilemedi: %v", err)
				continue
			}

			// 3. Kullanıcı sokete bağlıysa anlık new_message fırlat
			if h.IsUserConnected(recID) {
				newMsgForRecipient := msgModel.ToResponse(recID)
				newMsgPayload, err := NewWSMessage("new_message", newMsgForRecipient)
				if err == nil {
					h.SendToUser(recID, newMsgPayload)
				}
				// Otomatik teslim edildi işaretle
				_, _, _ = h.chatRepo.MarkMessagesAsDelivered(ctx, recID, []uuid.UUID{msgModel.ID})
			} else {
				// Kullanıcı bağlı değilse Web Push bildirimi yolla
				h.SendWebPushToUser(
					recID,
					"🛡️ Aura Güvenlik",
					content,
					"/icon-192.png",
					"/",
				)
			}
		}
	}()
}

// listenRedisEvents Redis Pub/Sub üzerinden diğer podlardan gelen sohbet eventlerini dinler (Item 7.1)
func (h *Hub) listenRedisEvents() {
	ctx := context.Background()
	pubsub := h.rdb.Subscribe(ctx, "aura_chat_events")
	defer pubsub.Close()

	ch := pubsub.Channel()
	for msg := range ch {
		var evt struct {
			Type      string          `json:"type"`
			TargetID  *uuid.UUID      `json:"target_id,omitempty"`
			TargetIDs []uuid.UUID     `json:"target_ids,omitempty"`
			Payload   json.RawMessage `json:"payload"`
			SenderPod string          `json:"sender_pod"`
		}
		if err := json.Unmarshal([]byte(msg.Payload), &evt); err != nil {
			continue
		}
		if evt.SenderPod == h.instanceID {
			continue // Kendi podumuzun yayınladığı paketi tekrar basma
		}

		switch evt.Type {
		case "user":
			if evt.TargetID != nil {
				h.sendToLocalUser(*evt.TargetID, evt.Payload)
			}
		case "broadcast":
			h.broadcastToLocal(evt.Payload)
		case "senders":
			for _, id := range evt.TargetIDs {
				h.sendToLocalUser(id, evt.Payload)
			}
		}
	}
}

// publishRedisEvent yerel sunucuda oluşan bir olayı Redis Pub/Sub üzerinden diğer podlara yayar (Item 7.1)
func (h *Hub) publishRedisEvent(evtType string, targetID *uuid.UUID, targetIDs []uuid.UUID, payload []byte) {
	if h.rdb == nil {
		return
	}
	evt := map[string]interface{}{
		"type":       evtType,
		"target_id":  targetID,
		"target_ids": targetIDs,
		"payload":    json.RawMessage(payload),
		"sender_pod": h.instanceID,
	}
	data, err := json.Marshal(evt)
	if err == nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_ = h.rdb.Publish(ctx, "aura_chat_events", data).Err()
		cancel()
	}
}


