import { getApiBaseUrl, getBasePath } from "./api";
import { useAuthStore } from "@/store/useAuthStore";
import { useSocketStore } from "@/store/useSocketStore";
import { useChatStore } from "@/store/useChatStore";
import { useCallStore } from "@/store/useCallStore";

/**
 * 100 Milisaniye Ani Refleks Kaçış Protokolü
 * Oturumu hem sunucuda hem istemcide tamamen siler, çerezleri imha eder
 * ve tarayıcıda 'Geri' tuşuna basılsa dahi siteye ASLA tekrar giriş yapılamamasını garanti eder.
 */
export async function performEmergencyEscape(targetUrl?: string) {
  let finalUrl = targetUrl && targetUrl.trim() ? targetUrl.trim() : "https://www.google.com";
  if (!/^https?:\/\//i.test(finalUrl)) {
    finalUrl = "https://" + finalUrl;
  }

  // 1. Acil kaçış bayraklarını hemen işaretle (Bfcache ve History Back anında yakalar)
  try {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("aura_panic_escaped", "1");
      localStorage.setItem("aura_panic_escaped", "1");
      localStorage.removeItem("aura_inactive_since");
      localStorage.removeItem("aura_last_active");
      localStorage.removeItem("aura_device_session_id");
    }
  } catch (_) {}

  // 2. Anında bellek içi React durumlarını sıfırla
  try {
    useSocketStore.getState().disconnect();
    useChatStore.getState().reset();
    useCallStore.getState().resetCall();
    useAuthStore.setState({ user: null, isAuthenticated: false });
  } catch (_) {}

  // 3. İstemci çerezlerini temizle
  try {
    if (typeof document !== "undefined") {
      document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; max-age=-1;";
      document.cookie = "refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; max-age=-1;";
      const bp = getBasePath();
      if (bp) {
        document.cookie = `access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${bp}; max-age=-1;`;
        document.cookie = `refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${bp}; max-age=-1;`;
      }
    }
  } catch (_) {}

  // 4. Arka planda sunucuya keepalive logout ve sendBeacon gönder (sayfa kapansa bile ağda tamamlanır)
  const baseUrl = getApiBaseUrl();
  const logoutUrl = `${baseUrl}/auth/logout`;

  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(logoutUrl);
    }
  } catch (_) {}

  try {
    fetch(logoutUrl, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
    });
  } catch (_) {}

  // 5. Sunucu token iptal isteğine 100ms grace period tanı
  try {
    await Promise.race([
      useAuthStore.getState().logout(),
      new Promise((resolve) => setTimeout(resolve, 100)),
    ]);
  } catch (_) {}

  // 6. Tarayıcıyı acil kaçış sayfasına ışınla (Geçmişi ezerek - replace)
  if (typeof window !== "undefined") {
    window.location.replace(finalUrl);
  }
}
