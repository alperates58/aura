"use client";

import React from "react";
import { User } from "@/store/useAuthStore";
import {
  Search,
  RefreshCw,
  ShieldAlert,
  Pencil,
  UserCheck,
  Ban,
  Trash2,
} from "lucide-react";

interface UsersTabProps {
  users: User[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  roleFilter: string;
  setRoleFilter: (r: string) => void;
  isLoading: boolean;
  loadUsers: () => void;
  onOpenEditUser: (u: User) => void;
  onToggleUserBan: (u: User) => void;
  onDeleteUser: (id: string, username: string) => void;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  users,
  searchQuery,
  setSearchQuery,
  roleFilter,
  setRoleFilter,
  isLoading,
  loadUsers,
  onOpenEditUser,
  onToggleUserBan,
  onDeleteUser,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Kullanıcı adı veya ad ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadUsers()}
            className="w-full bg-[#141720] border border-[#252936] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/60"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="flex-1 sm:flex-initial bg-[#141720] border border-[#252936] rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none"
          >
            <option value="all">Tüm Roller</option>
            <option value="admin">Admin</option>
            <option value="moderator">Moderatör</option>
            <option value="member">Üye</option>
          </select>

          <button
            onClick={loadUsers}
            className="p-2 bg-[#141720] border border-[#252936] rounded-xl hover:bg-[#202534] text-slate-300 transition-colors cursor-pointer flex-shrink-0"
            title="Yenile"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        {users.map((u) => {
          const isOnline = u.online_status === 1;
          const isAdmin = u.role === "admin";
          const isMod = u.role === "moderator";

          return (
            <div
              key={u.id}
              className="p-3.5 sm:p-4 rounded-2xl bg-[#12151D] border border-[#222634] hover:border-slate-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md"
            >
              {/* Sol: Avatar + İsimler + Rozetler */}
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="relative flex-shrink-0">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 border border-slate-700 flex items-center justify-center font-bold text-sm text-pink-400 overflow-hidden shadow-inner">
                    {u.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.avatar_url}
                        alt={u.display_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      u.display_name?.charAt(0).toUpperCase() || "U"
                    )}
                  </div>
                  {isOnline && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#12151D]" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-bold text-white truncate">
                      {u.display_name}
                    </span>

                    {/* Rol Rozeti */}
                    {isAdmin ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-purple-400" />
                        Yönetici
                      </span>
                    ) : isMod ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        Moderatör
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
                        Üye
                      </span>
                    )}

                    {/* Yasaklı Rozeti */}
                    {u.is_banned && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40">
                        YASAKLI
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="font-mono text-slate-300">@{u.username}</span>
                    <span className="text-slate-600">•</span>
                    <span className="truncate">{u.email}</span>
                  </div>
                </div>
              </div>

              {/* Sağ: Eylem Butonları */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-[#222634]">
                {/* Düzenle Butonu */}
                <button
                  onClick={() => onOpenEditUser(u)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/35 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-semibold transition-colors cursor-pointer"
                  title="Kullanıcı Bilgilerini Düzenle"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Düzenle</span>
                </button>

                {/* Yasakla / Yasağı Kaldır */}
                <button
                  onClick={() => onToggleUserBan(u)}
                  title={u.is_banned ? "Yasağı Kaldır" : "Kullanıcıyı Yasakla"}
                  className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                    u.is_banned
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                  }`}
                >
                  {u.is_banned ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                </button>

                {/* Kalıcı Sil */}
                <button
                  onClick={() => onDeleteUser(u.id, u.username)}
                  title="Kullanıcıyı Kalıcı Sil"
                  className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/80 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {users.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-2xl">
            Kriterlere uygun kullanıcı bulunamadı.
          </div>
        )}
      </div>
    </div>
  );
};
