package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"aura/internal/middleware"
	"github.com/fasthttp/websocket"
	"github.com/google/uuid"
)

var (
	targetURL   = flag.String("url", "ws://backend:8080/ws", "WebSocket sunucu adresi")
	jwtSecret   = flag.String("secret", "", "JWT access secret (zorunlu)")
	concurrency = flag.Int("c", 100, "Eşzamanlı bağlantı sayısı")
	duration    = flag.Duration("d", 10*time.Second, "Test süresi")
)

func main() {
	flag.Parse()

	if strings.TrimSpace(*jwtSecret) == "" {
		log.Fatal("❌ [Hata] -secret parametresi zorunludur. Lutfen gecerli bir JWT access secret belirtin. (Ornek: -secret <JWT_ACCESS_SECRET>)")
	}

	fmt.Println("==================================================")
	fmt.Printf("🚀 Aura Yüksek Eşzamanlılık & Yük Testi\n")
	fmt.Printf("🎯 Hedef: %s\n", *targetURL)
	fmt.Printf("👥 Eşzamanlı İstemci Sayısı: %d\n", *concurrency)
	fmt.Printf("⏱️ Süre: %v\n", *duration)
	fmt.Println("==================================================")

	var (
		connectedCount int64
		errorCount     int64
		messagesSent   int64
		messagesRecv   int64
		totalPingTime  int64 // nanosaniye
		pingCount      int64
	)

	u, err := url.Parse(*targetURL)
	if err != nil {
		log.Fatalf("Geçersiz URL: %v", err)
	}

	stopChan := make(chan struct{})
	var wg sync.WaitGroup

	startTime := time.Now()

	// Eşzamanlı bağlantıları başlat
	for i := 0; i < *concurrency; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()

			dialer := websocket.Dialer{
				HandshakeTimeout: 5 * time.Second,
			}

			// Her istemci için geçerli bir JWT Token üret
			clientUUID := uuid.New()
			clientUsername := fmt.Sprintf("load_tester_%d", id)
			token, err := middleware.GenerateAccessToken(clientUUID, clientUsername, *jwtSecret, 60)
			if err != nil {
				atomic.AddInt64(&errorCount, 1)
				return
			}

			clientURL := fmt.Sprintf("%s?token=%s", u.String(), token)

			header := make(http.Header)
			header.Set("User-Agent", fmt.Sprintf("LoadTestWorker-%d", id))

			conn, _, err := dialer.Dial(clientURL, header)
			if err != nil {
				atomic.AddInt64(&errorCount, 1)
				return
			}
			defer conn.Close()

			atomic.AddInt64(&connectedCount, 1)

			// Okuma döngüsü
			go func() {
				for {
					select {
					case <-stopChan:
						return
					default:
						_, _, err := conn.ReadMessage()
						if err != nil {
							return
						}
						atomic.AddInt64(&messagesRecv, 1)
					}
				}
			}()

			// Ping / Mesaj gönderme döngüsü
			ticker := time.NewTicker(2 * time.Second)
			defer ticker.Stop()

			for {
				select {
				case <-stopChan:
					return
				case <-ticker.C:
					pingStart := time.Now()
					err := conn.WriteMessage(websocket.TextMessage, []byte(`{"action":"ping","payload":{}}`))
					if err != nil {
						atomic.AddInt64(&errorCount, 1)
						return
					}
					atomic.AddInt64(&messagesSent, 1)
					latency := time.Since(pingStart).Nanoseconds()
					atomic.AddInt64(&totalPingTime, latency)
					atomic.AddInt64(&pingCount, 1)
				}
			}
		}(i)

		// Throttled ramp-up (bağlantı fırtınasını yumuşatmak için)
		if i%50 == 0 && i > 0 {
			time.Sleep(20 * time.Millisecond)
		}
	}

	// Belirlenen süre kadar çalıştır
	time.Sleep(*duration)
	close(stopChan)
	wg.Wait()

	totalTime := time.Since(startTime)
	avgLatencyMs := float64(0)
	if pingCount > 0 {
		avgLatencyMs = float64(totalPingTime) / float64(pingCount) / 1e6
	}

	fmt.Println("\n================ TEST SONUÇLARI ================")
	fmt.Printf("✅ Başarılı Bağlantılar: %d / %d\n", connectedCount, *concurrency)
	fmt.Printf("❌ Başarısız / Kopan:   %d\n", errorCount)
	fmt.Printf("📤 Gönderilen Paketler: %d\n", messagesSent)
	fmt.Printf("📥 Alınan Paketler:     %d\n", messagesRecv)
	fmt.Printf("⚡ Ortalama Gecikme:    %.2f ms\n", avgLatencyMs)
	fmt.Printf("⏱️ Toplam Test Süresi:  %v\n", totalTime)
	fmt.Println("================================================")
}
