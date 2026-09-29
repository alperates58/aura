import axios from "axios";
 
export const getBasePath = (): string => {
  if (typeof window === "undefined") {
    let bp = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
    if (bp && !bp.startsWith("/")) bp = "/" + bp;
    return bp.replace(/\/+$/, "");
  }

  // 1. Ortam değişkeninden tanımlıysa
  let bp = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
  if (bp) {
    if (!bp.startsWith("/")) bp = "/" + bp;
    return bp.replace(/\/+$/, "");
  }

  // 2. Dinamik tarayıcı URL yolundan alt dizin tespiti (Örn: /b/login veya /b -> /b)
  const match = window.location.pathname.match(/^(\/[a-zA-Z0-9_-]+)/);
  if (match && !["/login", "/register", "/chat", "/settings", "/api", "/ws"].includes(match[1])) {
    return match[1].replace(/\/+$/, "");
  }

  return "";
};

export const getLoginUrl = (): string => {
  const bp = getBasePath();
  return bp ? `${bp}/login` : "/login";
};

export const getApiBaseUrl = () => {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isLocalhost = host === "localhost" || host === "127.0.0.1";

    if (isLocalhost) {
      if (process.env.NEXT_PUBLIC_API_URL) {
        let raw = process.env.NEXT_PUBLIC_API_URL.trim().replace(/\/+$/, "");
        if (raw.endsWith("/api/v1")) return raw;
        if (raw.endsWith("/api")) return `${raw}/v1`;
        return `${raw}/api/v1`;
      }
      return "http://localhost:8080/api/v1";
    }

    // Üretim ortamında: Eğer açıkça harici API URL'i belirtildiyse (localhost içermeyen):
    if (
      process.env.NEXT_PUBLIC_API_URL &&
      !process.env.NEXT_PUBLIC_API_URL.includes("localhost") &&
      !process.env.NEXT_PUBLIC_API_URL.includes("127.0.0.1")
    ) {
      let raw = process.env.NEXT_PUBLIC_API_URL.trim().replace(/\/+$/, "");
      if (raw.endsWith("/api/v1")) return raw;
      if (raw.endsWith("/api")) return `${raw}/v1`;
      return `${raw}/api/v1`;
    }

    // Subpath tespiti (Örn: /b)
    const basePath = getBasePath();
    return `${window.location.origin}${basePath}/api/v1`;
  }

  if (
    process.env.NEXT_PUBLIC_API_URL &&
    !process.env.NEXT_PUBLIC_API_URL.includes("localhost") &&
    !process.env.NEXT_PUBLIC_API_URL.includes("127.0.0.1")
  ) {
    let raw = process.env.NEXT_PUBLIC_API_URL.trim().replace(/\/+$/, "");
    if (raw.endsWith("/api/v1")) return raw;
    if (raw.endsWith("/api")) return `${raw}/v1`;
    return `${raw}/api/v1`;
  }
  return "http://localhost:8080/api/v1";
};

export const resolveMediaUrl = (url?: string): string => {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }

  const apiBase = getApiBaseUrl().replace(/\/+$/, "");

  // Eğer url zaten /api/v1/media/file/ içeriyorsa (eski host veya tam path):
  const mediaIdx = url.indexOf("/api/v1/media/file/");
  if (mediaIdx !== -1) {
    const subPath = url.substring(mediaIdx + "/api/v1".length);
    return `${apiBase}${subPath}`;
  }

  // Eğer url /api/v1/ ile başlıyorsa:
  if (url.startsWith("/api/v1/")) {
    const subPath = url.substring("/api/v1".length);
    return `${apiBase}${subPath}`;
  }

  // S3 url'leri (/s3/bucket/object veya https://domain/subpath/s3/bucket/object):
  // MinIO'ya doğrudan Basic Auth credential gitmesini önlemek ve on-the-fly transcoding
  // ile Range streaming sağlamak için Go backend proxy'sine yönlendir.
  const s3Match = url.match(/(?:\/s3\/|^s3\/)(.+)$/);
  if (s3Match) {
    const objectPath = s3Match[1].replace(/^\/+/, "");
    return `${apiBase}/media/file/${objectPath}`;
  }

  // MinIO internal url: http://localhost:9000/... veya http://minio:9000/... veya IP
  const minioMatch = url.match(/^https?:\/\/(?:[a-zA-Z0-9_.-]+):9000\/(.+)$/);
  if (minioMatch) {
    const objectPath = minioMatch[1];
    return `${apiBase}/media/file/${objectPath}`;
  }

  // Eğer sadece /media/... şeklinde göreceli path ise:
  if (url.startsWith("/media/")) {
    return `${apiBase}${url}`;
  }

  return url;
};

export const getOrCreateSessionId = (): string => {
  if (typeof window === "undefined") return "";
  try {
    let sid = localStorage.getItem("aura_device_session_id");
    if (!sid) {
      sid = "dev_" + Math.random().toString(36).substring(2, 12) + "_" + Date.now().toString(36);
      localStorage.setItem("aura_device_session_id", sid);
    }
    return sid;
  } catch {
    return "";
  }
};

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true, // HttpOnly cookie'leri otomatik taşır
  headers: {
    "Content-Type": "application/json",
  },
});

// Tüm API isteklerine tarayıcı/sekme bazlı benzersiz Oturum Kimliği ekle
api.interceptors.request.use((config) => {
  const sid = getOrCreateSessionId();
  if (sid) {
    config.headers["X-Session-ID"] = sid;
  }
  return config;
});

// Otomatik 401 kontrolü ve token yenileme
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/login") &&
      !originalRequest.url?.includes("/auth/register") &&
      !originalRequest.url?.includes("/auth/refresh")
    ) {
      originalRequest._retry = true;
      try {
        await api.post("/auth/refresh");
        return api(originalRequest);
      } catch (refreshError: any) {
        // Oturum başka bir cihazdan düşürülmüşse veya süresi dolmuşsa çıkışa yönlendir.
        // DİKKAT: /auth/me (ilk sayfa oturum denetimi) çağrısında sert sayfa yönlendirmesi
        // yapma; useAuthStore / page.tsx içindeki Next.js router.replace("/login") yönetsin!
        if (
          typeof window !== "undefined" &&
          !window.location.pathname.includes("/login") &&
          !originalRequest.url?.includes("/auth/me")
        ) {
          window.location.href = getLoginUrl();
        }
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);
