"use client";

import React, { useState } from "react";
import { User, useAuthStore } from "@/store/useAuthStore";
import { Camera, Loader2 } from "lucide-react";

interface ProfileTabProps {
  user: User | null;
  showToast: (msg?: string) => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({ user, showToast }) => {
  const { updateProfile, uploadAvatar } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateProfile(displayName, bio);
      showToast("Profil ayarları başarıyla kaydedildi!");
    } catch {
      alert("Profil güncellenemedi.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      await uploadAvatar(file);
      showToast("Profil fotoğrafı güncellendi!");
    } catch {
      alert("Profil resmi yüklenemedi.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h3 className="text-base font-bold text-white">Profil Bilgileri</h3>
        <p className="text-xs text-slate-400">
          Aura ağındaki diğer kullanıcıların sizi nasıl göreceğini özelleştirin.
        </p>
      </div>

      {/* Avatar Yükleme */}
      <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
        <div className="relative group">
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-xl text-pink-400">
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              displayName.charAt(0).toUpperCase() || "U"
            )}
          </div>
          <label className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
            {isUploadingAvatar ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Camera className="w-5 h-5" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              disabled={isUploadingAvatar}
              className="hidden"
            />
          </label>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate">
            {user?.display_name}
          </div>
          <div className="text-xs text-slate-400 font-mono">
            @{user?.username}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {user?.email}
          </div>
        </div>
      </div>

      {/* Profil Formu */}
      <form onSubmit={handleSaveProfile} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Görünen Ad
          </label>
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-pink-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Biyografi / Durum Mesajı
          </label>
          <textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Kendiniz hakkında birkaç cümle..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-pink-500 resize-none"
          />
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-pink-600/30"
          >
            {isSaving ? "Kaydediliyor..." : "Profili Güncelle"}
          </button>
        </div>
      </form>
    </div>
  );
};
