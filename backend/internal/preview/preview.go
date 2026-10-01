package preview

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

type LinkMetadata struct {
	URL         string `json:"url"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Image       string `json:"image"`
	SiteName    string `json:"site_name"`
}

type PreviewService struct {
	rdb    *redis.Client
	client *http.Client
}

// IsPrivateOrReservedIP verilen IP'nin yerel, dahili (RFC1918), link-local veya bulut metadata IP'si olup olmadığını denetler.
func IsPrivateOrReservedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}

	// 1. Standart Go IP kontrolleri
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsInterfaceLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() {
		return true
	}

	// 2. IPv4 Özel ve Rezerve CIDR blokları
	ipv4 := ip.To4()
	if ipv4 != nil {
		// 127.0.0.0/8 (Loopback)
		if ipv4[0] == 127 {
			return true
		}
		// 10.0.0.0/8 (Private)
		if ipv4[0] == 10 {
			return true
		}
		// 172.16.0.0/12 (Private)
		if ipv4[0] == 172 && (ipv4[1] >= 16 && ipv4[1] <= 31) {
			return true
		}
		// 192.168.0.0/16 (Private)
		if ipv4[0] == 192 && ipv4[1] == 168 {
			return true
		}
		// 169.254.0.0/16 (Link-local & AWS/Cloud Metadata: 169.254.169.254)
		if ipv4[0] == 169 && ipv4[1] == 254 {
			return true
		}
		// 0.0.0.0/8 (This host)
		if ipv4[0] == 0 {
			return true
		}
		// 100.64.0.0/10 (Carrier-Grade NAT)
		if ipv4[0] == 100 && (ipv4[1] >= 64 && ipv4[1] <= 127) {
			return true
		}
		// 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (Test-Net)
		if ipv4[0] == 192 && ipv4[1] == 0 && ipv4[2] == 2 {
			return true
		}
		if ipv4[0] == 198 && ipv4[1] == 51 && ipv4[2] == 100 {
			return true
		}
		if ipv4[0] == 203 && ipv4[1] == 0 && ipv4[2] == 113 {
			return true
		}
		// 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
		if ipv4[0] >= 224 {
			return true
		}
	} else {
		// IPv6 ::1 (Loopback)
		if ip.Equal(net.IPv6loopback) {
			return true
		}
		// IPv6 fc00::/7 (Unique Local)
		if len(ip) >= 1 && (ip[0]&0xfe) == 0xfc {
			return true
		}
		// IPv6 fe80::/10 (Link-Local)
		if len(ip) >= 2 && ip[0] == 0xfe && (ip[1]&0xc0) == 0x80 {
			return true
		}
	}

	return false
}

// ValidatePreviewURL verilen URL'yi SSRF tehditlerine karşı kapsamlı inceler.
func ValidatePreviewURL(rawURL string) (*url.URL, error) {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("geçersiz URL formatı: %w", err)
	}

	// 1. Sadece http ve https scheme'lerine izin ver
	scheme := strings.ToLower(parsedURL.Scheme)
	if scheme != "http" && scheme != "https" {
		return nil, errors.New("yalnızca HTTP ve HTTPS protokolleri desteklenmektedir")
	}

	// 2. URL içi kullanıcı adı / şifre yasakla (http://user:pass@host)
	if parsedURL.User != nil {
		return nil, errors.New("URL içinde kimlik bilgisi (kullanıcı adı/şifre) kabul edilmez")
	}

	// 2b. Port sınırlaması (Port taraması ve dahili servis problamayı engelle)
	portStr := parsedURL.Port()
	if portStr != "" {
		if portStr != "80" && portStr != "443" && portStr != "8080" && portStr != "8443" {
			return nil, fmt.Errorf("SSRF koruması: standart dışı web portuna erişim engellendi (%s)", portStr)
		}
	}

	hostname := strings.TrimSpace(parsedURL.Hostname())
	if hostname == "" {
		return nil, errors.New("geçersiz sunucu adı (hostname boş)")
	}

	// 3. Bilinen tehlikeli ve dahili isimler
	lowerHost := strings.ToLower(hostname)
	if lowerHost == "localhost" || strings.HasSuffix(lowerHost, ".localhost") ||
		strings.HasSuffix(lowerHost, ".local") || strings.HasSuffix(lowerHost, ".internal") ||
		lowerHost == "metadata.google.internal" {
		return nil, fmt.Errorf("SSRF koruması: dahili veya yerel adreslere erişim engellendi (%s)", hostname)
	}

	// 4. Eğer doğrudan IP girilmişse kontrol et
	if directIP := net.ParseIP(hostname); directIP != nil {
		if IsPrivateOrReservedIP(directIP) {
			return nil, fmt.Errorf("SSRF koruması: özel veya rezerve IP adresine erişim engellendi (%s)", hostname)
		}
		return parsedURL, nil
	}

	// 5. DNS çözümlemesi yap ve tüm dönen IP'leri kontrol et
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	ips, err := net.DefaultResolver.LookupIP(ctx, "ip", hostname)
	if err != nil {
		return nil, fmt.Errorf("alan adı çözümlenemedi (%s): %w", hostname, err)
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("alan adı için geçerli IP adresi bulunamadı (%s)", hostname)
	}

	for _, ip := range ips {
		if IsPrivateOrReservedIP(ip) {
			return nil, fmt.Errorf("SSRF koruması: alan adı dahili veya rezerve bir IP'ye çözümlendi (%s -> %s)", hostname, ip.String())
		}
	}

	return parsedURL, nil
}

func NewPreviewService(rdb *redis.Client) *PreviewService {
	dialer := &net.Dialer{
		Timeout:   3 * time.Second,
		KeepAlive: 10 * time.Second,
	}

	// DNS Rebinding korumalı Custom Transport:
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}

			// Doğrudan IP mi alan adı mı?
			ip := net.ParseIP(host)
			if ip != nil {
				if IsPrivateOrReservedIP(ip) {
					return nil, fmt.Errorf("SSRF koruması: yasaklı IP adresi: %s", ip.String())
				}
				return dialer.DialContext(ctx, network, addr)
			}

			// DNS Rebinding engelleme: Bağlantı kurulduğu milisaniyede IP'yi tekrar doğrula
			resolvedIPs, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
			if err != nil || len(resolvedIPs) == 0 {
				return nil, fmt.Errorf("ip çözümlenemedi: %w", err)
			}

			for _, rip := range resolvedIPs {
				if IsPrivateOrReservedIP(rip) {
					return nil, fmt.Errorf("SSRF koruması: çözümlenen IP özel/dahili ağa ait (%s -> %s)", host, rip.String())
				}
			}

			// İlk güvenli IP adresiyle doğrudan bağlan
			safeTarget := net.JoinHostPort(resolvedIPs[0].String(), port)
			return dialer.DialContext(ctx, network, safeTarget)
		},
		MaxIdleConns:        10,
		IdleConnTimeout:     10 * time.Second,
		TLSHandshakeTimeout: 3 * time.Second,
	}

	// Yönlendirme (Redirect) Koruması:
	client := &http.Client{
		Timeout:   4 * time.Second,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("çok fazla yönlendirme (maksimum 5)")
			}
			// Yönlenilen her yeni hedefi de SSRF süzgecinden geçir
			if _, err := ValidatePreviewURL(req.URL.String()); err != nil {
				return fmt.Errorf("yönlendirme hedefi güvenli değil: %w", err)
			}
			return nil
		},
	}

	return &PreviewService{
		rdb:    rdb,
		client: client,
	}
}

var (
	titleTagRegex       = regexp.MustCompile(`(?i)<title[^>]*>(.*?)</title>`)
	ogTitleRegex        = regexp.MustCompile(`(?i)<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']|<meta\s+[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']`)
	ogDescRegex         = regexp.MustCompile(`(?i)<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']|<meta\s+[^>]*content=["']([^"']*)["'][^>]*property=["']og:description["']`)
	metaDescRegex       = regexp.MustCompile(`(?i)<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["']|<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']description["']`)
	ogImageRegex        = regexp.MustCompile(`(?i)<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']|<meta\s+[^>]*content=["']([^"']*)["'][^>]*property=["']og:image["']`)
	ogSiteNameRegex     = regexp.MustCompile(`(?i)<meta\s+[^>]*property=["']og:site_name["'][^>]*content=["']([^"']*)["']|<meta\s+[^>]*content=["']([^"']*)["'][^>]*property=["']og:site_name["']`)
)

func (s *PreviewService) GetLinkPreview(ctx context.Context, rawURL string) (*LinkMetadata, error) {
	parsedURL, err := ValidatePreviewURL(rawURL)
	if err != nil {
		return nil, err
	}

	// 1. Redis Önbellek Kontrolü
	urlHash := hashURL(rawURL)
	cacheKey := fmt.Sprintf("preview:%s", urlHash)
	if s.rdb != nil {
		cachedData, err := s.rdb.Get(ctx, cacheKey).Result()
		if err == nil && cachedData != "" {
			var meta LinkMetadata
			if json.Unmarshal([]byte(cachedData), &meta) == nil {
				return &meta, nil
			}
		}
	}

	// 2. HTTP İsteği Yap (HTML'in ilk 512KB'ını oku)
	req, err := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; AuraBot/1.0)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return nil, fmt.Errorf("sunucu hatasi: %d", resp.StatusCode)
	}

	// Yalnızca ilk 512KB'ı belleğe al (bellek şişmesini önle)
	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if err != nil {
		return nil, err
	}
	bodyStr := string(bodyBytes)

	meta := &LinkMetadata{
		URL:      rawURL,
		SiteName: parsedURL.Hostname(),
	}

	// Başlık Çıkar
	if matches := ogTitleRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
		meta.Title = cleanMeta(matches[1])
		if meta.Title == "" && len(matches) > 2 {
			meta.Title = cleanMeta(matches[2])
		}
	}
	if meta.Title == "" {
		if matches := titleTagRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
			meta.Title = cleanMeta(matches[1])
		}
	}

	// Açıklama Çıkar
	if matches := ogDescRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
		meta.Description = cleanMeta(matches[1])
		if meta.Description == "" && len(matches) > 2 {
			meta.Description = cleanMeta(matches[2])
		}
	}
	if meta.Description == "" {
		if matches := metaDescRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
			meta.Description = cleanMeta(matches[1])
			if meta.Description == "" && len(matches) > 2 {
				meta.Description = cleanMeta(matches[2])
			}
		}
	}

	// Görsel Çıkar
	if matches := ogImageRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
		img := cleanMeta(matches[1])
		if img == "" && len(matches) > 2 {
			img = cleanMeta(matches[2])
		}
		if img != "" {
			meta.Image = resolveURL(parsedURL, img)
		}
	}

	// Site Adı Çıkar
	if matches := ogSiteNameRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
		name := cleanMeta(matches[1])
		if name == "" && len(matches) > 2 {
			name = cleanMeta(matches[2])
		}
		if name != "" {
			meta.SiteName = name
		}
	}

	if meta.Title == "" && meta.Description == "" {
		return nil, fmt.Errorf("metadata bulunamadi")
	}

	// 3. Redis'e 24 saatliğine kaydet
	if s.rdb != nil {
		if data, err := json.Marshal(meta); err == nil {
			_ = s.rdb.Set(ctx, cacheKey, string(data), 24*time.Hour).Err()
		}
	}

	return meta, nil
}

func hashURL(u string) string {
	h := sha256.Sum256([]byte(u))
	return hex.EncodeToString(h[:])
}

func cleanMeta(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\r", " ")
	for strings.Contains(s, "  ") {
		s = strings.ReplaceAll(s, "  ", " ")
	}
	return s
}

func resolveURL(base *url.URL, target string) string {
	targetURL, err := url.Parse(target)
	if err != nil {
		return target
	}
	return base.ResolveReference(targetURL).String()
}
