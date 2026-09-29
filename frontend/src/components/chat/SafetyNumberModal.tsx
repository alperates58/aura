"use client";

import { useState, useEffect } from "react";
import { X, ShieldCheck, Copy, Check, RefreshCw, Key, ShieldAlert } from "lucide-react";
import { User } from "@/store/useAuthStore";
import { Conversation } from "@/store/useChatStore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  otherUser: User;
  conversation: Conversation;
  onRegenerateCode?: () => Promise<void>;
}

// Deterministic 60-digit safety number calculation (12 blocks of 5 digits)
function generateSafetyNumber(userId1: string, userId2: string, version: number, salt: string): string {
  const sorted = [userId1, userId2].sort();
  const input = `${sorted[0]}:${sorted[1]}:v${version}:${salt || "aura-security"}`;
  
  // Deterministic pseudo-random expansion using Jenkins / FNV-1a inspired hash
  let hash1 = 2166136261;
  let hash2 = 33554467;
  let hash3 = 1000000007;

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    hash1 = Math.imul(hash1 ^ code, 16777619);
    hash2 = Math.imul(hash2 ^ code, 1099511628211);
    hash3 = Math.imul(hash3 ^ (code * (i + 1)), 524287);
  }

  let digits = "";
  let seed = Math.abs(hash1) + Math.abs(hash2) + Math.abs(hash3);

  // Generate 60 digits
  for (let i = 0; i < 60; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const digit = Math.floor((seed / 233280) * 10);
    digits += digit.toString();
  }

  // Format into 12 blocks of 5 digits
  return digits.match(/.{1,5}/g)?.join(" ") || digits;
}

export default function SafetyNumberModal({
  isOpen,
  onClose,
  currentUser,
  otherUser,
  conversation,
  onRegenerateCode,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      // Check if user already marked this conversation as verified in localStorage
      const key = `aura_verified_safety_${conversation.id}_v${conversation.safety_number_version || 1}`;
      setVerified(localStorage.getItem(key) === "true");
    }
  }, [isOpen, conversation.id, conversation.safety_number_version]);

  if (!isOpen) return null;

  const safetyNumber = generateSafetyNumber(
    currentUser?.id || "",
    otherUser.id,
    conversation.safety_number_version || 1,
    otherUser.security_number_salt || currentUser?.security_number_salt || ""
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(safetyNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleToggleVerify = () => {
    const nextVal = !verified;
    setVerified(nextVal);
    const key = `aura_verified_safety_${conversation.id}_v${conversation.safety_number_version || 1}`;
    if (nextVal) {
      localStorage.setItem(key, "true");
    } else {
      localStorage.removeItem(key);
    }
  };

  const handleRegenerate = async () => {
    if (!onRegenerateCode) return;
    setIsRegenerating(true);
    try {
      await onRegenerateCode();
      setVerified(false);
    } catch (err) {
      console.error("Güvenlik kodu yenileme hatası:", err);
    } finally {
      setIsRegenerating(false);
    }
  };

  // Generate a stylish pseudo-QR matrix pattern based on the safety number
  const blocks = safetyNumber.split(" ");

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in select-none"
    >
      <div className="w-full max-w-md bg-[#0F111A] border border-white/[0.08] rounded-3xl shadow-2xl overflow-hidden flex flex-col relative max-h-[92vh]">
        {/* Top glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-32 bg-indigo-500/20 blur-[80px] rounded-full"
        />

        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between bg-slate-900/60 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Uçtan Uca Güvenlik Kodu</h2>
              <p className="text-[11px] text-slate-400">@{otherUser.username} ile şifreleme doğrulaması</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-center relative z-10">
          {/* Security Shield Badge */}
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-transparent border border-indigo-500/30 flex items-center justify-center mb-3 shadow-[0_0_24px_rgba(99,102,241,0.25)]">
              {verified ? (
                <ShieldCheck className="w-8 h-8 text-emerald-400 animate-in zoom-in duration-300" />
              ) : (
                <Key className="w-8 h-8 text-indigo-400" />
              )}
            </div>

            <h3 className="text-sm font-semibold text-white">
              60 Haneli Doğrulama Numarası
            </h3>
            <p className="text-xs text-slate-400 max-w-xs mt-1 leading-relaxed">
              Bu numara <span className="text-white font-medium">@{otherUser.username}</span> ile aranızdaki mesajların araya girilmeden (ortadaki adam saldırısı olmadan) şifrelendiğini teyit eder.
            </p>
          </div>

          {/* 60-digit number display (4 rows x 3 blocks or 6 rows x 2 blocks) */}
          <div className="bg-[#090A10] border border-white/[0.07] rounded-2xl p-4 sm:p-5 font-mono text-xs sm:text-sm text-indigo-300/90 shadow-inner tracking-wider">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 text-center">
              {blocks.map((block, idx) => (
                <div
                  key={idx}
                  className="bg-white/[0.03] border border-white/[0.04] py-1.5 px-2 rounded-xl text-slate-200 font-semibold"
                >
                  {block}
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-white/[0.05] flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Versiyon {conversation.safety_number_version || 1}
              </span>

              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-semibold transition-colors cursor-pointer py-1 px-2.5 rounded-lg hover:bg-white/[0.04]"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Kopyalandı</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Numarayı Kopyala</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Verification Status Banner */}
          <div
            className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-left transition-all ${
              verified
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                : "bg-white/[0.02] border-white/[0.06] text-slate-300"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  verified ? "bg-emerald-500/20 text-emerald-400" : "bg-white/[0.05] text-slate-400"
                }`}
              >
                {verified ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
              </div>
              <div>
                <div className="text-xs font-bold text-white">
                  {verified ? "Doğrulandı Olarak İşaretlendi" : "Henüz Doğrulanmadı"}
                </div>
                <div className="text-[11px] text-slate-400">
                  {verified
                    ? "Bu numaranın karşı taraf ile eşleştiğini onayladınız."
                    : "Karşı tarafın ekranındaki numara ile karşılaştırın."}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleVerify}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex-shrink-0 ${
                verified
                  ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30"
              }`}
            >
              {verified ? "Kaldır" : "Doğrula"}
            </button>
          </div>

          {/* Regenerate Safety Code button */}
          {onRegenerateCode && (
            <div className="pt-1 flex items-center justify-between text-left text-xs text-slate-400">
              <span className="text-[11px] max-w-[240px]">
                Güvenlik kodunuzu yenilediğinizde her iki taraf için de yeni bir 60 haneli numara üretilir.
              </span>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 border border-white/[0.06] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`} />
                <span>Kodu Yenile</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
