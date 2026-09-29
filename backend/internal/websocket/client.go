package websocket

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"aura/internal/models"
	"github.com/gofiber/contrib/websocket"
	"github.com/google/uuid"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024 // 512 KB
)

type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	userID   uuid.UUID
	username string

	// Rate limiting / Flood control
	lastWindowStart time.Time
	msgsInWindow    int
}

func NewClient(hub *Hub, conn *websocket.Conn, userID uuid.UUID, username string) *Client {
	return &Client{
		hub:      hub,
		conn:     conn,
		send:     make(chan []byte, 256),
		userID:   userID,
		username: username,
	}
}

func (c *Client) ReadPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, rawMsg, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("⚠️ Soket kapandı [%s]: %v", c.username, err)
			}
			break
		}

		var wsMsg WSMessage
		if err := json.Unmarshal(rawMsg, &wsMsg); err != nil {
			continue
		}

		c.handleAction(wsMsg)
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleAction(msg WSMessage) {
	ctx := context.Background()

	// Her gelen soket aktivitesinde kullanıcının Presence TTL süresini tazele
	_ = c.hub.presenceService.RefreshUserOnline(ctx, c.userID)

	switch msg.Action {
	case "ping":
		pongMsg, _ := NewWSMessage("pong", map[string]string{"status": "alive"})
		c.send <- pongMsg

	case "send_message":
		// Flood Koruması (Rate Limiting: Saniyede max 5 mesaj)
		now := time.Now()
		if now.Sub(c.lastWindowStart) >= time.Second {
			c.lastWindowStart = now
			c.msgsInWindow = 0
		}
		c.msgsInWindow++
		if c.msgsInWindow > 5 {
			warnPayload, _ := NewWSMessage("error", map[string]string{
				"message": "Çok hızlı mesaj gönderiyorsunuz, lütfen birkaç saniye bekleyin.",
			})
			c.send <- warnPayload
			return
		}

		var p SendMessagePayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}

		// Ban kontrolü
		senderUser, _ := c.hub.userRepo.GetUserByID(ctx, c.userID)
		if senderUser != nil && senderUser.IsBanned {
			errPayload, _ := NewWSMessage("error", map[string]string{
				"message": "Hesabınız askıya alınmıştır. Mesaj gönderemezsiniz.",
			})
			c.send <- errPayload
			return
		}

		// 1. Konuşmayı doğrula ve yetki kontrolü yap
		conv, err := c.hub.chatRepo.GetConversationByID(ctx, p.ConversationID)
		if err != nil || conv == nil {
			return
		}

		// GÜVENLİK (IDOR Önlemi): Gönderen bu konuşmanın meşru tarafı mı?
		if conv.UserOneID != c.userID && conv.UserTwoID != c.userID {
			warnPayload, _ := NewWSMessage("error", map[string]string{
				"message": "Bu sohbete mesaj gönderme yetkiniz bulunmuyor.",
			})
			c.send <- warnPayload
			return
		}

		// Engelleme Kontrolü:
		if conv.IsBlocked {
			warnPayload, _ := NewWSMessage("error", map[string]string{
				"message": "Bu konuşma engellenmiştir. Mesaj gönderemezsiniz.",
			})
			c.send <- warnPayload
			return
		}

		recipientID := conv.UserTwoID
		if conv.UserOneID != c.userID {
			recipientID = conv.UserOneID
		}

		// 2. Mesajı PostgreSQL'e kaydet (sent_at = NOW())
		msgModel := models.Message{
			ConversationID: p.ConversationID,
			SenderID:       c.userID,
			RecipientID:    recipientID,
			ReplyToID:      p.ReplyToID,
			MessageType:    p.MessageType,
			Content:        p.Content,
			MediaURL:       p.MediaURL,
			MediaMetadata:  p.MediaMetadata,
		}

		if err := c.hub.chatRepo.SaveMessage(ctx, &msgModel); err != nil {
			log.Printf("❌ Mesaj kaydedilemedi: %v", err)
			return
		}

		// 3. Gönderene Tek Gri Tik onayı (message_sent)
		sentRes := msgModel.ToResponse(c.userID)
		sentPayload, _ := NewWSMessage("message_sent", MessageSentPayload{
			TempID:  p.TempID,
			Message: sentRes,
		})
		c.send <- sentPayload

		// 4. Alıcı online mı?
		recipientOnline := c.hub.IsUserConnected(recipientID)
		if recipientOnline {
			// Alıcıya yeni mesajı bas
			newMsgForRecipient := msgModel.ToResponse(recipientID)
			newMsgPayload, _ := NewWSMessage("new_message", newMsgForRecipient)
			c.hub.SendToUser(recipientID, newMsgPayload)

			// Otomatik teslim edildi olarak işaretle ve gönderene Çift Gri Tik bas!
			deliveredIDs, deliveredAt, _ := c.hub.chatRepo.MarkMessagesAsDelivered(ctx, recipientID, []uuid.UUID{msgModel.ID})
			if len(deliveredIDs) > 0 {
				deliveredPayload, _ := NewWSMessage("message_delivered", MessageDeliveredPayload{
					MessageIDs:  deliveredIDs,
					DeliveredAt: deliveredAt,
				})
				c.hub.SendToUser(c.userID, deliveredPayload)
			}
		} else {
			// Alıcı sokete bağlı değil -> VAPID Web Push Bildirimi Gönder!
			title := c.username
			if senderUser != nil && senderUser.DisplayName != "" {
				title = senderUser.DisplayName
			}
			preview := msgModel.Content
			if msgModel.MessageType == "voice" {
				preview = "🎤 Sesli Mesaj"
			} else if msgModel.MessageType == "image" {
				preview = "📷 Fotoğraf"
			} else if msgModel.MessageType == "video" {
				preview = "🎥 Video"
			} else if msgModel.MessageType == "file" {
				preview = "📎 Dosya"
			} else if msgModel.MessageType == "location" {
				preview = "📍 Konum Paylaşımı"
			}

			c.hub.SendWebPushToUser(
				recipientID,
				title,
				preview,
				"/icon-192.png",
				"/",
			)
		}

	case "delivered_ack":
		var p DeliveredAckPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		if len(p.MessageIDs) == 0 {
			return
		}

		updatedIDs, deliveredAt, err := c.hub.chatRepo.MarkMessagesAsDelivered(ctx, c.userID, p.MessageIDs)
		if err == nil && len(updatedIDs) > 0 {
			deliveredPayload, _ := NewWSMessage("message_delivered", MessageDeliveredPayload{
				MessageIDs:  updatedIDs,
				DeliveredAt: deliveredAt,
			})
			// İlgili mesajların gönderenlerine ilet
			c.hub.BroadcastToActiveSenders(updatedIDs, deliveredPayload)
		}

	case "read_ack":
		var p ReadAckPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}

		conv, err := c.hub.chatRepo.GetConversationByID(ctx, p.ConversationID)
		if err != nil || conv == nil {
			return
		}
		if conv.UserOneID != c.userID && conv.UserTwoID != c.userID {
			return
		}

		updatedIDs, readAt, err := c.hub.chatRepo.MarkMessagesAsRead(ctx, p.ConversationID, c.userID, p.MessageIDs)
		if err == nil && len(updatedIDs) > 0 {
			readPayload, _ := NewWSMessage("message_read", MessageReadPayload{
				ConversationID: p.ConversationID,
				MessageIDs:     updatedIDs,
				ReadAt:         readAt,
			})

			// Konuşmadaki diğer tarafa (gönderene) Çift Mavi Tik bas
			otherUserID := conv.UserTwoID
			if conv.UserOneID != c.userID {
				otherUserID = conv.UserOneID
			}
			c.hub.SendToUser(otherUserID, readPayload)
		}

	case "typing_start":
		var p TypingPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}

		conv, err := c.hub.chatRepo.GetConversationByID(ctx, p.ConversationID)
		if err != nil || conv == nil {
			return
		}
		if conv.UserOneID != c.userID && conv.UserTwoID != c.userID {
			return
		}
		if conv.IsBlocked {
			return
		}

		// Redis 5s TTL
		_ = c.hub.typingService.SetTyping(ctx, p.ConversationID, c.userID)

		otherUserID := conv.UserTwoID
		if conv.UserOneID != c.userID {
			otherUserID = conv.UserOneID
		}
		typingPayload, _ := NewWSMessage("user_typing", UserTypingPayload{
			ConversationID: p.ConversationID,
			UserID:         c.userID,
			IsTyping:       true,
		})
		c.hub.SendToUser(otherUserID, typingPayload)

	case "typing_stop":
		var p TypingPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}

		conv, err := c.hub.chatRepo.GetConversationByID(ctx, p.ConversationID)
		if err != nil || conv == nil {
			return
		}
		if conv.UserOneID != c.userID && conv.UserTwoID != c.userID {
			return
		}

		_ = c.hub.typingService.RemoveTyping(ctx, p.ConversationID, c.userID)

		otherUserID := conv.UserTwoID
		if conv.UserOneID != c.userID {
			otherUserID = conv.UserOneID
		}
		typingPayload, _ := NewWSMessage("user_typing", UserTypingPayload{
			ConversationID: p.ConversationID,
			UserID:         c.userID,
			IsTyping:       false,
		})
		c.hub.SendToUser(otherUserID, typingPayload)

	case "listen_together_sync":
		var p ListenTogetherSyncPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}

		conv, err := c.hub.chatRepo.GetConversationByID(ctx, p.ConversationID)
		if err != nil || conv == nil {
			return
		}
		if conv.UserOneID != c.userID && conv.UserTwoID != c.userID {
			return
		}

		otherUserID := conv.UserTwoID
		if conv.UserOneID != c.userID {
			otherUserID = conv.UserOneID
		}

		p.SenderID = c.userID
		syncPayload, _ := NewWSMessage("listen_together_sync", p)
		c.hub.SendToUser(otherUserID, syncPayload)
	}
}
