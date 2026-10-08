"use client";

import React from "react";
import { User } from "@/store/useAuthStore";
import { Pencil, X, AlertTriangle, RefreshCw, Check } from "lucide-react";

interface EditUserModalProps {
  editingUser: User | null;
  onClose: () => void;
  editDisplayName: string;
  setEditDisplayName: (val: string) => void;
  editUsername: string;
  setEditUsername: (val: string) => void;
  editEmail: string;
  setEditEmail: (val: string) => void;
  editPassword: string;
  setEditPassword: (val: string) => void;
  editRole: string;
  setEditRole: (val: string) => void;
  editIsBanned: boolean;
  setEditIsBanned: (val: boolean) => void;
  editBanReason: string;
  setEditBanReason: (val: string) => void;
  isSavingUser: boolean;
  editUserError: string | null;
  onSave: (e: React.FormEvent) => void;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  editingUser,
  onClose,
  editDisplayName,
  setEditDisplayName,
  editUsername,
  setEditUsername,
  editEmail,
  setEditEmail,
  editPassword,
  setEditPassword,
  editRole,
  setEditRole,
  editIsBanned,
  setEditIsBanned,
  editBanReason,
  setEditBanReason,
  isSavingUser,
  editUserError,
  onSave,
}) => {
  if (!editingUser) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in select-none">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#0F1219] border border-[#252A38] rounded-3xl shadow-2xl p-5 sm:p-6 flex flex-col gap-4 text-slate-200 animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto"
      >
        {/* Modal Başlığı */}
        <div className="flex items-center justify-between pb-3 border-b border-[#222736]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                Kullanıcı Bilgilerini Düzenle
              </h3>
              <p className="text-[11px] text-slate-400">
                @{editingUser.username} profilini ve yetkilerini yönetin
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hata Bildirimi */}
        {editUserError && (
          <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{editUserError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={onSave} className="space-y-3.5">
          {/* Ad Soyad */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Ad Soyad
            </label>
            <input
              type="text"
              required
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              className="w-full bg-[#151922] border border-[#272D3D] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Kullanıcı Adı */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Kullanıcı Adı (@username)
            </label>
            <input
              type="text"
              required
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              className="w-full bg-[#151922] border border-[#272D3D] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* E-posta Adresi */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              E-posta Adresi
            </label>
            <input
              type="email"
              required
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              className="w-full bg-[#151922] border border-[#272D3D] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Yeni Şifre */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Yeni Şifre Belirle <span className="text-slate-500 font-normal">(İsteğe bağlı)</span>
            </label>
            <input
              type="password"
              placeholder="Mevcut şifreyi korumak için boş bırakın (En az 6 karakter)"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              className="w-full bg-[#151922] border border-[#272D3D] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Kullanıcı Rolü */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Kullanıcı Rolü
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "member", label: "Üye", desc: "Standart" },
                { id: "moderator", label: "Moderatör", desc: "Denetçi" },
                { id: "admin", label: "Yönetici", desc: "Tam Yetki" },
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setEditRole(r.id)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    editRole === r.id
                      ? "bg-indigo-600/20 border-indigo-500 text-white font-bold"
                      : "bg-[#151922] border-[#272D3D] text-slate-400 hover:text-white"
                  }`}
                >
                  <div className="text-xs">{r.label}</div>
                  <div className="text-[10px] text-slate-400 font-normal">{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Hesap Durumu */}
          <div className="pt-2 border-t border-[#222736]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Hesap Durumu</div>
                <div className="text-[11px] text-slate-400">
                  {editIsBanned ? "Bu kullanıcının erişimi engellendi." : "Hesap aktif ve giriş yapabilir."}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditIsBanned(!editIsBanned)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  editIsBanned
                    ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                    : "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                }`}
              >
                {editIsBanned ? "Yasaklı" : "Aktif"}
              </button>
            </div>

            {editIsBanned && (
              <div className="mt-2.5">
                <label className="block text-[11px] font-semibold text-rose-300 mb-1">
                  Yasaklanma Gerekçesi
                </label>
                <input
                  type="text"
                  placeholder="Örn: Topluluk kuralları ihlali"
                  value={editBanReason}
                  onChange={(e) => setEditBanReason(e.target.value)}
                  className="w-full bg-[#151922] border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>
            )}
          </div>

          {/* Alt Butonlar */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#222736]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSavingUser}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition cursor-pointer"
            >
              {isSavingUser ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>{isSavingUser ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
