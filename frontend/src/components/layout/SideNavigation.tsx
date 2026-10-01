"use client";

import React, { useState, useEffect } from "react";
import {
  MessageSquare,
  Users,
  Star,
  Settings,
  LogOut,
  ShieldAlert,
  Activity,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Sliders,
} from "lucide-react";
import { User } from "@/store/useAuthStore";

export type NavTab = "chats" | "contacts" | "settings";

interface Props {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  unreadCount?: number;
  starredCount?: number;
  isConnected: boolean;
  user: User | null;
  onOpenSettings: () => void;
  onOpenAdmin?: (initialTab?: string) => void;
  onLogout: () => void;
}

export default function SideNavigation({
  activeTab,
  onTabChange,
  unreadCount = 0,
  starredCount = 0,
  isConnected,
  user,
  onOpenSettings,
  onOpenAdmin,
  onLogout,
}: Props) {
  // Sidebar varsayılan olarak geniş ekranda (>= 1200px) açık, daha dar ekranlarda ikon modunda (68px)
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      // 1200px altındaki ekranlarda veya pencere sağa/sola yaslandığında otomatik daralt
      if (window.innerWidth < 1200) {
        setIsExpanded(false);
      } else {
        const saved = localStorage.getItem("aura_sidebar_expanded");
        if (saved !== null) {
          setIsExpanded(saved === "true");
        } else {
          setIsExpanded(true);
        }
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    localStorage.setItem("aura_sidebar_expanded", String(next));
  };

  const isAdminOrMod = user?.role === "admin" || user?.role === "moderator";

  return (
    <aside
      className={`hidden md:flex ${
        isExpanded ? "w-[240px]" : "w-[68px]"
      } bg-[#14161D] border-r border-[#222631] flex-col justify-between py-4 z-20 flex-shrink-0 select-none transition-all duration-300 ease-in-out relative`}
    >
      {/* Üst Kısım: Logo ve Menü Öğeleri */}
      <div className="flex flex-col w-full px-2.5">
        
        {/* Başlık / Logo & Daralt/Genişlet Butonu */}
        {isExpanded ? (
          <div className="flex items-center justify-between mb-5 px-1.5 h-11 animate-fadeIn">
            <div className="flex items-center gap-3 overflow-hidden">
              <div
                title="Aura"
                className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 via-pink-600 to-amber-500 flex items-center justify-center font-black text-white text-base shadow-lg shadow-rose-950/50 flex-shrink-0 cursor-pointer transition-transform hover:scale-105 active:scale-95"
                onClick={toggleSidebar}
              >
                A
              </div>
              <div className="flex items-center overflow-hidden whitespace-nowrap">
                <span className="font-extrabold text-base text-white tracking-wide">
                  Aura
                </span>
              </div>
            </div>

            {/* Daralt Butonu */}
            <button
              onClick={toggleSidebar}
              title="Menüyü Daralt"
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-[#1E222D] transition-colors flex-shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center mb-5 h-11 w-full">
            <button
              onClick={toggleSidebar}
              title="Menüyü Genişlet"
              className="group relative w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 via-pink-600 to-amber-500 flex items-center justify-center font-black text-white text-base shadow-lg shadow-rose-950/50 cursor-pointer transition-transform hover:scale-105 active:scale-95 flex-shrink-0"
            >
              <span>A</span>
              <span className="absolute -right-1 -bottom-1 w-4 h-4 rounded-full bg-[#1E222D] border border-slate-700/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow">
                <ChevronRight className="w-2.5 h-2.5 text-slate-300" />
              </span>
            </button>
          </div>
        )}

        {/* Menü Linkleri */}
        <div className="space-y-1.5 w-full">
          {/* 1. Sohbetler (Chats) */}
          <button
            onClick={() => onTabChange("chats")}
            title="Sohbetler"
            style={
              activeTab === "chats"
                ? {
                    backgroundColor: "var(--accent, #E91E63)",
                    color: "var(--accent-text, #ffffff)",
                    boxShadow: "0 4px 12px var(--accent-shadow, rgba(233, 30, 99, 0.35))",
                  }
                : undefined
            }
            className={`w-full h-11 rounded-xl flex items-center gap-3 px-3 transition-all cursor-pointer ${
              activeTab === "chats"
                ? "text-white shadow-md font-semibold"
                : "text-slate-400 hover:text-white hover:bg-[#1E222D]"
            }`}
          >
            <div className="relative flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5" />
              {unreadCount > 0 && !isExpanded && (
                <span className="absolute -top-1.5 -right-2 px-1 py-0.2 min-w-[16px] h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shadow">
                  {unreadCount}
                </span>
              )}
            </div>
            {isExpanded && (
              <div className="flex-1 flex items-center justify-between text-xs whitespace-nowrap overflow-hidden">
                <span>Sohbetler</span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold">
                    {unreadCount}
                  </span>
                )}
              </div>
            )}
          </button>

          {/* 2. Kişiler (Contacts) */}
          <button
            onClick={() => onTabChange("contacts")}
            title="Kişiler"
            style={
              activeTab === "contacts"
                ? {
                    backgroundColor: "var(--accent, #E91E63)",
                    color: "var(--accent-text, #ffffff)",
                    boxShadow: "0 4px 12px var(--accent-shadow, rgba(233, 30, 99, 0.35))",
                  }
                : undefined
            }
            className={`w-full h-11 rounded-xl flex items-center gap-3 px-3 transition-all cursor-pointer ${
              activeTab === "contacts"
                ? "text-white shadow-md font-semibold"
                : "text-slate-400 hover:text-white hover:bg-[#1E222D]"
            }`}
          >
            <Users className="w-5 h-5 flex-shrink-0" />
            {isExpanded && <span className="text-xs whitespace-nowrap">Kişiler</span>}
          </button>

          {/* 3. Profil & Ayarlar */}
          <button
            onClick={() => {
              onTabChange("settings");
              onOpenSettings();
            }}
            title="Profil & Gizlilik Ayarları"
            style={
              activeTab === "settings"
                ? {
                    backgroundColor: "var(--accent, #E91E63)",
                    color: "var(--accent-text, #ffffff)",
                    boxShadow: "0 4px 12px var(--accent-shadow, rgba(233, 30, 99, 0.35))",
                  }
                : undefined
            }
            className={`w-full h-11 rounded-xl flex items-center gap-3 px-3 transition-all cursor-pointer ${
              activeTab === "settings"
                ? "text-white shadow-md font-semibold"
                : "text-slate-400 hover:text-white hover:bg-[#1E222D]"
            }`}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            {isExpanded && <span className="text-xs whitespace-nowrap">Profil & Ayarlar</span>}
          </button>

          {/* 5. YÖNETİM & PARAMETRELER (Aura Control Center) */}
          {onOpenAdmin && (
            <div className="pt-2 border-t border-[#222631] mt-2 space-y-1">
              <button
                onClick={() => onOpenAdmin()}
                title="Sistem Parametreleri Menüsü"
                className="w-full h-11 rounded-xl flex items-center gap-3 px-3 text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 transition-all cursor-pointer shadow-sm group"
              >
                <Sliders className="w-5 h-5 flex-shrink-0 text-amber-400 group-hover:scale-110 transition-transform" />
                {isExpanded && (
                  <div className="flex items-center justify-between flex-1 text-xs whitespace-nowrap overflow-hidden font-semibold">
                    <span>Parametreler</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                      Yönetim
                    </span>
                  </div>
                )}
              </button>

              <button
                onClick={() => onOpenAdmin("stats")}
                title="Sistem Sağlığı & İzleme"
                className="w-full h-10 rounded-xl flex items-center gap-3 px-3 text-slate-400 hover:text-white hover:bg-[#1E222D] transition-all cursor-pointer"
              >
                <Activity className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                {isExpanded && <span className="text-xs whitespace-nowrap">Sistem İzleme</span>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Alt Kısım: Kullanıcı Kartı, WS Durumu ve Çıkış */}
      <div className="flex flex-col w-full px-2.5 pt-3 border-t border-[#222631] gap-2">
        {/* Bağlantı Durumu */}
        <div
          title={isConnected ? "WebSocket: Bağlı" : "WebSocket: Bağlantı Kesildi"}
          className={`flex items-center gap-2 px-2 py-1 rounded-lg text-[11px] ${
            isConnected ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isConnected
                ? "bg-emerald-500 shadow-md shadow-emerald-500/80"
                : "bg-rose-500 animate-pulse"
            }`}
          />
          {isExpanded && (
            <span className="text-[10px] font-mono">
              {isConnected ? "Canlı Bağlantı" : "Bağlantı Kesildi"}
            </span>
          )}
        </div>

        {/* Kullanıcı Kartı & Çıkış Yap */}
        {user && (
          <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-[#1A1D26] transition-colors">
            <div
              onClick={onOpenSettings}
              className="flex items-center gap-2.5 overflow-hidden cursor-pointer"
              title={`${user.display_name} (@${user.username})`}
            >
              <img
                src={
                  user.avatar_url ||
                  `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`
                }
                alt={user.display_name}
                className="w-8 h-8 rounded-xl object-cover border border-slate-700 bg-slate-800 flex-shrink-0"
              />
              {isExpanded && (
                <div className="flex flex-col overflow-hidden text-left whitespace-nowrap">
                  <span className="text-xs font-semibold text-white truncate">
                    {user.display_name}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">
                    @{user.username}
                  </span>
                </div>
              )}
            </div>

            {isExpanded && (
              <button
                onClick={onLogout}
                title="Çıkış Yap"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors flex-shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
