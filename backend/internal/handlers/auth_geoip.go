package handlers

import (
	"encoding/json"
	"fmt"
	"math"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

var geoCache sync.Map

type GeoIPResponse struct {
	Status      string  `json:"status"`
	Country     string  `json:"country"`
	CountryCode string  `json:"countryCode"`
	City        string  `json:"city"`
	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
}

func isPrivateOrLocalIP(ipStr string) bool {
	ip := net.ParseIP(strings.TrimSpace(ipStr))
	if ip == nil {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast()
}

// GetRealIP, ters proxy (Traefik, Coolify, Nginx, Cloudflare) arkasındaki gerçek istemci IP adresini bulur.
func GetRealIP(c *fiber.Ctx) string {
	// 1. Cloudflare başlıkları
	if cf := strings.TrimSpace(c.Get("CF-Connecting-IP")); cf != "" {
		return cf
	}
	if tc := strings.TrimSpace(c.Get("True-Client-IP")); tc != "" {
		return tc
	}
	// 2. X-Real-IP başlığı
	if xri := strings.TrimSpace(c.Get("X-Real-IP")); xri != "" {
		return xri
	}
	// 3. X-Forwarded-For başlığı (virgülle ayrılmış liste: istemci, proxy1, proxy2...)
	if xff := strings.TrimSpace(c.Get("X-Forwarded-For")); xff != "" {
		parts := strings.Split(xff, ",")
		for _, part := range parts {
			cleanIP := strings.TrimSpace(part)
			if cleanIP != "" && !isPrivateOrLocalIP(cleanIP) {
				return cleanIP
			}
		}
		// Hepsi yerel ağ ise veya tek IP varsa ilk olanı al
		if len(parts) > 0 && strings.TrimSpace(parts[0]) != "" {
			return strings.TrimSpace(parts[0])
		}
	}
	// 4. Doğrudan TCP soket IP'si fallback
	return c.IP()
}

// ResolveIPLocation, IP adresinden şehir ve ülke bilgisini bayrak emojisi ile çözer.
func ResolveIPLocation(ipStr string) string {
	ipStr = strings.TrimSpace(ipStr)
	if ipStr == "" {
		return "Bilinmeyen Konum"
	}
	if isPrivateOrLocalIP(ipStr) {
		return "Yerel Ağ / Özel IP 🏠"
	}

	if val, ok := geoCache.Load(ipStr); ok {
		if loc, ok := val.(string); ok && loc != "" {
			return loc
		}
	}

	client := http.Client{
		Timeout: 2 * time.Second,
	}
	resp, err := client.Get(fmt.Sprintf("http://ip-api.com/json/%s?fields=status,country,countryCode,city", url.PathEscape(ipStr)))
	if err != nil {
		return "Bilinmeyen Konum"
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "Bilinmeyen Konum"
	}

	var data GeoIPResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil || data.Status != "success" {
		return "Bilinmeyen Konum"
	}

	flag := getCountryFlag(data.CountryCode)
	var location string
	if data.City != "" && data.Country != "" {
		location = fmt.Sprintf("%s, %s %s", data.City, data.Country, flag)
	} else if data.Country != "" {
		location = fmt.Sprintf("%s %s", data.Country, flag)
	} else {
		location = "Bilinmeyen Konum"
	}

	geoCache.Store(ipStr, location)
	return location
}

func getCountryFlag(countryCode string) string {
	code := strings.ToUpper(strings.TrimSpace(countryCode))
	if len(code) != 2 {
		return ""
	}
	r1 := rune(0x1F1E6 + int(code[0]-'A'))
	r2 := rune(0x1F1E6 + int(code[1]-'A'))
	return string([]rune{r1, r2})
}

func ResolveIPLocationDetails(ipStr string) *GeoIPResponse {
	ipStr = strings.TrimSpace(ipStr)
	if ipStr == "" || isPrivateOrLocalIP(ipStr) {
		return &GeoIPResponse{
			Status:      "success",
			Country:     "Türkiye",
			CountryCode: "TR",
			City:        "Yerel Ağ",
			Lat:         41.0082,
			Lon:         28.9784,
		}
	}

	if val, ok := geoCache.Load(ipStr + ":details"); ok {
		if geo, ok := val.(*GeoIPResponse); ok && geo != nil {
			return geo
		}
	}

	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://ip-api.com/json/%s?fields=status,country,countryCode,city,lat,lon", url.PathEscape(ipStr)))
	if err != nil {
		return &GeoIPResponse{Status: "fail", Country: "Bilinmeyen", City: "Bilinmeyen"}
	}
	defer resp.Body.Close()

	var geo GeoIPResponse
	if err := json.NewDecoder(resp.Body).Decode(&geo); err != nil {
		return &GeoIPResponse{Status: "fail", Country: "Bilinmeyen", City: "Bilinmeyen"}
	}

	geoCache.Store(ipStr+":details", &geo)
	return &geo
}

func haversineDistanceKm(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0 // Dünya yarıçapı km
	dLat := (lat2 - lat1) * (math.Pi / 180.0)
	dLon := (lon2 - lon1) * (math.Pi / 180.0)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*(math.Pi/180.0))*math.Cos(lat2*(math.Pi/180.0))*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}
