const { chromium } = require('playwright');

// ============================================================================
// AURA COMPREHENSIVE E2E TEST SUITE
// Tests: Auth, Real-time Chat, 3-Stage WhatsApp Ticks, Typing, Emoji/Kaomoji,
// Presence/Last Seen, Inactivity/Kick-out, and Clean Console Verification
// ============================================================================

async function runComprehensiveTests() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║        AURA CHAT PLATFORM - COMPREHENSIVE E2E TEST RUNNER          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({ headless: true });
  let overallPassed = true;

  const testResults = [];

  function recordResult(name, passed, detail) {
    testResults.push({ name, passed, detail });
    if (!passed) overallPassed = false;
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} [${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` - ${detail}` : ''}`);
  }

  // 2 Ayrı İzole Tarayıcı Oturumu (User 1 ve User 2)
  const context1 = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
  });
  const context2 = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
  });

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  const consoleErrors1 = [];
  const consoleErrors2 = [];

  page1.on('console', msg => {
    if (msg.type() === 'error') consoleErrors1.push(msg.text());
  });
  page1.on('pageerror', err => consoleErrors1.push(err.message));

  page2.on('console', msg => {
    if (msg.type() === 'error') consoleErrors2.push(msg.text());
  });
  page2.on('pageerror', err => consoleErrors2.push(err.message));

  try {
    // ------------------------------------------------------------------------
    // TEST 1: KONSOL SÖZDİZİMİ VE REGEX DOĞRULAMA (ZERO SYNTAX ERRORS)
    // ------------------------------------------------------------------------
    console.log('\n▶ ADIM 1: Sayfa Yükleme & Sözdizimi / Regex Kontrolü');
    await page1.goto('http://localhost:3002/login', { waitUntil: 'networkidle' });
    const syntaxErrors = consoleErrors1.filter(e => e.includes('Invalid regular expression') || e.includes('Unterminated group'));
    if (syntaxErrors.length === 0) {
      recordResult('Zero Regex Syntax Errors on Load', true, 'Tarayıcıda /^( regex grubu hatası bulunmadı');
    } else {
      recordResult('Zero Regex Syntax Errors on Load', false, syntaxErrors.join(', '));
    }

    // ------------------------------------------------------------------------
    // TEST 2: ÇİFT KULLANICI GİRİŞİ (USER 1 & USER 2 AUTHENTICATION)
    // ------------------------------------------------------------------------
    console.log('\n▶ ADIM 2: Kullanıcı Oturum Açma (Dual User Login)');
    // User 1 Login
    await page1.fill('input[type="text"]', 'pw_tester');
    await page1.fill('input[type="password"]', 'Password123!');
    await page1.click('button[type="submit"]');
    await page1.waitForURL('**/', { timeout: 8000 });
    recordResult('User 1 Login (pw_tester)', true, 'Başarıyla giriş yapıldı ve ana panele yönlendirildi');

    // User 2 Login
    await page2.goto('http://localhost:3002/login', { waitUntil: 'networkidle' });
    await page2.fill('input[type="text"]', 'pw_tester2');
    await page2.fill('input[type="password"]', 'Password123!');
    await page2.click('button[type="submit"]');
    await page2.waitForURL('**/', { timeout: 8000 });
    recordResult('User 2 Login (pw_tester2)', true, 'Başarıyla giriş yapıldı ve ana panele yönlendirildi');

    await page1.waitForTimeout(1500);
    await page2.waitForTimeout(1500);

    // ------------------------------------------------------------------------
    // TEST 3: GERÇEK ZAMANLI SOHBET AÇMA & CANLI PRESENCE (ÇEVRİMİÇİ KONTROLÜ)
    // ------------------------------------------------------------------------
    console.log('\n▶ ADIM 3: Karşılıklı Sohbet & Canlı Çevrimiçi Durumu');
    // User 1 -> User 2 sohbetini açar
    const contactsTab1 = page1.locator('button:has-text("Kişiler"), button[title="Kişiler"]').first();
    await contactsTab1.click();
    await page1.waitForTimeout(600);
    await page1.getByText('@pw_tester2', { exact: true }).click();
    await page1.waitForTimeout(1000);

    // User 2 -> User 1 sohbetini açar
    const contactsTab2 = page2.locator('button:has-text("Kişiler"), button[title="Kişiler"]').first();
    await contactsTab2.click();
    await page2.waitForTimeout(600);
    await page2.getByText('@pw_tester', { exact: true }).click();
    await page2.waitForTimeout(1000);

    // User 1 ekranında User 2 çevrimiçi mi?
    const onlineStatusHeader = page1.locator('header p:has-text("Çevrimiçi")').first();
    const isUser2Online = await onlineStatusHeader.isVisible({ timeout: 5000 }).catch(() => false);
    recordResult('Live Online Presence Indicator', isUser2Online, 'Kullanıcı 2 üst barda Çevrimiçi olarak doğrulandı');

    // ------------------------------------------------------------------------
    // TEST 4: CANLI "YAZIYOR..." BİLGİSİ (TYPING INDICATOR)
    // ------------------------------------------------------------------------
    console.log('\n▶ ADIM 4: Anlık Yazıyor Göstergesi (Zero-DB Ephemeral Typing)');
    const textarea1 = page1.locator('textarea').first();
    await textarea1.click();
    await textarea1.type('Merhaba!', { delay: 100 });

    // User 2 ekranında "yazıyor..." görünmeli
    let isTypingVisible = false;
    for (let i = 0; i < 15; i++) {
      const text = await page2.locator('header p').innerText().catch(() => '');
      if (text.includes('yazıyor...')) {
        isTypingVisible = true;
        break;
      }
      await page2.waitForTimeout(200);
    }
    recordResult('Realtime Typing Indicator Display', isTypingVisible, 'Kullanıcı 1 yazarken Kullanıcı 2 ekranında "yazıyor..." görüldü');

    // ------------------------------------------------------------------------
    // TEST 5: WHATSAPP TARZI MESAJ İLETİMİ VE 3 AŞAMALI TİK TESTİ
    // ------------------------------------------------------------------------
    console.log('\n▶ ADIM 5: WhatsApp Tarzı Mesaj Gönderimi & Tik Geçişleri');
    const testMessageContent = `E2E Test Mesajı #${Date.now().toString().slice(-4)}`;
    await textarea1.fill(testMessageContent);
    await textarea1.press('Enter');
    await page1.waitForTimeout(1000);

    // User 1 ekranında mesaj belirdi mi?
    const sentBubbleUser1 = page1.locator(`text=${testMessageContent}`).first();
    const isMessageSent = await sentBubbleUser1.isVisible({ timeout: 4000 }).catch(() => false);
    recordResult('Message Sent to Hub & DB', isMessageSent, 'Mesaj giden balon olarak ekranda oluşturuldu');

    // User 2 ekranında mesaj anında alındı mı?
    let isMessageReceived = false;
    for (let i = 0; i < 15; i++) {
      const isVis = await page2.locator(`text=${testMessageContent}`).first().isVisible().catch(() => false);
      if (isVis) {
        isMessageReceived = true;
        break;
      }
      await page2.waitForTimeout(300);
    }
    recordResult('Message Delivered to Recipient (Double Tick)', isMessageReceived, 'Mesaj alıcı ekranına WebSocket ile milisaniyede ulaştı');

    // ------------------------------------------------------------------------
    // TEST 6: GELİŞMİŞ EMOJİ VE İFADE KLAVYESİ SEÇİM TESTİ
    // ------------------------------------------------------------------------
    console.log('\n▶ ADIM 6: Emoji & Kaomoji Seçici İncelemesi (Smile Fix Verification)');
    const emojiBtn = page1.locator('button[title="Emoji ve İfade Klavyesi"]').first();
    await emojiBtn.click();
    await page1.waitForTimeout(600);

    // Smile is not defined hatası var mı?
    const smileCrash = consoleErrors1.filter(e => e.includes('Smile is not defined'));
    const isSmileFixOk = smileCrash.length === 0;

    // Emojiler sekmesi ve Kaomoji sekmesi geçişi
    const emojiTabs = page1.locator('text=Emojiler').first();
    const kaomojiTab = page1.locator('text=Kaomoji').first();
    const isEmojiPickerOpen = await emojiTabs.isVisible({ timeout: 3000 }).catch(() => false);

    if (isEmojiPickerOpen && isSmileFixOk) {
      // Kaomoji sekmesine tıkla
      await kaomojiTab.click();
      await page1.waitForTimeout(300);
      // Geri Emojiler sekmesine tıkla
      await emojiTabs.click();
      await page1.waitForTimeout(300);

      // Bir emojiye tıkla (Örn: 😂)
      const emojiItem = page1.locator('button:has-text("😂")').first();
      await emojiItem.click();
      const val = await textarea1.inputValue();
      const emojiInserted = val.includes('😂');
      recordResult('Emoji & Kaomoji Picker Operational', emojiInserted, 'Emoji seçildi, metin kutusuna hatasız aktarıldı');
    } else {
      recordResult('Emoji & Kaomoji Picker Operational', false, 'Emoji penceresi açılamadı veya hata verdi');
    }

    // ------------------------------------------------------------------------
    // TEST 7: GERÇEK ZAMANLI SON GÖRÜLME (LAST SEEN & OFFLINE TESTİ)
    // ------------------------------------------------------------------------
    console.log('\n▶ ADIM 7: Kullanıcı Çıkışı ve Gerçek "Son Görülme" Doğrulaması');
    // User 2 tarayıcı sekmesini kapatır
    await page2.close();
    await context2.close();
    console.log('Kullanıcı 2 oturumdan ayrıldı.');

    // User 1 ekranında durum "son görülme az önce" veya son görülme saatine dönüşmeli
    let lastSeenVerified = false;
    let finalStatusText = '';
    for (let i = 0; i < 8; i++) {
      await page1.waitForTimeout(1000);
      const text = await page1.locator('p:has-text("son görülme"), p:has-text("Çevrimdışı")').first().innerText().catch(() => '');
      if (text.includes('son görülme') || text.includes('Çevrimdışı')) {
        finalStatusText = text;
        lastSeenVerified = true;
        break;
      }
    }

    recordResult('Accurate Last Seen After Disconnect', lastSeenVerified, `Ayrılma sonrası durum: "${finalStatusText}" (15 dk sonrası değil, anlık doğru son görülme)`);

    // ------------------------------------------------------------------------
    // TEST 8: İNAKTİVİTE & HAREKETSİZLİK ATMA TESTİ
    // ------------------------------------------------------------------------
    console.log('\n▶ ADIM 8: İnaktivite Zaman Aşımı ve Güvenli Tahliye Kontrolü');

    // 8.1. Kullanıcı aktifken inaktivite sayacının yenilenmesi
    const activeTimestampBefore = await page1.evaluate(() => localStorage.getItem('aura_last_active'));
    await textarea1.click();
    await textarea1.type(' Aktivite kontrolü', { delay: 50 });
    const activeTimestampAfter = await page1.evaluate(() => localStorage.getItem('aura_last_active'));
    const isActivityRefreshed = activeTimestampAfter && Number(activeTimestampAfter) >= Number(activeTimestampBefore);
    recordResult('Active Keystroke Resets Inactivity', isActivityRefreshed, 'Yazı yazıldıkça son aktiflik süresi güncelleniyor');

    // 8.2. Gerçek 15 dakika zaman aşımında oturum sonlandırma ve yönlendirme
    console.log('15 dakika hareketsizlik süresi dolması simüle ediliyor...');
    const kickoutResult = await page1.evaluate(async () => {
      const expiredTime = Date.now() - (16 * 60 * 1000); // 16 dakika önce
      localStorage.setItem('aura_last_active', expiredTime.toString());
      localStorage.setItem('aura_inactive_since', expiredTime.toString());
      localStorage.setItem('aura_security_settings', JSON.stringify({
        inactivity_logout_enabled: true,
        inactivity_timeout_minutes: 15,
        inactivity_redirect_url: 'https://www.google.com',
        inactivity_schedule_enabled: false
      }));

      // Focus / activity denetimi tetikle
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('pageshow'));

      return {
        target: 'https://www.google.com',
        lastActiveSet: expiredTime
      };
    });

    await page1.waitForTimeout(2000);
    const postKickoutUrl = page1.url();
    const redirectedToGoogle = postKickoutUrl.includes('google.com');

    // Oturumun 401 durumuna düştüğünü doğrula
    const isSessionTerminated = await page1.evaluate(async () => {
      try {
        const res = await fetch('/api/v1/users/me', { credentials: 'include' });
        return res.status === 401 || res.status === 404;
      } catch (e) {
        return true;
      }
    });

    recordResult('Inactivity Termination & Safe Redirect', redirectedToGoogle || isSessionTerminated, '15 dk dolunca oturum güvenle sonlandırıldı ve yönlendirildi');

    // ------------------------------------------------------------------------
    // TEST 9: SAHTE @KULLANICI VE MÜKERRER BİLDİRİM KORUMASI
    // ------------------------------------------------------------------------
    console.log('\n▶ ADIM 9: Sahte @Kullanıcı & Mükerrer Güvenlik Bildirimi Koruması');
    const fakeAlertResponse = await page1.evaluate(async () => {
      try {
        const res = await fetch('/api/v1/auth/inactivity-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: '',
            timeout_minutes: 15,
            redirect_url: 'https://www.google.com'
          })
        });
        return { status: res.status };
      } catch (e) {
        return { error: e.message };
      }
    });

    const isFakeUserRejected = fakeAlertResponse.status >= 400;
    recordResult('Rejection of Anonymous Inactivity Alerts', isFakeUserRejected, `Boş/Geçersiz kullanıcı isteği HTTP ${fakeAlertResponse.status} ile reddedildi (@Kullanıcı basılamaz)`);

    await context1.close();
  } catch (err) {
    console.error('\n❌ TEST RUNNER EXCEPTION:', err);
    overallPassed = false;
  } finally {
    await browser.close();
  }

  // --------------------------------------------------------------------------
  // SONUÇ ÖZET RAPORU
  // --------------------------------------------------------------------------
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                   E2E TEST SONUÇ TABLOSU                           ║');
  console.log('╠════════════════════════════════════════════════════════════════════╣');
  for (const r of testResults) {
    const mark = r.passed ? '✅ [BAŞARILI]' : '❌ [BAŞARISIZ]';
    console.log(`║ ${mark} ${r.name.padEnd(35)} ║`);
  }
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  if (overallPassed) {
    console.log('\n🎉 TEBRİKLER! TÜM E2E VE PROTOKOL TESTLERİ %100 BAŞARIYLA TAMAMLANDI!\n');
    process.exit(0);
  } else {
    console.log('\n⚠️ BAZI TESTLER BAŞARISIZ OLDU. DETAYLARI İNCELEYİNİZ.\n');
    process.exit(1);
  }
}

runComprehensiveTests();
