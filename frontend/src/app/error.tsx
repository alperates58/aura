"use client";

import { useEffect } from "react";
import { getLoginUrl } from "@/lib/api";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Aura Client Error:", error);
  }, [error]);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#090A0F] text-white p-6 select-none">
      <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 text-2xl font-bold">
        ⚠️
      </div>
      <h2 className="text-xl font-bold mb-2 text-center">Aura Arayüzü Yüklenirken Bir Sorun Oluştu</h2>
      <p className="text-xs text-slate-400 max-w-md text-center mb-4 break-words font-mono bg-slate-900/80 p-3 rounded-xl border border-slate-800">
        {error?.message || "Beklenmeyen bir istemci istisnası meydana geldi."}
      </p>
      {error?.digest && (
        <p className="text-[10px] font-mono text-slate-500 mb-6 bg-slate-950 px-3 py-1 rounded border border-slate-800">
          Digest: {error.digest}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => reset()}
          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-lg cursor-pointer"
        >
          Yeniden Dene
        </button>
        <button
          onClick={() => {
            try {
              localStorage.clear();
              sessionStorage.clear();
            } catch (_) {}
            window.location.replace(getLoginUrl());
          }}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
        >
          Önbelleği Temizle ve Girişe Dön
        </button>
      </div>
    </div>
  );
}
