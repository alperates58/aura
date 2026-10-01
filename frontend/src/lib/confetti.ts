// confetti.ts - Sıfır harici paket bağımlılıklı, hafif ve 60fps temalı reaksiyon ve mesaj konfeti efekti

export const SPECIAL_CONFETTI_EMOJIS = [
  "❤️", "💖", "💕", "💓", "💗", "💘", "💝",
  "😘", "🥰", "😍", "💋",
  "🔥",
  "🎉", "🥳", "🎊",
  "🚀",
  "👏", "🙌",
  "⭐", "✨", "🌟",
  "💯",
  "💎",
];

export function isSpecialConfettiEmoji(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (SPECIAL_CONFETTI_EMOJIS.includes(trimmed)) return true;
  // Aynı emojinin tekrarı mı? (Örn: ❤️❤️❤️ veya 🔥🔥)
  const regex = new RegExp(`^(?:${SPECIAL_CONFETTI_EMOJIS.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})+$`, "u");
  return regex.test(trimmed) && Array.from(trimmed).length <= 4;
}

export function getPrimaryConfettiEmoji(text: string): string {
  const trimmed = text.trim();
  for (const e of SPECIAL_CONFETTI_EMOJIS) {
    if (trimmed.includes(e)) return e;
  }
  return "❤️";
}

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  scale: number;
  rotation: number;
  rotationSpeed: number;
  color?: string;
  emoji?: string;
  swaySpeed?: number;
  swayOffset?: number;
}

export function triggerReactionConfetti(emoji: string, clientX?: number, clientY?: number) {
  if (typeof window === "undefined") return;

  // Reduced motion kontrolü
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "99999";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    document.body.removeChild(canvas);
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const startX = clientX ?? window.innerWidth / 2;
  const startY = clientY ?? (window.innerHeight * 0.55);

  // Kategoriye özel renk paleti ve tamamlayıcı emojiler
  const isHeartLove = ["❤️", "💖", "💕", "💓", "💗", "💘", "💝", "😘", "🥰", "😍", "💋"].includes(emoji);
  const isFire = emoji === "🔥";
  const isParty = ["🎉", "🥳", "🎊"].includes(emoji);
  const isRocket = emoji === "🚀";
  const isStarGem = ["⭐", "✨", "🌟", "💎"].includes(emoji);
  const isHundred = emoji === "💯";
  const isClap = ["👏", "🙌"].includes(emoji);

  let themeColors = ["#ec4899", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
  let themeEmojiPool = [emoji];

  if (isHeartLove) {
    themeColors = ["#ff1493", "#ff69b4", "#ff4081", "#e91e63", "#f43f5e", "#fb7185", "#fda4af"];
    themeEmojiPool = emoji === "😘" ? ["😘", "💋", "❤️", "💕"] : [emoji, "❤️", "💖", "💕", "✨"];
  } else if (isFire) {
    themeColors = ["#ff4500", "#ff6347", "#ff8c00", "#ffa500", "#ffd700", "#ef4444"];
    themeEmojiPool = ["🔥", "💥", "✨"];
  } else if (isParty) {
    themeColors = ["#ec4899", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"];
    themeEmojiPool = ["🎉", "🥳", "🎊", "✨"];
  } else if (isRocket) {
    themeColors = ["#3b82f6", "#60a5fa", "#f59e0b", "#ef4444", "#ffffff"];
    themeEmojiPool = ["🚀", "✨", "⭐", "🔥"];
  } else if (isStarGem) {
    themeColors = ["#fbbf24", "#f59e0b", "#38bdf8", "#67e8f9", "#ffffff", "#a855f7"];
    themeEmojiPool = ["⭐", "✨", "💎", "🌟"];
  } else if (isHundred) {
    themeColors = ["#ef4444", "#dc2626", "#ffd700", "#f59e0b"];
    themeEmojiPool = ["💯", "🔥", "✨"];
  } else if (isClap) {
    themeColors = ["#10b981", "#3b82f6", "#ec4899", "#f59e0b"];
    themeEmojiPool = ["👏", "🙌", "✨", "🎉"];
  }

  const particles: ConfettiParticle[] = [];
  const particleCount = isHeartLove ? 34 : 32;

  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.8;
    const speed = isHeartLove ? 2.5 + Math.random() * 5 : 3.5 + Math.random() * 6.5;
    const isEmojiParticle = i % 3 === 0;

    let vy = Math.sin(angle) * speed;
    let vx = Math.cos(angle) * speed;

    // Aşk ve kalp emojileri yukarı doğru nazikçe süzülsün
    if (isHeartLove) {
      vy = -Math.abs(vy) - 2.0 - Math.random() * 2.5;
      vx = (Math.random() - 0.5) * 4;
    } else if (isFire) {
      vy = -Math.abs(vy) - 3.0 - Math.random() * 3;
      vx = (Math.random() - 0.5) * 3.5;
    } else if (isRocket) {
      vy = -Math.abs(vy) - 4.5 - Math.random() * 4;
      vx = (Math.random() - 0.3) * 5;
    }

    const assignedEmoji = isEmojiParticle
      ? themeEmojiPool[Math.floor(Math.random() * themeEmojiPool.length)]
      : undefined;

    particles.push({
      x: startX + (Math.random() - 0.5) * 20,
      y: startY + (Math.random() - 0.5) * 20,
      vx,
      vy,
      alpha: 1,
      scale: isEmojiParticle ? (isHeartLove ? 22 + Math.random() * 10 : 18 + Math.random() * 8) : 4 + Math.random() * 4,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.15,
      color: themeColors[Math.floor(Math.random() * themeColors.length)],
      emoji: assignedEmoji,
      swaySpeed: 0.05 + Math.random() * 0.05,
      swayOffset: Math.random() * Math.PI * 2,
    });
  }

  const startTime = performance.now();
  const maxDuration = isHeartLove ? 1400 : 1100; // ms

  function animate(now: number) {
    const elapsed = now - startTime;
    if (elapsed > maxDuration) {
      if (canvas.parentNode) {
        document.body.removeChild(canvas);
      }
      return;
    }

    ctx?.clearRect(0, 0, window.innerWidth, window.innerHeight);

    particles.forEach((p, idx) => {
      p.x += p.vx;
      p.y += p.vy;

      if (isHeartLove) {
        // Kalpler hafifçe sağa sola salınarak yukarı süzülür
        p.x += Math.sin((elapsed * 0.005) + (p.swayOffset || 0)) * 0.8;
        p.vy *= 0.98; // Nazik yavaşlama
        p.vx *= 0.98;
      } else if (isFire) {
        p.vy *= 0.97;
        p.vx *= 0.96;
      } else {
        p.vy += 0.18; // Normal yerçekimi
        p.vx *= 0.96;
      }

      p.rotation += p.rotationSpeed;
      p.alpha = Math.max(0, 1 - (elapsed / maxDuration) * 1.05);

      if (!ctx) return;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      if (p.emoji) {
        ctx.font = `${p.scale}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.emoji, 0, 0);
      } else if (p.color) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.scale, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}
