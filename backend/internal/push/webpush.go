package push

import (
	"encoding/json"
	"log"
	"os"

	"aura/internal/database"
	webpush "github.com/SherClockHolmes/webpush-go"
)

type VAPIDService struct {
	PublicKey  string
	PrivateKey string
	Subscriber string
}

func NewVAPIDService() *VAPIDService {
	pub := os.Getenv("VAPID_PUBLIC_KEY")
	priv := os.Getenv("VAPID_PRIVATE_KEY")
	sub := os.Getenv("VAPID_SUBSCRIBER_EMAIL")

	if sub == "" {
		sub = "mailto:admin@aura.local"
	}

	// Eğer VAPID key tanımlı değilse test/varsayılan keypair üret
	if pub == "" || priv == "" {
		privateKey, publicKey, err := webpush.GenerateVAPIDKeys()
		if err == nil {
			pub = publicKey
			priv = privateKey
			log.Println("🔑 [VAPID] Yeni VAPID Anahtar Çifti oluşturuldu.")
		} else {
			pub = "BNh5aJj8u5u8K6H0qC-wX0zT0kM2_f1kE3hP-nL4sO9aB2cD5eF8gH1iJ3kL5mN7oP9qR1sT3uV5wX7yZ9"
			priv = "TEST_PRIVATE_KEY_FALLBACK"
		}
	}

	return &VAPIDService{
		PublicKey:  pub,
		PrivateKey: priv,
		Subscriber: sub,
	}
}

type PushPayload struct {
	Title  string                 `json:"title"`
	Body   string                 `json:"body"`
	Icon   string                 `json:"icon,omitempty"`
	Silent bool                   `json:"silent"`
	Tag    string                 `json:"tag,omitempty"`
	Data   map[string]interface{} `json:"data,omitempty"`
}

func (s *VAPIDService) SendPush(sub database.PushSubscription, title, body, icon, url string, silent bool) error {
	return s.SendPushWithTag(sub, title, body, icon, url, "aura-message", silent)
}

func (s *VAPIDService) SendPushWithTag(sub database.PushSubscription, title, body, icon, url, tag string, silent bool) error {
	payload := PushPayload{
		Title:  title,
		Body:   body,
		Icon:   icon,
		Silent: silent,
		Tag:    tag,
		Data: map[string]interface{}{
			"url": url,
		},
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	wpSub := webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys: webpush.Keys{
			P256dh: sub.P256dh,
			Auth:   sub.Auth,
		},
	}

	resp, err := webpush.SendNotification(payloadBytes, &wpSub, &webpush.Options{
		Subscriber:      s.Subscriber,
		VAPIDPublicKey:  s.PublicKey,
		VAPIDPrivateKey: s.PrivateKey,
		TTL:             86400, // 24 saat
	})

	if err != nil {
		log.Printf("⚠️ [Push] Bildirim gönderilemedi: %v", err)
		return err
	}
	defer resp.Body.Close()

	log.Printf("📱 [Push] Bildirim iletildi -> Endpoint: %s (Status: %d)", sub.Endpoint[:30]+"...", resp.StatusCode)
	return nil
}
