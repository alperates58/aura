// ==========================================
// AURA - WhatsApp Tarzı Tarih ve Saat Araçları
// ==========================================

/**
 * WhatsApp tarzı Son Görülme (Last Seen) formatlayıcı
 * @param lastSeenAt ISO8601 tarih damgası
 * @param allowLastSeen Gizlilik ayarı (false ise son görülme gizlenir)
 */
export function formatLastSeen(lastSeenAt?: string | null, allowLastSeen: boolean = true): string {
  if (allowLastSeen === false) {
    return "";
  }

  if (!lastSeenAt) {
    return "son görülme yakınlarda";
  }

  const date = new Date(lastSeenAt);
  if (isNaN(date.getTime()) || date.getFullYear() <= 1970) {
    return "son görülme yakınlarda";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Henüz gerçekleşmiş veya 1 dakikadan az (istemci/sunucu saat farkı toleransı ile)
  if (diffMs < 60 * 1000 && diffMs > -120 * 1000) {
    return "son görülme az önce";
  }

  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  // Bugün mü?
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return `son görülme bugün ${timeStr}`;
  }

  // Dün mü?
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `son görülme dün ${timeStr}`;
  }

  // Bu yıl içinde mi?
  if (date.getFullYear() === now.getFullYear()) {
    const months = [
      "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
      "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
    ];
    return `son görülme ${date.getDate()} ${months[date.getMonth()]} ${timeStr}`;
  }

  // Daha eski bir yıl
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  return `son görülme ${day}.${month}.${date.getFullYear()} ${timeStr}`;
}

/**
 * Mesaj saati formatlayıcı (Örn: 14:32)
 */
export function formatMessageTime(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/**
 * Hikaye zamanı formatlayıcı (Örn: "15 dk önce", "2 saat önce")
 */
export function formatStoryTime(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";

  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "az önce";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} saat önce`;
  return `${Math.floor(diffHour / 24)} gün önce`;
}

/**
 * Verilen hex renk koduna göre en uygun kontrast metin rengini hesaplar
 * (Açık arkaplanlar için koyu metin #0F172A, koyu arkaplanlar için beyaz metin #FFFFFF).
 * Standart YIQ/WCAG bağıl parlaklık formülünü kullanır.
 */
export function getContrastTextColor(hexColor?: string): string {
  if (!hexColor || typeof hexColor !== "string") return "#FFFFFF";
  let hex = hexColor.replace("#", "").trim();
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (hex.length !== 6) return "#FFFFFF";
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "#FFFFFF";

  // YIQ formülü (insan gözünün duyarlılığına göre algılanan parlaklık)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 145 ? "#0F172A" : "#FFFFFF";
}

/**
 * Verilen arka plan veya metin rengine göre mesaj saati, tik ikonları ve ikincil metinler
 * için en uygun, gözü yormayan ve yüksek okunurluğa sahip "muted" renk değerini hesaplar.
 * Açık zemin/koyu metin durumunda: rgba(15, 23, 42, 0.65)
 * Koyu zemin/açık metin durumunda: rgba(255, 255, 255, 0.70)
 */
export function getMutedTextColor(bubbleHex?: string, textHex?: string): string {
  // Eğer özel metin rengi belirtilmişse ve "auto" değilse, metin renginin parlaklığına bakılır
  if (textHex && textHex !== "auto") {
    let cleanHex = textHex.replace("#", "").trim();
    if (cleanHex.length === 3) cleanHex = cleanHex.split("").map((c) => c + c).join("");
    if (cleanHex.length === 6) {
      const r = parseInt(cleanHex.substring(0, 2), 16);
      const g = parseInt(cleanHex.substring(2, 4), 16);
      const b = parseInt(cleanHex.substring(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        // Metin rengi açıksa (örn. #FFFFFF, #E9EDEF, #F8FAFC) muted renk açık ton olmalı
        if (yiq >= 145) {
          return "rgba(255, 255, 255, 0.70)";
        } else {
          return "rgba(15, 23, 42, 0.65)";
        }
      }
    }
  }

  // Metin rengi belirtilmemişse veya auto ise balonun arka plan rengine göre belirlenir
  if (bubbleHex) {
    const contrast = getContrastTextColor(bubbleHex);
    return contrast === "#0F172A"
      ? "rgba(15, 23, 42, 0.65)"
      : "rgba(255, 255, 255, 0.70)";
  }

  return "rgba(255, 255, 255, 0.70)";
}

/**
 * Sohbet mesaj yazma alanına (textarea) odağı verir ve imleci sona taşır.
 * Özellikle masaüstü (PC) ortamında yanıtla butonuna tıklandığında hemen yazmaya başlamak için kullanılır.
 */
export function focusChatInput(delayMs: number = 0) {
  if (typeof document === "undefined") return;

  const doFocus = () => {
    const textarea = document.getElementById("aura-chat-input") as HTMLTextAreaElement | null;
    if (textarea) {
      textarea.focus();
      const len = textarea.value.length;
      textarea.setSelectionRange(len, len);
    }
  };

  if (delayMs <= 0) {
    doFocus();
    // Menü kapanış animasyonu ve DOM yerleşimi sonrası garanti odakla
    setTimeout(doFocus, 50);
    setTimeout(doFocus, 150);
  } else {
    setTimeout(doFocus, delayMs);
  }
}

/**
 * Yasaklı kelimeleri e*** şeklinde dinamik olarak maskeler.
 * Hem geçmiş hem de canlı mesajlarda sansür sağlar.
 * Örnek: "elma" -> "e***"
 */
export function maskBannedWords(text?: string | null, bannedWords?: any): string {
  if (!text || typeof text !== "string") return "";
  if (!bannedWords || !Array.isArray(bannedWords) || bannedWords.length === 0) return text;

  let result = text;
  for (const item of bannedWords) {
    if (!item || typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;

    try {
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Kelime sınırları veya noktalama işaretleri ile yakalama grubu (Safari/eski tarayıcılarda lookbehind çökmesini önler)
      const regex = new RegExp(`(^|[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ_])(${escaped})([^a-zA-Z0-9çğıöşüÇĞİÖŞÜ_]|$)`, "gi");
      result = result.replace(regex, (_match, before, wordMatch, after) => {
        const chars = Array.from(wordMatch as string);
        const masked = chars.length <= 1 ? "*" : chars[0] + "*".repeat(chars.length - 1);
        return (before || "") + masked + (after || "");
      });
    } catch {
      // Basit regex fallback
      try {
        const simpleRegex = new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        result = result.replace(simpleRegex, (match) => {
          const chars = Array.from(match);
          if (chars.length <= 1) return "*";
          return chars[0] + "*".repeat(chars.length - 1);
        });
      } catch (_) {}
    }
  }

  return result;
}


