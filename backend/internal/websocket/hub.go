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
	"github.com/google/uuid"
)

type Hub struct {
	clients         map[*Client]bool
	userClients     map[uuid.UUID]map[*Client]bool
	register        chan *Client
	unregister      chan *Client
	broadcast       chan []byte
	mu              sync.RWMutex
	chatRepo        *database.ChatRepository
	userRepo        *database.UserRepository
	pushRepo        *database.PushRepository
	vapidService    *push.VAPIDService
	presenceService *auraredis.PresenceService
	typingService   *auraredis.TypingService
	settingsRepo    *database.SettingsRepository
}

func NewHub(
	chatRepo *database.ChatRepository,
	userRepo *database.UserRepository,
	pushRepo *database.PushRepository,
	vapidService *push.VAPIDService,
	presenceService *auraredis.PresenceService,
	typingService *auraredis.TypingService,
	settingsRepo *database.SettingsRepository,
) *Hub {
	return &Hub{
		clients:         make(map[*Client]bool),
		userClients:     make(map[uuid.UUID]map[*Client]bool),
		register:        make(chan *Client),
		unregister:      make(chan *Client),
		broadcast:       make(chan []byte),
		chatRepo:        chatRepo,
		userRepo:        userRepo,
		pushRepo:        pushRepo,
		vapidService:    vapidService,
		presenceService: presenceService,
		typingService:   typingService,
		settingsRepo:    settingsRepo,
	}
}

func (h *Hub) RegisterClient(client *Client) {
	h.register <- client
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			if _, ok := h.userClients[client.userID]; !ok {
				h.userClients[client.userID] = make(map[*Client]bool)
			}
			isFirstConn := len(h.userClients[client.userID]) == 0
			h.userClients[client.userID][client] = true
			h.mu.Unlock()

			if isFirstConn {
				h.onUserOnline(client.userID)
			}

			// Kullanıcı bağlandığında, henüz teslim edilmemiş bekleyen mesajları ilet
			go h.deliverPendingMessages(client.userID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			isLastConn := false
			if clients, ok := h.userClients[client.userID]; ok {
				delete(clients, client)
				if len(clients) == 0 {
					delete(h.userClients, client.userID)
					isLastConn = true
				}
			}
			h.mu.Unlock()

			if isLastConn {
				h.onUserOffline(client.userID)
			}

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) onUserOnline(userID uuid.UUID) {
	ctx := context.Background()
	_ = h.presenceService.SetUserOnline(ctx, userID)
	_ = h.userRepo.UpdateOnlineStatus(ctx, userID, 1)

	payload, _ := NewWSMessage("presence_update", PresenceUpdatePayload{
		UserID:     userID,
		Status:     1,
		LastSeenAt: time.Now(),
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

func (h *Hub) onUserOffline(userID uuid.UUID) {
	ctx := context.Background()
	_ = h.presenceService.SetUserOffline(ctx, userID)
	_ = h.userRepo.UpdateOnlineStatus(ctx, userID, 0)

	payload, _ := NewWSMessage("presence_update", PresenceUpdatePayload{
		UserID:     userID,
		Status:     0,
		LastSeenAt: time.Now(),
	})
	h.BroadcastToAll(payload)
	log.Printf("🔴 [Offline] Kullanıcı ayrıldı: %s", userID)
}

func (h *Hub) deliverPendingMessages(recipientID uuid.UUID) {
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
		h.BroadcastToActiveSenders(updatedIDs, deliveredPayload)
	}
}

func (h *Hub) SendToUser(userID uuid.UUID, message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if clients, ok := h.userClients[userID]; ok {
		for client := range clients {
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

func (h *Hub) BroadcastToAll(message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		select {
		case client.send <- message:
		default:
		}
	}
}

func (h *Hub) BroadcastToActiveSenders(messageIDs []uuid.UUID, payload []byte) {
	// Teslim edilen mesajların gönderenlerine Çift Gri Tik basmak için
	h.BroadcastToAll(payload)
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
	// 1. WebSocket Broadcast to active clients (close_friends ise sadece yazar ve arkadaşlarına ileride filtrelenebilir, genel bildirim güvenli tutulur)
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
		h.BroadcastToAll(jsonBytes)
		log.Printf("📢 [Story Hub] 'new_story' bildirimi %d soket istemcisine yayınlandı (Yazar: %s)", len(h.clients), authorName)
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

