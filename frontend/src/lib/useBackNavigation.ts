"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface BackNavigationOptions {
  activeConversationId: string | null;
  onCloseChat: () => void;
  // Overlays & Modals in descending priority order
  previewMedia: any;
  onClosePreviewMedia: () => void;
  showContactDrawer: boolean;
  onCloseContactDrawer: () => void;
  isChatSearchOpen: boolean;
  onCloseChatSearch: () => void;
  confirmCallType: any;
  onCloseConfirmCallType: () => void;
  showActiveDeleteConfirm: any;
  onCloseActiveDeleteConfirm: () => void;
  isSettingsOpen: boolean;
  onCloseSettings: () => void;
  isAdminPanelOpen: boolean;
  onCloseAdminPanel: () => void;
  selectedMessageInfo: any;
  onCloseMessageInfo: () => void;
  isStoryViewerOpen: boolean;
  onCloseStoryViewer: () => void;
  isStoryCreatorOpen: boolean;
  onCloseStoryCreator: () => void;
}

export function useBackNavigation(options: BackNavigationOptions) {
  const [showExitToast, setShowExitToast] = useState(false);
  const optionsRef = useRef(options);
  const lastExitPressRef = useRef<number>(0);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Güncel opsiyonları ref'te anında senkron sakla
  optionsRef.current = options;

  // Aktif sohbet açıldığında veya değiştiğinde çıkış toast'unu anında sıfırla
  useEffect(() => {
    if (options.activeConversationId) {
      setShowExitToast(false);
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
    }
  }, [options.activeConversationId]);

  // UI Geri Butonları İçin Fonksiyon (WhatsApp standardı: Saf React state geçişi, router reload yok)
  const handleBackToChatList = useCallback(() => {
    optionsRef.current.onCloseChat();
  }, []);

  // Android Donanım Geri Tuşu (Sadece mobil tarayıcıda sekmeden kazara çıkmayı önlemek için)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Sadece mobil cihazlarda donanım tuşu yakalamak için tek bir dummy state tut
    const isMobile = window.innerWidth < 768;
    if (!isMobile) return;

    const handlePopState = () => {
      const opts = optionsRef.current;

      // 1. Açık modallar varsa önce onları kapat
      if (opts.previewMedia) {
        opts.onClosePreviewMedia();
        return;
      }
      if (opts.isStoryViewerOpen) {
        opts.onCloseStoryViewer();
        return;
      }
      if (opts.isStoryCreatorOpen) {
        opts.onCloseStoryCreator();
        return;
      }
      if (opts.selectedMessageInfo) {
        opts.onCloseMessageInfo();
        return;
      }
      if (opts.confirmCallType) {
        opts.onCloseConfirmCallType();
        return;
      }
      if (opts.showActiveDeleteConfirm) {
        opts.onCloseActiveDeleteConfirm();
        return;
      }
      if (opts.showContactDrawer) {
        opts.onCloseContactDrawer();
        return;
      }
      if (opts.isChatSearchOpen) {
        opts.onCloseChatSearch();
        return;
      }
      if (opts.isSettingsOpen) {
        opts.onCloseSettings();
        return;
      }
      if (opts.isAdminPanelOpen) {
        opts.onCloseAdminPanel();
        return;
      }

      // 2. Aktif sohbet açıksa sohbeti kapatıp listeye dön
      if (opts.activeConversationId) {
        setShowExitToast(false);
        opts.onCloseChat();
        return;
      }

      // 3. Ana listedeyken çift tıklama çıkış koruması
      const now = Date.now();
      if (now - lastExitPressRef.current < 2000) {
        window.history.back();
        return;
      }
      lastExitPressRef.current = now;
      setShowExitToast(true);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => {
        setShowExitToast(false);
      }, 2000);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  return {
    handleBackToChatList,
    showExitToast,
  };
}
