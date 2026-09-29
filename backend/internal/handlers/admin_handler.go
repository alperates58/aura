package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"runtime"
	"strconv"
	"strings"
	"time"

	"aura/internal/database"
	"aura/internal/livekit"
	"aura/internal/middleware"
	"aura/internal/storage"
	auraws "aura/internal/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type AdminHandler struct {
	userRepo       *database.UserRepository
	settingsRepo   *database.SettingsRepository
	logRepo        *database.AccessRepository
	callRepo       *database.CallRepository
	storageService *storage.StorageService
	livekitService *livekit.LiveKitService
	redisClient    *redis.Client
	hub            *auraws.Hub
	startTime      time.Time
}

func NewAdminHandler(
	userRepo *database.UserRepository,
	settingsRepo *database.SettingsRepository,
	logRepo *database.AccessRepository,
	callRepo *database.CallRepository,
	storageService *storage.StorageService,
	livekitService *livekit.LiveKitService,
	redisClient *redis.Client,
	hub *auraws.Hub,
) *AdminHandler {
	return &AdminHandler{
		userRepo:       userRepo,
		settingsRepo:   settingsRepo,
		logRepo:        logRepo,
		callRepo:       callRepo,
		storageService: storageService,
		livekitService: livekitService,
		redisClient:    redisClient,
		hub:            hub,
		startTime:      time.Now(),
	}
}

// Middleware: Admin Yetki Kontrolü
func (h *AdminHandler) RequireAdmin(c *fiber.Ctx) error {
	var userID uuid.UUID
	if val := c.Locals("user_id"); val != nil {
		if id, ok := val.(uuid.UUID); ok {
			userID = id
		} else if str, ok := val.(string); ok {
			userID, _ = uuid.Parse(str)
		}
	}
	if userID == uuid.Nil {
		if val := c.Locals("userID"); val != nil {
			if id, ok := val.(uuid.UUID); ok {
				userID = id
			} else if str, ok := val.(string); ok {
				userID, _ = uuid.Parse(str)
			}
		}
	}

	if userID == uuid.Nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Giriş yapmalısınız"})
	}

	user, err := h.userRepo.GetUserByID(context.Background(), userID)
	if err != nil || user == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Kullanıcı bulunamadı"})
	}

	if user.Role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Bu işlem için yönetici (Admin) yetkisi gereklidir."})
	}

	if user.IsBanned {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Hesabınız askıya alınmıştır."})
	}

	return c.Next()
}

// 1. Ayarları Getir
func (h *AdminHandler) GetSettings(c *fiber.Ctx) error {
	settings, err := h.settingsRepo.GetAllSettings(context.Background())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Ayarlar yüklenemedi"})
	}
	return c.JSON(settings)
}

// 2. Ayarları Güncelle
type UpdateSettingRequest struct {
	Key   string          `json:"key"`
	Value json.RawMessage `json:"value"`
}

func (h *AdminHandler) UpdateSetting(c *fiber.Ctx) error {
	var req UpdateSettingRequest
	if err := c.BodyParser(&req); err != nil || req.Key == "" || len(req.Value) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz ayar verisi"})
	}

	if err := h.settingsRepo.UpdateSetting(context.Background(), req.Key, req.Value); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Ayar kaydedilemedi"})
	}

	if h.hub != nil {
		payload, _ := auraws.NewWSMessage("system_settings_updated", fiber.Map{
			"key":   req.Key,
			"value": req.Value,
		})
		h.hub.BroadcastToAll(payload)
	}

	return c.JSON(fiber.Map{
		"message": "Ayar başarıyla güncellendi.",
		"key":     req.Key,
	})
}

// 3. Kullanıcıları Listele (Arama, Sayfalama, Filtreleme)
func (h *AdminHandler) GetUsers(c *fiber.Ctx) error {
	search := c.Query("search", "")
	roleFilter := c.Query("role", "")
	bannedStr := c.Query("banned", "")

	var bannedFilter *bool
	if bannedStr == "true" {
		b := true
		bannedFilter = &b
	} else if bannedStr == "false" {
		b := false
		bannedFilter = &b
	}

	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))

	users, total, err := h.userRepo.GetAllUsers(context.Background(), search, roleFilter, bannedFilter, limit, offset)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Kullanıcılar alınamadı"})
	}

	return c.JSON(fiber.Map{
		"users":  users,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// 4. Kullanıcı Güncelle (Profil Bilgileri, Şifre, Rol, Ban Durumu)
type UpdateUserAdminRequest struct {
	DisplayName string `json:"display_name"`
	Username    string `json:"username"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	Role        string `json:"role"`
	IsBanned    bool   `json:"is_banned"`
	BanReason   string `json:"ban_reason"`
}

func (h *AdminHandler) UpdateUser(c *fiber.Ctx) error {
	idParam := c.Params("id")
	targetID, err := uuid.Parse(idParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz kullanıcı ID"})
	}

	var req UpdateUserAdminRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz istek gövdesi"})
	}

	if req.Role != "" && req.Role != "admin" && req.Role != "moderator" && req.Role != "member" {
		req.Role = "member"
	}

	var passwordHash string
	if req.Password != "" {
		if len(req.Password) < 6 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Şifre en az 6 karakter olmalıdır."})
		}
		hash, err := middleware.HashPassword(req.Password)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Şifre şifrelenemedi"})
		}
		passwordHash = hash
	}

	if err := h.userRepo.UpdateUserAdmin(context.Background(), targetID, req.DisplayName, req.Username, req.Email, passwordHash, req.Role, req.IsBanned, req.BanReason); err != nil {
		errStr := err.Error()
		if strings.Contains(errStr, "unique") || strings.Contains(errStr, "duplicate") {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Bu kullanıcı adı veya e-posta adresi zaten başka bir kullanıcı tarafından kullanılıyor."})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Kullanıcı güncellenemedi"})
	}

	return c.JSON(fiber.Map{
		"message": "Kullanıcı bilgileri başarıyla güncellendi.",
	})
}

// 5. Kullanıcıyı Sil
func (h *AdminHandler) DeleteUser(c *fiber.Ctx) error {
	idParam := c.Params("id")
	targetID, err := uuid.Parse(idParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Geçersiz kullanıcı ID"})
	}

	var currentUserID uuid.UUID
	if val, ok := c.Locals("user_id").(uuid.UUID); ok {
		currentUserID = val
	} else if val, ok := c.Locals("userID").(uuid.UUID); ok {
		currentUserID = val
	}
	if currentUserID == targetID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Kendinizi silemezsiniz."})
	}

	if err := h.userRepo.DeleteUser(context.Background(), targetID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Kullanıcı silinemedi"})
	}

	return c.JSON(fiber.Map{
		"message": "Kullanıcı başarıyla silindi.",
	})
}

// 6. Sistem Durumu ve Canlı İstatistikler
func (h *AdminHandler) GetSystemStats(c *fiber.Ctx) error {
	ctx := context.Background()

	stats, err := h.userRepo.GetSystemStats(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "İstatistikler alınamadı"})
	}

	// Redis Canlılık Durumu
	redisStatus := "online"
	if err := h.redisClient.Ping(ctx).Err(); err != nil {
		redisStatus = "offline"
	}

	// Go Runtime Bellek Durumu
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	stats["system_health"] = fiber.Map{
		"postgres":         "online",
		"redis":            redisStatus,
		"livekit":          "online",
		"minio":            "online",
		"goroutines":       runtime.NumGoroutine(),
		"allocated_ram_mb": mem.Alloc / 1024 / 1024,
		"sys_ram_mb":       mem.Sys / 1024 / 1024,
		"num_gc":           mem.NumGC,
	}

	return c.JSON(stats)
}

// 7. Tüm Kullanıcıların Erişim Günlükleri
func (h *AdminHandler) GetAccessLogs(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	logs, err := h.logRepo.GetAllAccessLogs(context.Background(), limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Günlükler alınamadı"})
	}

	return c.JSON(logs)
}

// 8. Ayrıntılı Sistem Sağlığı ve Gecikme Metrikleri (Health-Detailed)
func (h *AdminHandler) GetDetailedHealth(c *fiber.Ctx) error {
	ctx := c.Context()

	// 1. PostgreSQL Ping ve Gecikme
	pgStart := time.Now()
	pgErr := h.userRepo.Ping(ctx)
	pgLatency := time.Since(pgStart).Milliseconds()
	pgStatus := "online"
	if pgErr != nil {
		pgStatus = "offline"
	}

	// 2. Redis Ping ve Gecikme
	redisStart := time.Now()
	redisErr := h.redisClient.Ping(ctx).Err()
	redisLatency := time.Since(redisStart).Milliseconds()
	redisStatus := "online"
	if redisErr != nil {
		redisStatus = "offline"
	}

	// 3. MinIO Ping ve Gecikme
	minioStart := time.Now()
	var minioLatency int64 = 0
	minioStatus := "online"
	if h.storageService != nil {
		if err := h.storageService.Ping(ctx); err != nil {
			minioStatus = "offline"
		}
		minioLatency = time.Since(minioStart).Milliseconds()
	} else {
		minioStatus = "not_configured"
	}

	// 4. LiveKit SFU Canlılık
	livekitStatus := "online"
	livekitURL := ""
	if h.livekitService == nil {
		livekitStatus = "offline"
	} else {
		livekitURL = h.livekitService.GetPublicURL()
	}

	// 5. Uptime ve Bellek İstatistikleri
	uptimeDuration := time.Since(h.startTime)
	uptimeSec := int64(uptimeDuration.Seconds())
	days := int(uptimeDuration.Hours()) / 24
	hours := int(uptimeDuration.Hours()) % 24
	mins := int(uptimeDuration.Minutes()) % 60
	uptimeFormatted := fmt.Sprintf("%dg %ds %dd", days, hours, mins)

	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	activeWS := 0
	activeUsers := 0
	if h.hub != nil {
		activeWS = h.hub.GetActiveConnectionsCount()
		activeUsers = h.hub.GetActiveUsersCount()
	}

	return c.JSON(fiber.Map{
		"postgres": fiber.Map{
			"status":     pgStatus,
			"latency_ms": pgLatency,
		},
		"redis": fiber.Map{
			"status":     redisStatus,
			"latency_ms": redisLatency,
		},
		"minio": fiber.Map{
			"status":     minioStatus,
			"latency_ms": minioLatency,
		},
		"livekit": fiber.Map{
			"status": livekitStatus,
			"url":    livekitURL,
		},
		"uptime_seconds":        uptimeSec,
		"uptime_formatted":      uptimeFormatted,
		"active_ws_connections": activeWS,
		"active_online_users":   activeUsers,
		"goroutines":            runtime.NumGoroutine(),
		"memory": fiber.Map{
			"alloc_mb":      mem.Alloc / 1024 / 1024,
			"sys_mb":        mem.Sys / 1024 / 1024,
			"heap_alloc_mb": mem.HeapAlloc / 1024 / 1024,
			"heap_inuse_mb": mem.HeapInuse / 1024 / 1024,
			"num_gc":        mem.NumGC,
		},
	})
}

// 9. Depolama Dağılımı ve MinIO İstatistikleri (Storage-Breakdown)
func (h *AdminHandler) GetStorageBreakdown(c *fiber.Ctx) error {
	ctx := c.Context()
	cacheKey := "admin:storage_breakdown"

	// Redis Önbellek Denetimi (5 dakika TTL)
	cached, err := h.redisClient.Get(ctx, cacheKey).Result()
	if err == nil && cached != "" {
		var cachedMap map[string]interface{}
		if json.Unmarshal([]byte(cached), &cachedMap) == nil {
			cachedMap["cached"] = true
			return c.JSON(cachedMap)
		}
	}

	if h.storageService == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "Depolama servisi erişilemiyor."})
	}

	breakdown, err := h.storageService.GetStorageBreakdown(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Depolama analizi yapılamadı: " + err.Error()})
	}

	breakdown["cached"] = false
	if b, err := json.Marshal(breakdown); err == nil {
		_ = h.redisClient.Set(ctx, cacheKey, string(b), 5*time.Minute).Err()
	}

	return c.JSON(breakdown)
}

// 10. Canlı / Aktif Görüşmelerin Teknik İzlemesi (Active-Calls Technical Monitor)
func (h *AdminHandler) GetActiveCalls(c *fiber.Ctx) error {
	ctx := c.Context()

	if h.callRepo == nil {
		return c.JSON(fiber.Map{"active_calls": []interface{}{}, "count": 0})
	}

	calls, err := h.callRepo.GetActiveCalls(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Aktif aramalar alınamadı."})
	}

	type CallSessionTelemetry struct {
		CallID         uuid.UUID  `json:"call_id"`
		ConversationID uuid.UUID  `json:"conversation_id"`
		CallType       string     `json:"call_type"`
		Status         string     `json:"status"`
		StartedAt      *time.Time `json:"started_at"`
		ElapsedSeconds int64      `json:"elapsed_seconds"`
		CallerName     string     `json:"caller_name"`
		ReceiverName   string     `json:"receiver_name"`
	}

	telemetryList := make([]CallSessionTelemetry, 0, len(calls))
	for _, call := range calls {
		elapsed := int64(0)
		if call.StartedAt != nil {
			elapsed = int64(time.Since(*call.StartedAt).Seconds())
		}

		callerStr := call.CallerID.String()
		receiverStr := call.ReceiverID.String()

		callerMasked := "Kullanıcı-" + callerStr[:4]
		receiverMasked := "Kullanıcı-" + receiverStr[:4]

		callerUser, _ := h.userRepo.GetUserByID(ctx, call.CallerID)
		if callerUser != nil {
			callerMasked = callerUser.DisplayName
		}
		receiverUser, _ := h.userRepo.GetUserByID(ctx, call.ReceiverID)
		if receiverUser != nil {
			receiverMasked = receiverUser.DisplayName
		}

		telemetryList = append(telemetryList, CallSessionTelemetry{
			CallID:         call.ID,
			ConversationID: call.ConversationID,
			CallType:       call.CallType,
			Status:         call.Status,
			StartedAt:      call.StartedAt,
			ElapsedSeconds: elapsed,
			CallerName:     callerMasked,
			ReceiverName:   receiverMasked,
		})
	}

	return c.JSON(fiber.Map{
		"active_calls": telemetryList,
		"count":        len(telemetryList),
	})
}
