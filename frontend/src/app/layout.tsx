import type { Metadata, Viewport } from "next";
import "../styles/globals.css";
import ServiceWorkerRegister from "@/components/layout/ServiceWorkerRegister";
import SystemSettingsInitializer from "@/components/layout/SystemSettingsInitializer";

const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const basePath = rawBasePath.startsWith("/")
  ? rawBasePath.replace(/\/+$/, "")
  : rawBasePath
  ? "/" + rawBasePath.replace(/\/+$/, "")
  : "";

const manifestPath = basePath ? `${basePath}/manifest.webmanifest` : "/manifest.webmanifest";

export const metadata: Metadata = {
  title: "Aura",
  description: "Aura",
  icons: {
    icon: basePath ? `${basePath}/favicon.ico` : "/favicon.ico",
    apple: basePath ? `${basePath}/favicon.ico` : "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0B0C0F",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="dark">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <link
          rel="manifest"
          href={manifestPath}
          crossOrigin="use-credentials"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var panicEscaped = (localStorage.getItem("aura_panic_escaped") === "1" || sessionStorage.getItem("aura_panic_escaped") === "1");
                  if (panicEscaped) {
                    localStorage.removeItem("aura_panic_escaped");
                    sessionStorage.removeItem("aura_panic_escaped");
                    var pathParts = window.location.pathname.split("/").filter(Boolean);
                    var sub = (pathParts.length > 0 && ["login", "register", "chat", "settings", "api"].indexOf(pathParts[0]) === -1) ? "/" + pathParts[0] : "";
                    var targetLogin = sub ? sub + "/login" : "/login";
                    if (window.location.pathname !== targetLogin) {
                      window.location.replace(targetLogin);
                      return;
                    }
                  }

                  var cached = localStorage.getItem("aura_security_settings");
                  var inactive = localStorage.getItem("aura_inactive_since");
                  var lastActive = localStorage.getItem("aura_last_active");
                  if (cached && (inactive || lastActive)) {
                    var s = JSON.parse(cached);
                    var sinceInactive = inactive ? parseInt(inactive, 10) : 0;
                    var sinceActive = lastActive ? parseInt(lastActive, 10) : 0;
                    var since = Math.max(sinceInactive, sinceActive);

                    var timeout = (Number(s.inactivity_timeout_minutes) || 15) * 60 * 1000;
                    if (s.inactivity_logout_enabled && since > 0 && (Date.now() - since) >= timeout) {
                      var scheduleOk = true;
                      if (s.inactivity_schedule_enabled === true) {
                        var now = new Date();
                        var day = now.getDay();
                        var isWeekend = day === 0 || day === 6;
                        if (isWeekend && s.inactivity_weekend_full !== false) {
                          scheduleOk = true;
                        } else {
                          var curMin = now.getHours() * 60 + now.getMinutes();
                          var parseMin = function(t, def) {
                            if (!t || t.indexOf(":") === -1) return def;
                            var p = t.split(":");
                            var h = parseInt(p[0], 10);
                            var m = parseInt(p[1], 10);
                            return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
                          };
                          var startMin = parseMin(s.inactivity_weekday_start, 17 * 60 + 30);
                          var endMin = parseMin(s.inactivity_weekday_end, 8 * 60 + 30);
                          if (startMin > endMin) {
                            scheduleOk = curMin >= startMin || curMin < endMin;
                          } else if (startMin < endMin) {
                            scheduleOk = curMin >= startMin && curMin < endMin;
                          }
                        }
                      }

                      if (scheduleOk) {
                        localStorage.removeItem("aura_inactive_since");
                        localStorage.removeItem("aura_last_active");
                        var url = (s.inactivity_redirect_url || "https://www.google.com").trim();
                        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
                        
                        var pParts = window.location.pathname.split("/").filter(Boolean);
                        var subPath = (pParts.length > 0 && ["login", "register", "chat", "settings", "api"].indexOf(pParts[0]) === -1) ? "/" + pParts[0] : "";
                        var logoutUrl = window.location.origin + subPath + "/api/v1/auth/logout";
                        try { fetch(logoutUrl, { method: "POST", credentials: "include", keepalive: true }); } catch(e){}
                        try { navigator.sendBeacon(logoutUrl); } catch(e){}

                        try {
                          var a = document.createElement("a");
                          a.href = url;
                          a.rel = "noreferrer noopener";
                          a.target = "_self";
                          document.body.appendChild(a);
                          a.click();
                        } catch(e){}
                        try { window.location.replace(url); } catch(e){}
                        try { window.location.href = url; } catch(e){}
                        try { window.location.assign(url); } catch(e){}
                      }
                    }
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-grupo-dark-bg text-slate-100 antialiased h-full w-full overflow-hidden flex flex-col">
        <ServiceWorkerRegister />
        <SystemSettingsInitializer />
        {children}
      </body>
    </html>
  );
}
