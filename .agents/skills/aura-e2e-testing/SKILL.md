---
name: aura-e2e-testing
description: >-
  Use this skill when writing, executing, or debugging End-to-End (E2E) automated tests
  with Playwright in the Aura chat platform, including multi-client presence, tick transitions, and inactivity behavior.
---

# Aura End-to-End (E2E) Testing Guide with Playwright

Aura requires automated multi-client testing to verify WebSocket delivery receipts, presence indicators, media playback, and inactivity timeouts across distinct users in isolated browser contexts.

## Prerequisites & Architecture
- **Frontend URL:** `http://localhost:3002` (Docker mapped port)
- **Backend API URL:** `http://localhost:8080` (Docker mapped port)
- **Playwright Setup:** Ran via Node.js scripts using `const { chromium } = require('playwright');`

---

## Key Test Scenarios & Patterns

### 1. Dual-User Realtime Presence & Chat Verification
To test live messaging or presence updates between two users, instantiate two separate browser contexts:

```javascript
const browser = await chromium.launch({ headless: true });
const context1 = await browser.newContext();
const context2 = await browser.newContext();

const page1 = await context1.newPage();
const page2 = await context2.newPage();

// User 1 logs in
await page1.goto('http://localhost:3002/login');
await page1.fill('input[type="text"]', 'user_a');
await page1.fill('input[type="password"]', 'Password123!');
await page1.click('button[type="submit"]');

// User 2 logs in
await page2.goto('http://localhost:3002/login');
await page2.fill('input[type="text"]', 'user_b');
await page2.fill('input[type="password"]', 'Password123!');
await page2.click('button[type="submit"]');
```

### 2. Presence & Last Seen Transitions
- Open a conversation between `user_a` and `user_b`.
- Verify header displays `"Çevrimiçi"`.
- Close `page2` (`await page2.close()`).
- Verify `page1` header transitions to `"son görülme az önce"` via WebSocket `presence_update`.

### 3. Inactivity Timeout & Safe Redirection
- When testing inactivity, manipulate `aura_last_active` and `aura_inactive_since` in `localStorage`:
```javascript
await page.evaluate(() => {
  const expiredTime = Date.now() - (16 * 60 * 1000); // 16 minutes ago
  localStorage.setItem('aura_last_active', expiredTime.toString());
  localStorage.setItem('aura_inactive_since', expiredTime.toString());
  window.dispatchEvent(new Event('focus'));
});
```
- Assert URL redirection to the target safe URL (e.g., `https://www.google.com`).
- Verify HTTP cookies are cleared and `/api/v1/users/me` returns `401 Unauthorized`.

---

## Verifying Zero Console Errors
Always listen for browser errors during test execution to catch regex issues, undefined components, or unhandled exceptions:

```javascript
page.on('console', msg => {
  if (msg.type() === 'error') console.error('Browser Error:', msg.text());
});
page.on('pageerror', err => {
  console.error('Uncaught Exception:', err.message);
});
```
