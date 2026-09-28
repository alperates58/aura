package handlers

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"fisilti/internal/database"
	"fisilti/internal/middleware"
	"fisilti/internal/preview"
	"fisilti/internal/storage"
	"fisilti/internal/transcoder"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
)

type MediaHandler struct {
	storage      *storage.StorageService
	preview      *preview.PreviewService
	chatRepo     *database.ChatRepository
	userRepo     *database.UserRepository
	settingsRepo *database.SettingsRepository
	jwtSecret    string
}

func NewMediaHandler(
	storage *storage.StorageService,
	preview *preview.PreviewService,
	chatRepo *database.ChatRepository,
	userRepo *database.UserRepository,
	settingsRepo *database.SettingsRepository,
	jwtSecret string,
) *MediaHandler {
	return &MediaHandler{
		storage:      storage,
		preview:      preview,
		chatRepo:     chatRepo,
		userRepo:     userRepo,
		settingsRepo: settingsRepo,
		jwtSecret:    jwtSecret,
	}
}

type LinkPreviewRequest struct {
	URL string `json:"url"`
}

func (h *MediaHandler) GetLinkPreview(c *fiber.Ctx) error {
	// 1. Content-Type doğrulaması: application/json zorunludur
	cType := strings.ToLower(c.Get("Content-Type"))
	if !strings.Contains(cType, "application/json") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Geçersiz içerik türü, 'application/json' bekleniyor.",
		})
	}

	// 2. Gereksiz büyük request body kabul edilmesin (En fazla 4096 bayt)
	body := c.Body()
	if len(body) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "İstek gövdesi boş olamaz.",
		})
	}
	if len(body) > 4096 {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{
			"error": "İstek boyutu çok büyük.",
		})
	}

	// 3. JSON formatı ve model doğrulaması
	var req LinkPreviewRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Geçersiz JSON formatı.",
		})
	}

	// 4. Boş URL denetimi
	rawURL := strings.TrimSpace(req.URL)
	if rawURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Lütfen geçerli bir url belirtin.",
		})
	}

	// 5. Sistem ayarlarından önizleme izin kontrolü
	if h.settingsRepo != nil {
		chatSettings := h.settingsRepo.GetChatSettings(c.Context())
		if !chatSettings.EnableLinkPreviews {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Bağlantı önizlemeleri devre dışı bırakılmıştır.",
			})
		}
	}

	// 6. Önizleme servisi kontrolü
	if h.preview == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "Önizleme servisi hazır değil.",
		})
	}

	// 7. SSRF korumalı önizleme alma (URL loglanmaz, hata detayları dışarı sızdırılmaz)
	meta, err := h.preview.GetLinkPreview(c.Context(), rawURL)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Bağlantı önizlemesi alınamadı.",
		})
	}

	return c.JSON(meta)
}

func (h *MediaHandler) UploadMedia(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uuid.UUID)

	fileHeader, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Lütfen yüklenecek bir dosya seçin.",
		})
	}

	category := c.FormValue("category", "file") // voice, image, video, file
	durationStr := c.FormValue("duration", "0")
	waveformStr := c.FormValue("waveform", "")

	// Sistem Medya Limitleri Denetimi
	if h.settingsRepo != nil {
		limits := h.settingsRepo.GetMediaLimits(c.Context())

		// 1. Maksimum Dosya Boyutu Kontrolü
		if limits.MaxFileSizeMB > 0 {
			maxBytes := int64(limits.MaxFileSizeMB) * 1024 * 1024
			if fileHeader.Size > maxBytes {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"error": fmt.Sprintf("Dosya boyutu sistem sınırını aşıyor (En fazla %d MB yüklenebilir).", limits.MaxFileSizeMB),
				})
			}
		}

		// 2. İzin Verilen Dosya Uzantıları Kontrolü (ses hariç)
		if len(limits.AllowedExtensions) > 0 && category != "voice" {
			ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
			allowed := false
			for _, a := range limits.AllowedExtensions {
				cleanA := strings.ToLower(strings.TrimSpace(a))
				if !strings.HasPrefix(cleanA, ".") {
					cleanA = "." + cleanA
				}
				if cleanA == ext {
					allowed = true
					break
				}
			}
			if !allowed {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"error": fmt.Sprintf("'%s' dosya uzantısına izin verilmiyor. İzin verilenler: %s", ext, strings.Join(limits.AllowedExtensions, ", ")),
				})
			}
		}

		// 3. Maksimum Ses Süresi Kontrolü
		if category == "voice" && limits.MaxVoiceSeconds > 0 {
			if duration, err := strconv.ParseFloat(durationStr, 64); err == nil && duration > float64(limits.MaxVoiceSeconds) {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"error": fmt.Sprintf("Ses kaydı maksimum süreyi (%d saniye) aşıyor.", limits.MaxVoiceSeconds),
				})
			}
		}
	}

	file, err := fileHeader.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Dosya okunamadı.",
		})
	}
	defer file.Close()

	res, err := h.storage.UploadMedia(c.Context(), userID, file, fileHeader, category)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	// Süre ve dalga formu metadatasını ekle
	if duration, err := strconv.ParseFloat(durationStr, 64); err == nil && duration > 0 {
		res.Metadata["duration"] = duration
	}
	if waveformStr != "" {
		var wf []float64
		if err := json.Unmarshal([]byte(waveformStr), &wf); err == nil {
			res.Metadata["waveform"] = wf
		}
	}

	return c.JSON(res)
}

func (h *MediaHandler) GetMediaFile(c *fiber.Ctx) error {
	bucket := c.Params("bucket")
	objectName := c.Params("*")
	if bucket == "" || objectName == "" {
		return c.Status(fiber.StatusBadRequest).SendString("Geçersiz medya yolu")
	}

	// 0. Güvenlik & Gizlilik Doğrulaması:
	// Avatarlar dışındaki tüm medyalar (sesli mesajlar, videolar, fotoğraflar, belgeler)
	// özel konuşmalara aittir. Yalnızca kimliği doğrulanmış ve konuşmanın tarafı olan kullanıcılar erişebilir.
	if bucket != "avatars" {
		tokenStr := c.Cookies("access_token")
		if tokenStr == "" {
			authHeader := c.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}
		if tokenStr == "" {
			tokenStr = c.Query("token")
		}

		if tokenStr == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Bu özel medyayı görüntülemek için giriş yapmalısınız.",
			})
		}

		claims, err := middleware.ValidateToken(tokenStr, h.jwtSecret)
		if err != nil || claims.IsRefresh {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Geçersiz veya süresi dolmuş oturum.",
			})
		}

		var userRole string = "member"
		if h.userRepo != nil {
			if u, err := h.userRepo.GetUserByID(c.Context(), claims.UserID); err == nil && u != nil {
				userRole = u.Role
			}
		}

		if h.chatRepo != nil {
			allowed, err := h.chatRepo.CanUserAccessMedia(c.Context(), claims.UserID, userRole, bucket, objectName)
			if err != nil || !allowed {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"error": "Bu özel medyayı görüntüleme yetkiniz bulunmuyor.",
				})
			}
		}
	}

	ua := strings.ToLower(c.Get("User-Agent"))
	isIOS := strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad") || strings.Contains(ua, "ipod") || strings.Contains(ua, "crios") || (strings.Contains(ua, "safari") && !strings.Contains(ua, "chrome"))

	// 1. iOS veya ?format=mp3 için WebM ses dosyalarını on-the-fly MP3'e dönüştür
	if bucket == "audio-messages" && strings.HasSuffix(objectName, ".webm") && (isIOS || c.Query("format") == "mp3") && transcoder.IsAvailable() {
		mp3ObjectName := objectName + ".mp3"
		if _, statErr := h.storage.StatObject(c.Context(), bucket, mp3ObjectName); statErr == nil {
			objectName = mp3ObjectName
		} else {
			tmpIn := filepath.Join(os.TempDir(), fmt.Sprintf("src_%s.webm", uuid.New().String()))
			if err := h.storage.FGetObject(c.Context(), bucket, objectName, tmpIn, minio.GetObjectOptions{}); err == nil {
				if convertedPath, _, err := transcoder.ConvertAudioToMP3(tmpIn); err == nil {
					_, _ = h.storage.FPutObject(c.Context(), bucket, mp3ObjectName, convertedPath, minio.PutObjectOptions{
						ContentType: "audio/mpeg",
					})
					_ = os.Remove(convertedPath)
					objectName = mp3ObjectName
				}
				_ = os.Remove(tmpIn)
			}
		}
	}

	// 2. iOS veya ?format=mp4 için WebM videolarını on-the-fly MP4'e dönüştür
	if bucket == "media" && strings.HasSuffix(objectName, ".webm") && (isIOS || c.Query("format") == "mp4") && transcoder.IsAvailable() {
		mp4ObjectName := objectName + ".mp4"
		if _, statErr := h.storage.StatObject(c.Context(), bucket, mp4ObjectName); statErr == nil {
			objectName = mp4ObjectName
		} else {
			tmpIn := filepath.Join(os.TempDir(), fmt.Sprintf("src_vid_%s.webm", uuid.New().String()))
			if err := h.storage.FGetObject(c.Context(), bucket, objectName, tmpIn, minio.GetObjectOptions{}); err == nil {
				if convertedPath, err := transcoder.ConvertVideoToUniversalMP4(tmpIn); err == nil {
					_, _ = h.storage.FPutObject(c.Context(), bucket, mp4ObjectName, convertedPath, minio.PutObjectOptions{
						ContentType: "video/mp4",
					})
					_ = os.Remove(convertedPath)
					objectName = mp4ObjectName
				}
				_ = os.Remove(tmpIn)
			}
		}
	}

	// 3. MOV videolarını evrensel H.264 MP4'e on-the-fly dönüştür ve önbelleğe al
	if bucket == "media" && strings.HasSuffix(objectName, ".mov") && transcoder.IsAvailable() {
		mp4ObjectName := strings.TrimSuffix(objectName, ".mov") + ".mp4"
		if _, statErr := h.storage.StatObject(c.Context(), bucket, mp4ObjectName); statErr == nil {
			objectName = mp4ObjectName
		} else {
			tmpIn := filepath.Join(os.TempDir(), fmt.Sprintf("src_vid_%s.mov", uuid.New().String()))
			if err := h.storage.FGetObject(c.Context(), bucket, objectName, tmpIn, minio.GetObjectOptions{}); err == nil {
				if convertedPath, err := transcoder.ConvertVideoToUniversalMP4(tmpIn); err == nil {
					_, _ = h.storage.FPutObject(c.Context(), bucket, mp4ObjectName, convertedPath, minio.PutObjectOptions{
						ContentType: "video/mp4",
					})
					_ = os.Remove(convertedPath)
					objectName = mp4ObjectName
				}
				_ = os.Remove(tmpIn)
			}
		}
	}

	rangeHeader := c.Get("Range")
	var opts minio.GetObjectOptions

	var start, end int64 = -1, -1
	if rangeHeader != "" && strings.HasPrefix(rangeHeader, "bytes=") {
		parts := strings.Split(strings.TrimPrefix(rangeHeader, "bytes="), "-")
		if len(parts) >= 1 && parts[0] != "" {
			if s, err := strconv.ParseInt(parts[0], 10, 64); err == nil {
				start = s
			}
		}
		if len(parts) >= 2 && parts[1] != "" {
			if e, err := strconv.ParseInt(parts[1], 10, 64); err == nil {
				end = e
			}
		}
		if start >= 0 {
			if end >= 0 {
				_ = opts.SetRange(start, end)
			} else {
				_ = opts.SetRange(start, 0)
			}
		}
	}

	obj, info, err := h.storage.GetObject(c.Context(), bucket, objectName, opts)
	if err != nil {
		return c.Status(fiber.StatusNotFound).SendString("Dosya bulunamadı")
	}

	contentType := info.ContentType
	ext := strings.ToLower(filepath.Ext(objectName))
	switch ext {
	case ".mp3":
		contentType = "audio/mpeg"
	case ".m4a", ".mp4":
		if bucket == "audio-messages" {
			contentType = "audio/mp4"
		} else {
			contentType = "video/mp4"
		}
	case ".mov":
		contentType = "video/quicktime"
	case ".aac":
		contentType = "audio/aac"
	case ".wav":
		contentType = "audio/wav"
	case ".ogg":
		contentType = "audio/ogg"
	case ".webm":
		if bucket == "audio-messages" {
			contentType = "audio/webm"
		} else {
			contentType = "video/webm"
		}
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".png":
		contentType = "image/png"
	case ".webp":
		contentType = "image/webp"
	case ".gif":
		contentType = "image/gif"
	}

	if contentType == "" {
		contentType = "application/octet-stream"
	}

	c.Set("Content-Type", contentType)
	c.Set("X-Content-Type-Options", "nosniff")
	c.Set("Accept-Ranges", "bytes")
	c.Set("Access-Control-Allow-Origin", "*")
	c.Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
	c.Set("Access-Control-Allow-Headers", "Range, Accept, Content-Type")
	c.Set("Cache-Control", "public, max-age=31536000, immutable")

	// Güvenlik: files bucket'ındaki belgeler veya genel/bilinmeyen dosyalar inline çalıştırılmasın, attachment olarak indirilsin
	if bucket == "files" || contentType == "application/octet-stream" || strings.Contains(contentType, "html") || strings.Contains(contentType, "xml") || strings.Contains(contentType, "svg") {
		c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filepath.Base(objectName)))
	}

	if start >= 0 {
		actualEnd := info.Size - 1
		if end >= 0 && end < info.Size {
			actualEnd = end
		}
		contentLength := actualEnd - start + 1
		c.Status(fiber.StatusPartialContent)
		c.Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, actualEnd, info.Size))
		c.Set("Content-Length", strconv.FormatInt(contentLength, 10))
		return c.SendStream(obj, int(contentLength))
	}

	c.Status(fiber.StatusOK)
	c.Set("Content-Length", strconv.FormatInt(info.Size, 10))
	return c.SendStream(obj, int(info.Size))
}
