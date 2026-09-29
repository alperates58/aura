package config

import (
	"log"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Environment          string
	Port                 string
	DatabaseURL          string
	RedisAddr            string
	RedisPass            string
	MinioEndpoint        string
	MinioPublicURL       string
	MinioUser            string
	MinioPass            string
	MinioUseSSL          bool
	MinioBucketAvatars   string
	MinioBucketVoice     string
	MinioBucketMedia     string
	MinioBucketFiles     string
	LiveKitURL           string
	LiveKitPublicURL     string
	LiveKitAPIKey        string
	LiveKitAPISecret     string
	JWTAccessSecret      string
	JWTRefreshSecret     string
	JWTAccessExpiryMin   int
	JWTRefreshExpiryDays int
	StoryCreateRateLimit int
	StoryCreateRateWindowSec int
	AppBasePath          string
	CORSAllowedOrigins   string
}

func LoadConfig() Config {
	port := getEnv("BACKEND_PORT", getEnv("PORT", "8080"))
	env := getEnv("ENVIRONMENT", "development")
	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		log.Fatal("❌ [Config Error] DATABASE_URL environment variable zorunludur ve tanimlanmamis. Lutfen gecerli bir veritabani baglanti adresi saglayin.")
	}
	redisAddr := getEnv("REDIS_ADDR", "redis:6379")
	redisPass := getEnv("REDIS_PASSWORD", "")

	minioEndpoint := getEnv("MINIO_ENDPOINT", "minio:9000")
	minioPublicURL := getEnv("MINIO_PUBLIC_URL", "http://localhost:9000")
	minioUser := getEnv("MINIO_ROOT_USER", "aura_admin")
	minioPass := getEnv("MINIO_ROOT_PASSWORD", "aura_minio_secret_2026")
	minioUseSSL, _ := strconv.ParseBool(getEnv("MINIO_USE_SSL", "false"))

	minioBucketAvatars := getEnv("MINIO_BUCKET_AVATARS", "avatars")
	minioBucketVoice := getEnv("MINIO_BUCKET_VOICE", "audio-messages")
	minioBucketMedia := getEnv("MINIO_BUCKET_MEDIA", "media")
	minioBucketFiles := getEnv("MINIO_BUCKET_FILES", "files")

	livekitURL := getEnv("LIVEKIT_URL", "http://livekit:7880")
	livekitPublicURL := getEnv("LIVEKIT_PUBLIC_URL", "http://localhost:7880")

	livekitAPIKey := strings.TrimSpace(os.Getenv("LIVEKIT_API_KEY"))
	if livekitAPIKey == "" {
		log.Fatal("❌ [Config Error] LIVEKIT_API_KEY environment variable zorunludur ve tanimlanmamis. Lutfen gecerli bir LiveKit API anahtari saglayin.")
	}

	livekitAPISecret := strings.TrimSpace(os.Getenv("LIVEKIT_API_SECRET"))
	if livekitAPISecret == "" {
		log.Fatal("❌ [Config Error] LIVEKIT_API_SECRET environment variable zorunludur ve tanimlanmamis. Lutfen gecerli bir LiveKit API gizli anahtari (secret) saglayin.")
	}

	jwtAccessSecret := strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET"))
	if jwtAccessSecret == "" {
		log.Fatal("❌ [Config Error] JWT_ACCESS_SECRET environment variable zorunludur ve tanimlanmamis. Lutfen gecerli bir JWT erisim gizli anahtari (secret) saglayin.")
	}

	jwtRefreshSecret := strings.TrimSpace(os.Getenv("JWT_REFRESH_SECRET"))
	if jwtRefreshSecret == "" {
		log.Fatal("❌ [Config Error] JWT_REFRESH_SECRET environment variable zorunludur ve tanimlanmamis. Lutfen gecerli bir JWT yenileme gizli anahtari (secret) saglayin.")
	}
	jwtAccessExpiryMin, _ := strconv.Atoi(getEnv("JWT_ACCESS_EXPIRY_MINUTES", "15"))
	jwtRefreshExpiryDays, _ := strconv.Atoi(getEnv("JWT_REFRESH_EXPIRY_DAYS", "30"))
	storyCreateLimit, _ := strconv.Atoi(getEnv("STORY_CREATE_RATE_LIMIT", "5"))
	storyCreateWindowSec, _ := strconv.Atoi(getEnv("STORY_CREATE_RATE_WINDOW_SECONDS", "60"))

	rawBasePath := getEnv("APP_BASE_PATH", getEnv("COOKIE_PATH", "/"))
	appBasePath := "/"
	if rawBasePath != "" && rawBasePath != "/" {
		if !strings.HasPrefix(rawBasePath, "/") {
			rawBasePath = "/" + rawBasePath
		}
		appBasePath = strings.TrimSuffix(rawBasePath, "/")
	}

	corsOrigins := getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000, http://localhost:3002, http://127.0.0.1:3000, http://127.0.0.1:3002")

	return Config{
		Environment:          env,
		Port:                 port,
		DatabaseURL:          dbURL,
		RedisAddr:            redisAddr,
		RedisPass:            redisPass,
		MinioEndpoint:        minioEndpoint,
		MinioPublicURL:       minioPublicURL,
		MinioUser:            minioUser,
		MinioPass:            minioPass,
		MinioUseSSL:          minioUseSSL,
		MinioBucketAvatars:   minioBucketAvatars,
		MinioBucketVoice:     minioBucketVoice,
		MinioBucketMedia:     minioBucketMedia,
		MinioBucketFiles:     minioBucketFiles,
		LiveKitURL:           livekitURL,
		LiveKitPublicURL:     livekitPublicURL,
		LiveKitAPIKey:        livekitAPIKey,
		LiveKitAPISecret:     livekitAPISecret,
		JWTAccessSecret:      jwtAccessSecret,
		JWTRefreshSecret:     jwtRefreshSecret,
		JWTAccessExpiryMin:   jwtAccessExpiryMin,
		JWTRefreshExpiryDays: jwtRefreshExpiryDays,
		StoryCreateRateLimit: storyCreateLimit,
		StoryCreateRateWindowSec: storyCreateWindowSec,
		AppBasePath:          appBasePath,
		CORSAllowedOrigins:   corsOrigins,
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
