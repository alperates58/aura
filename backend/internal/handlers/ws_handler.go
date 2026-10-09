package handlers

import (
	"net/url"
	"strings"
	"time"

	"aura/internal/config"
	"aura/internal/database"
	"aura/internal/middleware"
	auraws "aura/internal/websocket"
	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type WSHandler struct {
	cfg      config.Config
	hub      *auraws.Hub
	rdb      *redis.Client
	userRepo *database.UserRepository
}

func NewWSHandler(cfg config.Config, hub *auraws.Hub, rdb *redis.Client, userRepo *database.UserRepository) *WSHandler {
	return &WSHandler{
		cfg:      cfg,
		hub:      hub,
		rdb:      rdb,
		userRepo: userRepo,
	}
}

// isAllowedOrigin WebSocket handshake sırasında Origin başlığının güvenilir olup olmadığını doğrular (CSWSH koruması)
func (h *WSHandler) isAllowedOrigin(origin string, c *fiber.Ctx) bool {
	parsedOrigin, err := url.Parse(origin)
	if err != nil || parsedOrigin.Host == "" {
		return false
	}

	// 1. Same-Origin kontrolü: Request Host ile Origin Host eşleşiyor mu?
	reqHost := c.Hostname()
	if strings.EqualFold(parsedOrigin.Hostname(), reqHost) {
		return true
	}

	// 2. Config allowlist kontrolü: CORS_ALLOWED_ORIGINS
	if h.cfg.CORSAllowedOrigins != "" {
		allowedList := strings.Split(h.cfg.CORSAllowedOrigins, ",")
		for _, raw := range allowedList {
			allowed := strings.TrimSpace(raw)
			if allowed == "" {
				continue
			}
			if strings.EqualFold(origin, allowed) {
				return true
			}
			if pAllowed, err := url.Parse(allowed); err == nil && pAllowed.Host != "" {
				if strings.EqualFold(parsedOrigin.Host, pAllowed.Host) {
					return true
				}
			}
		}
	}

	// 3. Geliştirme ortamında localhost izinleri
	if h.cfg.Environment != "production" {
		host := strings.ToLower(parsedOrigin.Hostname())
		if host == "localhost" || host == "127.0.0.1" {
			return true
		}
	}

	return false
}

// WebSocket Upgrade Öncesi Middleware (Kimlik Doğrulama & CSWSH Koruması)
func (h *WSHandler) UpgradeMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			// CSWSH Koruması: Origin Doğrulaması
			origin := strings.TrimSpace(c.Get("Origin"))
			if origin == "" {
				// Cookie tabanlı kimlik doğrulama kullanıldığı için tarayıcı Origin başlığı zorunludur.
				if h.cfg.Environment == "production" {
					return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
						"error": "Origin başlığı eksik (CSWSH koruması).",
					})
				}
			} else {
				if !h.isAllowedOrigin(origin, c) {
					return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
						"error": "Yetkisiz Origin adresi (CSWSH koruması).",
					})
				}
			}

			// 1. Cookie kontrolü
			tokenStr := c.Cookies("access_token")

			// 2. Query param kontrolü (?token=...)
			if tokenStr == "" {
				tokenStr = c.Query("token")
			}

			// 3. Authorization header kontrolü
			if tokenStr == "" {
				authHeader := c.Get("Authorization")
				if strings.HasPrefix(authHeader, "Bearer ") {
					tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
				}
			}

			// 4. Sec-WebSocket-Protocol kontrolü
			if tokenStr == "" {
				tokenStr = c.Get("Sec-WebSocket-Protocol")
			}

			if tokenStr == "" {
				return fiber.ErrUnauthorized
			}

			claims, err := middleware.ValidateToken(tokenStr, h.cfg.JWTAccessSecret)
			if err != nil || claims.IsRefresh {
				return fiber.ErrUnauthorized
			}

			// Token Version Kontrolü (Remote Kill Session desteği)
			activeVer := 0
			if h.rdb != nil {
				val, err := h.rdb.Get(c.Context(), "user:"+claims.UserID.String()+":token_version").Int()
				if err == nil {
					activeVer = val
				}
			}
			if activeVer == 0 && h.userRepo != nil {
				u, err := h.userRepo.GetUserByID(c.Context(), claims.UserID)
				if err == nil && u != nil {
					activeVer = u.TokenVersion
					if h.rdb != nil {
						_ = h.rdb.Set(c.Context(), "user:"+claims.UserID.String()+":token_version", activeVer, 24*time.Hour).Err()
					}
				}
			}
			if activeVer > 0 && claims.TokenVersion < activeVer {
				return fiber.ErrUnauthorized
			}

			sessionID := strings.TrimSpace(c.Query("session_id"))
			if sessionID == "" {
				sessionID = strings.TrimSpace(c.Get("X-Session-ID"))
			}

			c.Locals("user_id", claims.UserID)
			c.Locals("username", claims.Username)
			c.Locals("token_version", claims.TokenVersion)
			c.Locals("session_id", sessionID)
			c.Locals("is_panic_mode", claims.IsPanicMode)
			// Sekme arka plandayken (visible=0) kurulan bağlantı kullanıcıyı çevrimiçi göstermez (WhatsApp tarzı)
			c.Locals("is_foreground", strings.TrimSpace(c.Query("visible")) != "0")
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	}
}

// WebSocket Bağlantı Karşılayıcı
func (h *WSHandler) HandleConnection() fiber.Handler {
	return websocket.New(func(conn *websocket.Conn) {
		userID := conn.Locals("user_id").(uuid.UUID)
		username := conn.Locals("username").(string)
		tokenVersion, _ := conn.Locals("token_version").(int)
		sessionID, _ := conn.Locals("session_id").(string)
		isPanicMode, _ := conn.Locals("is_panic_mode").(bool)

		client := auraws.NewClient(h.hub, conn, userID, username, sessionID, tokenVersion, isPanicMode)
		if isForeground, ok := conn.Locals("is_foreground").(bool); ok {
			client.SetForeground(isForeground)
		}
		h.hub.RegisterClient(client)

		go client.WritePump()
		client.ReadPump()
	})
}
