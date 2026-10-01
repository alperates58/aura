"use client";

import { MessageSquare, Users, Star, Settings, Sliders } from "lucide-react";
import { NavTab } from "./SideNavigation";

interface Props {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  unreadCount?: number;
  starredCount?: number;
  onOpenSettings: () => void;
  onOpenAdmin?: () => void;
}

export default function MobileNavigation({
  activeTab,
  onTabChange,
  unreadCount = 0,
  starredCount = 0,
  onOpenSettings,
  onOpenAdmin,
}: Props) {
  return (
    <nav className="md:hidden h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] bg-grupo-dark-card border-t border-grupo-dark-border flex items-center justify-around px-2 z-20 flex-shrink-0 select-none">
      {/* 1. Sohbetler */}
      <button
        onClick={() => onTabChange("chats")}
        style={activeTab === "chats" ? { color: "var(--accent, #E91E63)" } : undefined}
        className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-colors relative cursor-pointer ${
          activeTab === "chats" ? "font-bold" : "text-slate-400 hover:text-white"
        }`}
      >
        <MessageSquare className="w-5 h-5" />
        <span className="text-[10px]">Sohbetler</span>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-2 px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-bold">
            {unreadCount}
          </span>
        )}
      </button>

      {/* 2. Kişiler */}
      <button
        onClick={() => onTabChange("contacts")}
        style={activeTab === "contacts" ? { color: "var(--accent, #E91E63)" } : undefined}
        className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-colors cursor-pointer ${
          activeTab === "contacts" ? "font-bold" : "text-slate-400 hover:text-white"
        }`}
      >
        <Users className="w-5 h-5" />
        <span className="text-[10px]">Kişiler</span>
      </button>

      {/* 3. Ayarlar */}
      <button
        onClick={() => {
          onTabChange("settings");
          onOpenSettings();
        }}
        style={activeTab === "settings" ? { color: "var(--accent, #E91E63)" } : undefined}
        className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-colors cursor-pointer ${
          activeTab === "settings" ? "font-bold" : "text-slate-400 hover:text-white"
        }`}
      >
        <Settings className="w-5 h-5" />
        <span className="text-[10px]">Ayarlar</span>
      </button>

      {/* 5. Parametreler (Aura Yönetim) */}
      {onOpenAdmin && (
        <button
          onClick={onOpenAdmin}
          className="flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-colors cursor-pointer text-amber-400 hover:text-amber-300"
        >
          <Sliders className="w-5 h-5" />
          <span className="text-[10px]">Parametre</span>
        </button>
      )}
    </nav>
  );
}
