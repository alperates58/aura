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
  const isChatPushedRef = useRef(false);
  const lastExitPressRef = useRef<number>(0);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Güncel opsiyonları ref'te sakla (popstate dinleyicisinin re-attach olmadan en güncel state'i okuyabilmesi için)
  useEffect(() => {
    optionsRef.current = options;
  });

  // 1. Tarayıcı Kök ve Başlangıç Geçmiş Seviyesi (Basic Auth / Boş Sayfaya Düşmeyi Önler)
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (!window.history.state || window.history.state.aura !== "home") {
        window.history.replaceState({ aura: "root" }, "");
        window.history.pushState({ aura: "home" }, "");
      }
    } catch (e) {
      console.warn("History API erişim uyarısı:", e);
    }
  }, []);

  // 2. Aktif Sohbet Durumunu (activeConversationId) Tarayıcı Geçmişiyle Eşitle
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (options.activeConversationId) {
      if (!isChatPushedRef.current) {
        isChatPushedRef.current = true;
        window.history.pushState(
          { aura: "chat", convId: options.activeConversationId },
          ""
        );
      } else {
        window.history.replaceState(
          { aura: "chat", convId: options.activeConversationId },
          ""
        );
      }
    } else {
      if (isChatPushedRef.current) {
        isChatPushedRef.current = false;
        if (window.history.state?.aura === "chat") {
          window.history.back();
        }
      }
    }
  }, [options.activeConversationId]);

  // 3. Android Sistem Geri Tuşu & Tarayıcı Geri Olayını (popstate) Dinleme
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = (e: PopStateEvent) => {
      const opts = optionsRef.current;

      // Katman 1: Tam Ekran Medya Görüntüleyici (Lightbox)
      if (opts.previewMedia) {
        opts.onClosePreviewMedia();
        if (opts.activeConversationId) {
          window.history.pushState(
            { aura: "chat", convId: opts.activeConversationId },
            ""
          );
        } else {
          window.history.pushState({ aura: "home" }, "");
        }
        return;
      }

      // Katman 2: 24 Saatlik Hikaye İzleyici
      if (opts.isStoryViewerOpen) {
        opts.onCloseStoryViewer();
        if (opts.activeConversationId) {
          window.history.pushState(
            { aura: "chat", convId: opts.activeConversationId },
            ""
          );
        } else {
          window.history.pushState({ aura: "home" }, "");
        }
        return;
      }

      // Katman 3: Hikaye Oluşturucu Modalı
      if (opts.isStoryCreatorOpen) {
        opts.onCloseStoryCreator();
        if (opts.activeConversationId) {
          window.history.pushState(
            { aura: "chat", convId: opts.activeConversationId },
            ""
          );
        } else {
          window.history.pushState({ aura: "home" }, "");
        }
        return;
      }

      // Katman 4: WhatsApp Mesaj Bilgisi Modalı
      if (opts.selectedMessageInfo) {
        opts.onCloseMessageInfo();
        if (opts.activeConversationId) {
          window.history.pushState(
            { aura: "chat", convId: opts.activeConversationId },
            ""
          );
        } else {
          window.history.pushState({ aura: "home" }, "");
        }
        return;
      }

      // Katman 5: Arama Başlatma Onay Penceresi
      if (opts.confirmCallType) {
        opts.onCloseConfirmCallType();
        if (opts.activeConversationId) {
          window.history.pushState(
            { aura: "chat", convId: opts.activeConversationId },
            ""
          );
        } else {
          window.history.pushState({ aura: "home" }, "");
        }
        return;
      }

      // Katman 6: Aktif Sohbeti Sil / Temizle Onay Modalı
      if (opts.showActiveDeleteConfirm) {
        opts.onCloseActiveDeleteConfirm();
        if (opts.activeConversationId) {
          window.history.pushState(
            { aura: "chat", convId: opts.activeConversationId },
            ""
          );
        } else {
          window.history.pushState({ aura: "home" }, "");
        }
        return;
      }

      // Katman 7: Sağ Çekmece (Kişi Bilgisi & Medya Galerisi)
      if (opts.showContactDrawer) {
        opts.onCloseContactDrawer();
        if (opts.activeConversationId) {
          window.history.pushState(
            { aura: "chat", convId: opts.activeConversationId },
            ""
          );
        } else {
          window.history.pushState({ aura: "home" }, "");
        }
        return;
      }

      // Katman 8: Sohbet İçi Arama Çubuğu
      if (opts.isChatSearchOpen) {
        opts.onCloseChatSearch();
        if (opts.activeConversationId) {
          window.history.pushState(
            { aura: "chat", convId: opts.activeConversationId },
            ""
          );
        } else {
          window.history.pushState({ aura: "home" }, "");
        }
        return;
      }

      // Katman 9: Ayarlar ve Profil Modalı
      if (opts.isSettingsOpen) {
        opts.onCloseSettings();
        if (opts.activeConversationId) {
          window.history.pushState(
            { aura: "chat", convId: opts.activeConversationId },
            ""
          );
        } else {
          window.history.pushState({ aura: "home" }, "");
        }
        return;
      }

      // Katman 10: Aura Yönetim Paneli
      if (opts.isAdminPanelOpen) {
        opts.onCloseAdminPanel();
        if (opts.activeConversationId) {
          window.history.pushState(
            { aura: "chat", convId: opts.activeConversationId },
            ""
          );
        } else {
          window.history.pushState({ aura: "home" }, "");
        }
        return;
      }

      // Katman 11: AKTİF SOHBET EKRANI (Ana İstek)
      // Sohbet ekranındayken Android'in alt geri tuşuna basıldığında konuşma listesine dönülür.
      if (opts.activeConversationId) {
        if (!isChatPushedRef.current) {
          // Eğer UI'daki geri butonu zaten tetiklemişse mükerrer çalıştırma
          return;
        }
        isChatPushedRef.current = false;
        opts.onCloseChat();
        return;
      }

      // Katman 12: ANA SOHBET LİSTESİ EKRANI (Çift Tıklama Koruması)
      // Ana ekranda yanlışlıkla geri tuşuna basıp siteden atılmayı ve basic auth'a düşmeyi engeller.
      const now = Date.now();
      if (now - lastExitPressRef.current < 2000) {
        // Kullanıcı 2 saniye içinde ikinci kez geri bastıysa tarayıcı çıkışına izin ver
        window.history.back();
        return;
      }

      // İlk basışta geri yönlendirmeyi tut ve toast göster
      lastExitPressRef.current = now;
      window.history.pushState({ aura: "home" }, "");
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

  // UI Geri Butonları İçin Ortak Fonksiyon (Mobilde sol üstteki <-- Geri ikonu)
  const handleBackToChatList = useCallback(() => {
    if (isChatPushedRef.current) {
      isChatPushedRef.current = false;
      window.history.back();
      optionsRef.current.onCloseChat();
    } else {
      optionsRef.current.onCloseChat();
    }
  }, []);

  return {
    handleBackToChatList,
    showExitToast,
  };
}
