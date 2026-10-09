package redis

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// PresenceTTL çevrimiçi durumunun Redis üzerindeki geçerlilik süresidir (Heartbeat tabanlı TTL).
// Ağ kesintilerinde veya sunucu çökmelerinde kullanıcı sonsuza kadar online kalmaz.
const PresenceTTL = 75 * time.Second

type PresenceService struct {
	rdb *redis.Client
}

func NewPresenceService(rdb *redis.Client) *PresenceService {
	return &PresenceService{rdb: rdb}
}

func (s *PresenceService) SetUserOnline(ctx context.Context, userID uuid.UUID) error {
	key := fmt.Sprintf("user:%s:online", userID.String())
	return s.rdb.Set(ctx, key, "1", PresenceTTL).Err()
}

func (s *PresenceService) RefreshUserOnline(ctx context.Context, userID uuid.UUID) error {
	key := fmt.Sprintf("user:%s:online", userID.String())
	return s.rdb.Set(ctx, key, "1", PresenceTTL).Err()
}

func (s *PresenceService) SetUserOffline(ctx context.Context, userID uuid.UUID) error {
	key := fmt.Sprintf("user:%s:online", userID.String())
	return s.rdb.Del(ctx, key).Err()
}

func (s *PresenceService) IsUserOnline(ctx context.Context, userID uuid.UUID) bool {
	key := fmt.Sprintf("user:%s:online", userID.String())
	val, err := s.rdb.Exists(ctx, key).Result()
	return err == nil && val > 0
}

// ─────────────────────────────────────────────────────────────────────────────
// GERÇEK KULLANICI AKTİVİTESİ (SON GÖRÜLME KAYNAĞI)
// ─────────────────────────────────────────────────────────────────────────────
// `user:<id>:last_active` anahtarı kullanıcının EN SON GERÇEK etkileşim anını (Unix sn) tutar.
// Heartbeat ping'leri, otomatik delivered/read ack'leri bu değeri İLERİ TAŞIMAZ; aksi halde
// sekmesi açık kalan/telefonu kilitlenen kullanıcının son görülmesi atılma (kick) anına kayar.
// Değer yalnızca ileri gider (atomik max) — birden fazla cihaz/sekme birbirini geriye çekemez.

// LastActiveTTL gerçek aktivite damgasının Redis'te tutulma süresidir.
const LastActiveTTL = 24 * time.Hour

var touchLastActiveScript = redis.NewScript(`
local cur = tonumber(redis.call('GET', KEYS[1]) or '0') or 0
local v = tonumber(ARGV[1]) or 0
if v > cur then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
  return v
end
if cur > 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return cur
`)

func lastActiveKey(userID uuid.UUID) string {
	return "user:" + userID.String() + ":last_active"
}

// TouchLastActive kullanıcının gerçek son aktiflik anını `at` değerine ileri taşır (geri almaz).
func (s *PresenceService) TouchLastActive(ctx context.Context, userID uuid.UUID, at time.Time) error {
	if s == nil || s.rdb == nil || at.IsZero() {
		return nil
	}
	now := time.Now()
	if at.After(now) {
		at = now // Gelecek tarihli damga asla yazılmaz
	}
	return touchLastActiveScript.Run(ctx, s.rdb, []string{lastActiveKey(userID)},
		at.Unix(), int64(LastActiveTTL/time.Second)).Err()
}

// GetLastActive kullanıcının Redis'teki gerçek son aktiflik anını döndürür.
func (s *PresenceService) GetLastActive(ctx context.Context, userID uuid.UUID) (time.Time, bool) {
	if s == nil || s.rdb == nil {
		return time.Time{}, false
	}
	unix, err := s.rdb.Get(ctx, lastActiveKey(userID)).Int64()
	if err != nil || unix <= 0 {
		return time.Time{}, false
	}
	return time.Unix(unix, 0), true
}

// ResolveLastSeen "son görülme" için kullanılacak zamanı hesaplar:
// Redis'te geçerli bir gerçek aktivite damgası varsa onu (gelecekteyse şimdiye kırpılarak) döndürür,
// yoksa verilen fallback değerini döndürür.
func (s *PresenceService) ResolveLastSeen(ctx context.Context, userID uuid.UUID, fallback time.Time) time.Time {
	now := time.Now()
	if fallback.IsZero() || fallback.After(now) {
		fallback = now
	}
	lastActive, ok := s.GetLastActive(ctx, userID)
	if !ok || now.Sub(lastActive) > LastActiveTTL {
		return fallback
	}
	if lastActive.After(now) {
		return now
	}
	return lastActive
}
