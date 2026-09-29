package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"aura/internal/preview"
	"github.com/gofiber/fiber/v2"
)

func setupTestApp() *fiber.App {
	app := fiber.New()
	previewService := preview.NewPreviewService(nil)
	mediaHandler := NewMediaHandler(nil, previewService, nil, nil, nil, "test-secret")
	app.Post("/api/v1/media/link-preview", mediaHandler.GetLinkPreview)
	return app
}

func TestLinkPreviewOldGETRejected(t *testing.T) {
	app := setupTestApp()

	req := httptest.NewRequest("GET", "/api/v1/media/link-preview?url=https://example.com", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("İstek hatası: %v", err)
	}

	if resp.StatusCode != fiber.StatusMethodNotAllowed {
		t.Errorf("Eski GET isteği reddedilmedi! Beklenen HTTP %d, Alınan HTTP %d", fiber.StatusMethodNotAllowed, resp.StatusCode)
	}
}

func TestLinkPreviewInvalidContentType(t *testing.T) {
	app := setupTestApp()

	body := bytes.NewBufferString(`{"url":"https://example.com"}`)
	req := httptest.NewRequest("POST", "/api/v1/media/link-preview", body)
	req.Header.Set("Content-Type", "text/plain")

	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("İstek hatası: %v", err)
	}

	if resp.StatusCode != fiber.StatusBadRequest {
		t.Errorf("Geçersiz Content-Type reddedilmedi! Beklenen HTTP %d, Alınan HTTP %d", fiber.StatusBadRequest, resp.StatusCode)
	}
}

func TestLinkPreviewEmptyBody(t *testing.T) {
	app := setupTestApp()

	req := httptest.NewRequest("POST", "/api/v1/media/link-preview", bytes.NewBuffer(nil))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("İstek hatası: %v", err)
	}

	if resp.StatusCode != fiber.StatusBadRequest {
		t.Errorf("Boş body reddedilmedi! Beklenen HTTP %d, Alınan HTTP %d", fiber.StatusBadRequest, resp.StatusCode)
	}
}

func TestLinkPreviewInvalidJSON(t *testing.T) {
	app := setupTestApp()

	body := bytes.NewBufferString(`{"url": not-a-valid-json`)
	req := httptest.NewRequest("POST", "/api/v1/media/link-preview", body)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("İstek hatası: %v", err)
	}

	if resp.StatusCode != fiber.StatusBadRequest {
		t.Errorf("Geçersiz JSON reddedilmedi! Beklenen HTTP %d, Alınan HTTP %d", fiber.StatusBadRequest, resp.StatusCode)
	}
}

func TestLinkPreviewEmptyURL(t *testing.T) {
	app := setupTestApp()

	testBodies := []string{
		`{"url":""}`,
		`{"url":"   "}`,
		`{}`,
	}

	for _, b := range testBodies {
		req := httptest.NewRequest("POST", "/api/v1/media/link-preview", bytes.NewBufferString(b))
		req.Header.Set("Content-Type", "application/json")

		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("İstek hatası: %v", err)
		}

		if resp.StatusCode != fiber.StatusBadRequest {
			t.Errorf("Boş URL kabul edildi: %s, beklenen HTTP %d, alınan HTTP %d", b, fiber.StatusBadRequest, resp.StatusCode)
		}
	}
}

func TestLinkPreviewPayloadTooLarge(t *testing.T) {
	app := setupTestApp()

	largeURL := "https://example.com/" + strings.Repeat("x", 5000)
	payload, _ := json.Marshal(map[string]string{"url": largeURL})

	req := httptest.NewRequest("POST", "/api/v1/media/link-preview", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("İstek hatası: %v", err)
	}

	if resp.StatusCode != fiber.StatusRequestEntityTooLarge {
		t.Errorf("Büyük gövde reddedilmedi! Beklenen HTTP %d, Alınan HTTP %d", fiber.StatusRequestEntityTooLarge, resp.StatusCode)
	}
}

func TestLinkPreviewSSRFBlockedAndNoLeak(t *testing.T) {
	app := setupTestApp()

	ssrfTargets := []struct {
		name      string
		targetURL string
		leakCheck string
	}{
		{"Loopback IPv4", "http://127.0.0.1:8080/secret", "127.0.0.1"},
		{"Localhost Hostname", "http://localhost:3000/api", "localhost"},
		{"Cloud Metadata IP", "http://169.254.169.254/latest/meta-data/", "169.254"},
		{"Private 192.168.x", "http://192.168.1.1/admin", "192.168.1.1"},
		{"Private 10.x", "http://10.0.0.1/status", "10.0.0.1"},
		{"Google Metadata Internal", "http://metadata.google.internal/computeMetadata/v1/", "metadata.google"},
	}

	for _, tt := range ssrfTargets {
		t.Run(tt.name, func(t *testing.T) {
			payload, _ := json.Marshal(map[string]string{"url": tt.targetURL})
			req := httptest.NewRequest("POST", "/api/v1/media/link-preview", bytes.NewBuffer(payload))
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req, -1)
			if err != nil {
				t.Fatalf("İstek hatası: %v", err)
			}

			if resp.StatusCode != fiber.StatusNotFound {
				t.Errorf("%s engellenmedi! Beklenen HTTP 404, Alınan HTTP %d", tt.name, resp.StatusCode)
			}

			respBytes, _ := io.ReadAll(resp.Body)
			respStr := string(respBytes)

			// 1. Beklenen jenerik hata mesajı
			if !strings.Contains(respStr, "Bağlantı önizlemesi alınamadı.") {
				t.Errorf("%s için beklenen genel hata mesajı dönmedi: %s", tt.name, respStr)
			}

			// 2. URL, hostname veya IP sızıntı kontrolü
			if strings.Contains(respStr, tt.leakCheck) {
				t.Errorf("GÜVENLİK SIZINTISI: Hata cevabında '%s' bilgisi sızdırıldı! Response: %s", tt.leakCheck, respStr)
			}
			if strings.Contains(respStr, tt.targetURL) {
				t.Errorf("GÜVENLİK SIZINTISI: Hata cevabında hedef URL sızdırıldı! Response: %s", respStr)
			}
		})
	}
}
