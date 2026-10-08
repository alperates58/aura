"use client";

import React from "react";
import { SystemSettings } from "@/lib/admin_api";
import { Lock, AlertTriangle, Save } from "lucide-react";

interface SecurityParamsTabProps {
  settings: SystemSettings;
  setSettings: React.Dispatch<React.SetStateAction<SystemSettings | null>>;
  onSave: (category: string, data: any) => Promise<boolean>;
}

export const SecurityParamsTab: React.FC<SecurityParamsTabProps> = ({
  settings,
  setSettings,
  onSave,
}) => {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-[#12151D] border border-[#222631] rounded-2xl space-y-4">
        <h3 className="text-xs font-bold text-white">Rate Limit & Spam Koruması</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Saniyede Maks. Mesaj</label>
            <input
              type="number"
              value={settings.security_settings.max_messages_per_second ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setSettings({
                  ...settings,
                  security_settings: {
                    ...settings.security_settings,
                    max_messages_per_second: val === "" ? ("" as any) : parseInt(val, 10),
                  },
                });
              }}
              onBlur={() => {
                if (
                  !settings.security_settings.max_messages_per_second ||
                  Number(settings.security_settings.max_messages_per_second) < 1
                ) {
                  setSettings({
                    ...settings,
                    security_settings: {
                      ...settings.security_settings,
                      max_messages_per_second: 5,
                    },
                  });
                }
              }}
              className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Dakikada Maks. Mesaj</label>
            <input
              type="number"
              value={settings.security_settings.max_messages_per_minute ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setSettings({
                  ...settings,
                  security_settings: {
                    ...settings.security_settings,
                    max_messages_per_minute: val === "" ? ("" as any) : parseInt(val, 10),
                  },
                });
              }}
              onBlur={() => {
                if (
                  !settings.security_settings.max_messages_per_minute ||
                  Number(settings.security_settings.max_messages_per_minute) < 1
                ) {
                  setSettings({
                    ...settings,
                    security_settings: {
                      ...settings.security_settings,
                      max_messages_per_minute: 60,
                    },
                  });
                }
              }}
              className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-[#222631]">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-xs font-semibold text-white min-w-0 pr-2">Güçlü Şifre Zorunluluğu</span>
            <input
              type="checkbox"
              checked={settings.security_settings.require_strong_passwords}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  security_settings: {
                    ...settings.security_settings,
                    require_strong_passwords: e.target.checked,
                  },
                })
              }
              className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Hatalı Giriş Kilidi (Deneme)</label>
              <input
                type="number"
                value={settings.security_settings.lockout_attempts ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setSettings({
                    ...settings,
                    security_settings: {
                      ...settings.security_settings,
                      lockout_attempts: val === "" ? ("" as any) : parseInt(val, 10),
                    },
                  });
                }}
                onBlur={() => {
                  if (
                    !settings.security_settings.lockout_attempts ||
                    Number(settings.security_settings.lockout_attempts) < 1
                  ) {
                    setSettings({
                      ...settings,
                      security_settings: {
                        ...settings.security_settings,
                        lockout_attempts: 5,
                      },
                    });
                  }
                }}
                className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Oturum Süresi (Gün)</label>
              <input
                type="number"
                value={settings.security_settings.session_timeout_days ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setSettings({
                    ...settings,
                    security_settings: {
                      ...settings.security_settings,
                      session_timeout_days: val === "" ? ("" as any) : parseInt(val, 10),
                    },
                  });
                }}
                onBlur={() => {
                  if (
                    !settings.security_settings.session_timeout_days ||
                    Number(settings.security_settings.session_timeout_days) < 1
                  ) {
                    setSettings({
                      ...settings,
                      security_settings: {
                        ...settings.security_settings,
                        session_timeout_days: 30,
                      },
                    });
                  }
                }}
                className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Otomatik Oturum Kapatma & Gizlilik Yönlendirmesi */}
        <div className="space-y-4 pt-4 border-t border-[#222631]">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-pink-400" />
            <div>
              <h4 className="text-xs font-bold text-white">Ekran Kilidi & Çevrimdışı Otomatik Çıkış</h4>
              <p className="text-[11px] text-slate-400">
                Telefon kilitlendiğinde veya inaktif kalındığında oturumu kapatıp hedef siteye yönlendirir.
              </p>
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 cursor-pointer bg-[#181B24] p-3 rounded-xl border border-[#292D38]">
            <div>
              <span className="text-xs font-semibold text-white block">İnaktivite Korumasını Etkinleştir</span>
              <span className="text-[10px] text-slate-400 block">
                Tuş kilidi kapalıyken belirlenen süre aşılırsa oturum sonlandırılır ve yönlendirme yapılır.
              </span>
            </div>
            <input
              type="checkbox"
              checked={settings.security_settings.inactivity_logout_enabled ?? false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  security_settings: {
                    ...settings.security_settings,
                    inactivity_logout_enabled: e.target.checked,
                  },
                })
              }
              className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Çevrimdışı Kalma Süresi (Dakika)
              </label>
              <input
                type="number"
                min="1"
                max="1440"
                placeholder="15"
                value={settings.security_settings.inactivity_timeout_minutes ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setSettings({
                    ...settings,
                    security_settings: {
                      ...settings.security_settings,
                      inactivity_timeout_minutes: val === "" ? ("" as any) : parseInt(val, 10),
                    },
                  });
                }}
                onBlur={() => {
                  if (
                    !settings.security_settings.inactivity_timeout_minutes ||
                    Number(settings.security_settings.inactivity_timeout_minutes) < 1
                  ) {
                    setSettings({
                      ...settings,
                      security_settings: {
                        ...settings.security_settings,
                        inactivity_timeout_minutes: 15,
                      },
                    });
                  }
                }}
                className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Örn: 15 dakika boyunca kilitli kalırsa</span>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Yönlendirilecek Hedef Web Sitesi (URL)
              </label>
              <input
                type="url"
                placeholder="https://www.google.com"
                value={settings.security_settings.inactivity_redirect_url ?? "https://www.google.com"}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    security_settings: {
                      ...settings.security_settings,
                      inactivity_redirect_url: e.target.value,
                    },
                  })
                }
                className="w-full bg-[#181B24] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Süre dolunca anında bu adrese fırlatılır</span>
            </div>
          </div>

          {/* Zamanlama / Mesai Saatleri Kuralı */}
          <div className="pt-3 border-t border-[#222631] space-y-3">
            <label className="flex items-center justify-between gap-3 cursor-pointer bg-[#181B24] p-3 rounded-xl border border-[#292D38]">
              <div>
                <span className="text-xs font-semibold text-white block">
                  Zaman Takvimi & Mesai Dışı Modu
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Sadece belirli saatlerde (örneğin hafta içi 17:30 sonrası ve hafta sonu tam gün) devreye girsin.
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.security_settings.inactivity_schedule_enabled ?? false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    security_settings: {
                      ...settings.security_settings,
                      inactivity_schedule_enabled: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
              />
            </label>

            {settings.security_settings.inactivity_schedule_enabled && (
              <div className="p-3 bg-[#181B24]/70 border border-[#292D38] rounded-xl space-y-3 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Hafta İçi Başlangıç Saati (Akşam)
                    </label>
                    <input
                      type="time"
                      value={settings.security_settings.inactivity_weekday_start ?? "17:30"}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          security_settings: {
                            ...settings.security_settings,
                            inactivity_weekday_start: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-[#12151D] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Örn: 17:30'dan sonra koruma başlar
                    </span>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Hafta İçi Bitiş Saati (Sabah)
                    </label>
                    <input
                      type="time"
                      value={settings.security_settings.inactivity_weekday_end ?? "08:30"}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          security_settings: {
                            ...settings.security_settings,
                            inactivity_weekday_end: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-[#12151D] border border-[#292D38] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Örn: Sabah 08:30'a kadar devam eder
                    </span>
                  </div>
                </div>

                <label className="flex items-center justify-between gap-3 cursor-pointer pt-2 border-t border-[#222631]">
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">
                      Hafta Sonu Tam Gün (7/24) Devrede
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Cumartesi ve Pazar günleri saat kısıtı olmadan 24 saat boyunca aktiftir.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.security_settings.inactivity_weekend_full ?? true}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        security_settings: {
                          ...settings.security_settings,
                          inactivity_weekend_full: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-pink-600 rounded cursor-pointer flex-shrink-0"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="p-3 bg-pink-950/20 border border-pink-900/30 rounded-xl text-[11px] text-pink-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-pink-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Gizlilik Kalkanı:</strong> Telefon tuş kilidi kapatıldığı an ekran görüntüsü zifiri karanlığa alınır. 
              Kullanıcı süre dolduktan sonra kilidi açtığında sohbet yazıları 1 salise bile görünmeden doğrudan hedef site açılır.
            </span>
          </div>
        </div>

        <button
          onClick={() => onSave("security_settings", settings.security_settings)}
          className="w-full py-2.5 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Güvenlik Parametrelerini Kaydet</span>
        </button>
      </div>
    </div>
  );
};
