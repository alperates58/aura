package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"aura/internal/config"
	"aura/internal/cron"
	"aura/internal/database"
	"aura/internal/handlers"
	"aura/internal/livekit"
	"aura/internal/middleware"
	"aura/internal/preview"
	"aura/internal/push"
	auraredis "aura/internal/redis"
	"aura/internal/storage"
	"aura/internal/transcoder"
	auraws "aura/internal/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg := config.LoadConfig()

	// Türkiye Zaman Dilimi Ayarı (Europe/Istanbul, UTC+3)
	loc, err := time.LoadLocation("Europe/Istanbul")
	if err == nil {
		time.Local = loc
	} else {
		time.Local = time.FixedZone("TRT", 3*3600)
	}
	log.Printf("🚀 Aura Backend başlatılıyor... Ortam: %s, Port: %s, Yerel Saat: %s", cfg.Environment, cfg.Port, time.Now().Format("2006-01-02 15:04:05 MST"))
	transcoder.LogStatus()

	// 1. PostgreSQL 16 Bağlantısı ve Migration
	db, err := database.ConnectPostgres(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("❌ [DB] Veritabanı başlatılamadı: %v", err)
	}
	defer db.Close()

	if err := database.RunMigrations(db, "internal/database/migrations"); err != nil {
		log.Printf("⚠️ [DB] Migration uyarısı: %v", err)
	}

	// 2. Redis 7 Bağlantısı
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: cfg.RedisPass,
	})
	rCtx, rCancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer rCancel()
	if err := rdb.Ping(rCtx).Err(); err != nil {
		log.Printf("⚠️ [Redis] Bağlantı hatası (%s): %v", cfg.RedisAddr, err)
	} else {
		log.Println("✅ [Redis] Redis 7 bağlantısı başarılı.")
	}
	defer rdb.Close()

	// 3. MinIO S3 Depolama Servisi
	storageService, err := storage.NewStorageService(
		cfg.MinioEndpoint,
		cfg.MinioUser,
		cfg.MinioPass,
		cfg.MinioPublicURL,
		cfg.MinioUseSSL,
		cfg.MinioBucketAvatars,
		cfg.MinioBucketMedia,
		cfg.MinioBucketVoice,
		cfg.MinioBucketFiles,
	)
	if err != nil {
		log.Fatalf("❌ [MinIO] S3 servisi başlatılamadı: %v", err)
	}
	log.Printf("✅ [MinIO] S3 depolama servisi bağlandı (%s).", cfg.MinioEndpoint)

	// MinIO Bucketlarının varlığını garanti et
	go func() {
		for i := 0; i < 15; i++ {
			bCtx, bCancel := context.WithTimeout(context.Background(), 5*time.Second)
			if err := storageService.EnsureBuckets(bCtx); err == nil {
				log.Println("✅ [MinIO] S3 bucketları doğrulandı ve hazırlandı.")
				bCancel()
				break
			} else {
				log.Printf("⏳ [MinIO] Bucket hazırlığı bekleniyor (%d/15): %v", i+1, err)
			}
			bCancel()
			time.Sleep(2 * time.Second)
		}
	}()

	// 4. Redis Servisleri
	presenceService := auraredis.NewPresenceService(rdb)
	typingService := auraredis.NewTypingService(rdb)

	// 5. Repositories
	userRepo := database.NewUserRepository(db)
	chatRepo := database.NewChatRepository(db)
	callRepo := database.NewCallRepository(db)
	accessRepo := database.NewAccessRepository(db)
	pushRepo := database.NewPushRepository(db)
	settingsRepo := database.NewSettingsRepository(db)
	storyRepo := database.NewStoryRepository(db)
	securityRepo := database.NewSecurityRepository(db)
	_ = securityRepo.EnsureSecurityBot(context.Background())

	// VAPID Web Push Servisi
	vapidService := push.NewVAPIDService()

	// LiveKit SFU Servisi
	livekitService := livekit.NewLiveKitService(cfg.LiveKitAPIKey, cfg.LiveKitAPISecret, cfg.LiveKitPublicURL)

	// 6. WebSocket Hub Motoru (Redis Pub/Sub ve Yakın Arkadaşlar ile genişletilmiş)
	hub := auraws.NewHub(chatRepo, userRepo, pushRepo, vapidService, presenceService, typingService, settingsRepo, storyRepo, rdb)
	go hub.Run()
	log.Println("⚡ [WS Hub] Gerçek zamanlı WebSocket Hub motoru başlatıldı.")

	// Preview Servisi
	previewService := preview.NewPreviewService(rdb)

	// 7. Handlers
	authHandler := handlers.NewAuthHandler(cfg, userRepo, presenceService, hub, accessRepo, settingsRepo, securityRepo, storyRepo)
	userHandler := handlers.NewUserHandler(cfg, userRepo, storageService, presenceService, accessRepo, hub, rdb)
	chatHandler := handlers.NewChatHandler(chatRepo, userRepo, presenceService, storageService, hub, settingsRepo, rdb)
	mediaHandler := handlers.NewMediaHandler(storageService, previewService, chatRepo, userRepo, settingsRepo, cfg.JWTAccessSecret)
	callHandler := handlers.NewCallHandler(callRepo, chatRepo, userRepo, livekitService, hub, rdb, settingsRepo)
	wsHandler := handlers.NewWSHandler(cfg, hub, rdb, userRepo)
	pushHandler := handlers.NewPushHandler(pushRepo, vapidService, userRepo)
	adminHandler := handlers.NewAdminHandler(userRepo, settingsRepo, accessRepo, securityRepo, callRepo, storageService, livekitService, rdb, hub)
	storyHandler := handlers.NewStoryHandler(storyRepo, userRepo, storageService, hub)

	// 8. Fiber Web Uygulaması
	app := fiber.New(fiber.Config{
		AppName:      "Aura API v1.0",
		ServerHeader: "Aura-Server",
		BodyLimit:    50 * 1024 * 1024, // 50MB dosya yükleme sınırı
	})

	app.Use(logger.New(logger.Config{
		Format: "[${time}] ${status} - ${latency} ${method} ${path}\n",
	}))
	app.Use(recover.New())
	app.Use(middleware.SecurityHeadersMiddleware())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSAllowedOrigins,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, Sec-WebSocket-Protocol, X-Session-ID, X-Requested-With",
		AllowCredentials: true,
	}))

	// Süresi Dolan Mesajları Temizleme Servisi (Cron Worker)
	cleaner := cron.NewExpiredMessagesCleaner(db, storageService, hub)
	cleaner.Start(context.Background(), 30*time.Second)

	// Kök karşılama rotası
	app.Get("/", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"app":         "Aura",
			"version":     "1.0.0",
			"status":      "running",
			"environment": cfg.Environment,
			"time":        time.Now().Format(time.RFC3339),
		})
	})

	// Sağlık kontrolü (Healthcheck)
	app.Get("/api/v1/health", func(c *fiber.Ctx) error {
		dbStatus := "down"
		if db.Ping() == nil {
			dbStatus = "connected"
		}

		redisStatus := "down"
		hCtx, hCancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer hCancel()
		if rdb.Ping(hCtx).Err() == nil {
			redisStatus = "connected"
		}

		// LiveKit HTTP kontrolü
		livekitStatus := "down"
		lkClient := http.Client{Timeout: 2 * time.Second}
		resp, err := lkClient.Get(cfg.LiveKitURL)
		if err == nil && resp.StatusCode > 0 {
			livekitStatus = "connected"
			resp.Body.Close()
		}

		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"status":    "ok",
			"timestamp": time.Now().Format(time.RFC3339),
			"services": fiber.Map{
				"postgres": dbStatus,
				"redis":    redisStatus,
				"minio":    "connected",
				"livekit":  livekitStatus,
			},
		})
	})

	// WebSocket Uç Noktası
	app.Use("/ws", wsHandler.UpgradeMiddleware())
	app.Get("/ws", wsHandler.HandleConnection())

	// API v1 Rotaları
	v1 := app.Group("/api/v1")

	// Hız sınırlayıcılar (Rate Limiters)
	authLimiter := middleware.NewRateLimiter(rdb, 15, 1*time.Minute)
	mediaLimiter := middleware.NewRateLimiter(rdb, 20, 1*time.Minute)
	storyLimiter := middleware.NewRateLimiter(rdb, cfg.StoryCreateRateLimit, time.Duration(cfg.StoryCreateRateWindowSec)*time.Second)

	// Genel ve Açık Sistem Ayarları
	v1.Get("/public/settings", authHandler.GetPublicSettings)

	// Kimlik Doğrulama Rotaları (Açık)
	auth := v1.Group("/auth")
	auth.Get("/settings", authHandler.GetPublicSettings)
	auth.Post("/register", authLimiter, authHandler.Register)
	auth.Post("/login", authLimiter, authHandler.Login)
	auth.Post("/refresh", authHandler.Refresh)
	auth.Post("/logout", authHandler.Logout)

	// JWT Kimlik Doğrulama Middleware (Token Versiyonu ve Uzaktan Oturum Düşürme Korumalı)
	jwtAuth := middleware.JWTMiddleware(cfg.JWTAccessSecret, rdb, userRepo)

	// Korumalı Rotalar (JWT Korumalı)
	authProtected := auth.Group("", jwtAuth)
	authProtected.Get("/me", authHandler.Me)

	users := v1.Group("/users", jwtAuth)
	users.Put("/profile", userHandler.UpdateProfile)
	users.Post("/avatar", userHandler.UploadAvatar)
	users.Patch("/privacy", userHandler.UpdatePrivacy)
	users.Post("/panic-password", userHandler.SetPanicPassword)
	users.Post("/kill-sessions", userHandler.KillSessions)
	users.Post("/regenerate-security-code", userHandler.RegenerateSecurityCode)
	users.Get("/search", userHandler.SearchUsers)
	users.Get("/access-logs", userHandler.GetAccessLogs)
	users.Get("/close-friends", storyHandler.GetCloseFriends)
	users.Post("/close-friends/:friendId", storyHandler.AddCloseFriend)
	users.Delete("/close-friends/:friendId", storyHandler.RemoveCloseFriend)

	// Sohbet ve Mesajlaşma Rotaları
	v1.Get("/media/file/:bucket/*", mediaHandler.GetMediaFile)
	v1.Post("/media/upload", jwtAuth, mediaLimiter, mediaHandler.UploadMedia)
	v1.Post("/media/link-preview", jwtAuth, mediaHandler.GetLinkPreview)

	conversations := v1.Group("/conversations", jwtAuth)
	conversations.Post("/", chatHandler.StartConversation)
	conversations.Get("/", chatHandler.GetConversations)
	conversations.Get("/:id/messages", chatHandler.GetMessages)
	conversations.Get("/:id/media", chatHandler.GetConversationMedia)
	conversations.Get("/:id/search", chatHandler.SearchMessages)
	conversations.Post("/:id/block", chatHandler.BlockConversation)
	conversations.Post("/:id/unblock", chatHandler.UnblockConversation)
	conversations.Post("/:id/messages", chatHandler.CreateMessage)
	conversations.Get("/:id/listen-together", chatHandler.GetActiveListenTogetherSession)
	conversations.Delete("/:id/clear", chatHandler.ClearHistory)
	conversations.Delete("/:id", chatHandler.ClearHistory)

	messages := v1.Group("/messages", jwtAuth)
	messages.Get("/starred", chatHandler.GetStarredMessages)
	messages.Delete("/batch", chatHandler.DeleteMessagesBatch)
	messages.Get("/:id/info", chatHandler.GetMessageInfo)
	messages.Patch("/:id", chatHandler.EditMessage)
	messages.Delete("/:id", chatHandler.DeleteMessage)
	messages.Post("/:id/reactions", chatHandler.ToggleReaction)
	messages.Post("/:id/star", chatHandler.ToggleStar)

	// WebRTC Sesli & Görüntülü Arama Rotaları (JWT Korumalı)
	calls := v1.Group("/calls", jwtAuth)
	calls.Post("/initiate", callHandler.InitiateCall)
	calls.Post("/accept", callHandler.AcceptCall)
	calls.Post("/reject", callHandler.RejectCall)
	calls.Post("/end", callHandler.EndCall)

	// 24 Saatlik Hikaye / Durum Rotaları (WhatsApp & Instagram Modu)
	stories := v1.Group("/stories", jwtAuth)
	stories.Get("/", storyHandler.GetActiveStories)
	stories.Get("/youtube-info", storyHandler.GetYouTubeInfo)
	stories.Post("/", storyLimiter, storyHandler.CreateStory)
	stories.Patch("/:id", storyHandler.UpdateStory)
	stories.Post("/:id/view", storyHandler.MarkStoryViewed)
	stories.Get("/:id/viewers", storyHandler.GetStoryViewers)
	stories.Post("/:id/reactions", storyHandler.AddStoryReaction)
	stories.Delete("/:id", storyHandler.DeleteStory)

	// Öne Çıkanlar (Story Highlights)
	stories.Post("/highlights", storyHandler.CreateHighlight)
	stories.Get("/highlights/user/:userId", storyHandler.GetUserHighlights)
	stories.Get("/highlights/:id", storyHandler.GetHighlightWithStories)
	stories.Put("/highlights/:id", storyHandler.UpdateHighlight)
	stories.Delete("/highlights/:id", storyHandler.DeleteHighlight)
	stories.Post("/highlights/:id/stories", storyHandler.AddStoriesToHighlight)
	stories.Delete("/highlights/:id/stories/:storyId", storyHandler.RemoveStoryFromHighlight)

	// Web Push Bildirim Rotaları
	v1.Get("/notifications/vapid-key", pushHandler.GetVapidKey)
	notifications := v1.Group("/notifications", jwtAuth)
	notifications.Post("/subscribe", pushHandler.Subscribe)
	notifications.Post("/unsubscribe", pushHandler.Unsubscribe)
	notifications.Post("/test", pushHandler.TestNotification)

	// Yönetim Paneli ve Sistem Parametreleri Rotaları (Yalnızca Admin)
	admin := v1.Group("/admin", jwtAuth, adminHandler.RequireAdmin)
	admin.Get("/settings", adminHandler.GetSettings)
	admin.Put("/settings", adminHandler.UpdateSetting)
	admin.Get("/users", adminHandler.GetUsers)
	admin.Put("/users/:id", adminHandler.UpdateUser)
	admin.Delete("/users/:id", adminHandler.DeleteUser)
	admin.Get("/stats", adminHandler.GetSystemStats)
	admin.Get("/health-detailed", adminHandler.GetDetailedHealth)
	admin.Get("/storage-breakdown", adminHandler.GetStorageBreakdown)
	admin.Get("/active-calls", adminHandler.GetActiveCalls)
	admin.Get("/access-logs", adminHandler.GetAccessLogs)
	admin.Get("/security/logs", adminHandler.GetSecurityLogs)
	admin.Delete("/security/logs", adminHandler.ClearSecurityLogs)
	admin.Get("/security/stats", adminHandler.GetSecurityStats)

	// Graceful Shutdown
	go func() {
		if err := app.Listen(":" + cfg.Port); err != nil {
			log.Printf("⚠️ Sunucu dinleme sonlandı: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("🛑 Aura Backend kapatılıyor...")
	_ = app.Shutdown()
	log.Println("👋 Sunucu güvenli bir şekilde kapatıldı.")
}
