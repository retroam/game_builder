/**
 * Background generation utilities.
 * Deterministic, no network calls. Uses simple seeded noise + vector ops.
 */
import { createPixelCanvas, clamp, lerp } from "./canvas.js";

function hashString(str) {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hexToRgbObj(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16),
    g = parseInt(h.slice(2, 4), 16),
    b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}
function rgbToHex(r, g, b) {
  const to2 = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return "#" + to2(r) + to2(g) + to2(b);
}
function mixHex(a, b, t) {
  const A = hexToRgbObj(a),
    B = hexToRgbObj(b);
  return rgbToHex(Math.round(lerp(A.r, B.r, t)), Math.round(lerp(A.g, B.g, t)), Math.round(lerp(A.b, B.b, t)));
}
function shadeHex(hex, amt) {
  // amt -1..1
  const c = hexToRgbObj(hex);
  const target = amt > 0 ? 255 : 0;
  const t = Math.abs(amt);
  return rgbToHex(Math.round(lerp(c.r, target, t)), Math.round(lerp(c.g, target, t)), Math.round(lerp(c.b, target, t)));
}
function addGrain(ctx, w, h, rng, strength = 12) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const npx = w * h;
  for (let i = 0; i < npx; i++) {
    const j = i * 4;
    const n = Math.floor((rng() * 2 - 1) * strength);
    d[j] = clamp(d[j] + n, 0, 255);
    d[j + 1] = clamp(d[j + 1] + n, 0, 255);
    d[j + 2] = clamp(d[j + 2] + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Generate a deterministic background image from a short description.
 * Returns an offscreen canvas (pixel-perfect, no smoothing).
 */
export function backgroundFromText(w, h, desc) {
  const d = (desc || "").toLowerCase();
  const seed = hashString(d);
  const rng = mulberry32(seed);
  const has = (s) => d.includes(s);

  // Choose theme
  let theme = "abstract";
  if (has("space") || has("stars") || has("galaxy") || has("night")) theme = "space";
  else if (has("mountain") || has("peak") || has("alps")) theme = "mountains";
  else if (has("ocean") || has("sea") || has("water")) theme = "ocean";
  else if (has("desert") || has("sand") || has("dune")) theme = "desert";
  else if (has("city") || has("urban") || has("skyline")) theme = "city";
  else if (has("sunset") || has("sunrise") || has("dusk")) theme = "sunset";

  const c = createPixelCanvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;

  const gradient = (top, bottom) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };

  if (theme === "space") {
    gradient("#0b1020", "#010306");
    // subtle nebula
    if (rng() < 0.5) {
      const cx = Math.floor(rng() * w),
        cy = Math.floor(rng() * h),
        r = Math.max(8, Math.floor((rng() * Math.min(w, h)) / 2));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, "rgba(88,28,135,0.25)");
      g.addColorStop(1, "rgba(3,7,18,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // stars
    const count = Math.floor(w * h * 0.08);
    for (let i = 0; i < count; i++) {
      const x = Math.floor(rng() * w),
        y = Math.floor(rng() * h);
      const b = 200 + Math.floor(rng() * 55);
      ctx.fillStyle = `rgb(${b},${b},${b})`;
      ctx.fillRect(x, y, 1, 1);
      if (rng() < 0.06) {
        ctx.fillRect(x + 1, y, 1, 1);
      }
    }
  } else if (theme === "mountains") {
    const isSunset = has("sunset") || has("dusk") || has("sunrise");
    gradient(isSunset ? "#f97316" : "#93c5fd", isSunset ? "#7c3aed" : "#1e3a8a");
    const layers = 3;
    for (let L = 0; L < layers; L++) {
      const yBase = Math.floor(h * 0.5 + L * (h * 0.12));
      const rough = Math.floor(h * 0.08 + L * 2);
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, yBase);
      let x = 0,
        y = yBase;
      while (x < w) {
        x += 3 + Math.floor(rng() * 6);
        y = yBase + Math.floor((rng() * 2 - 1) * rough);
        ctx.lineTo(Math.min(x, w), clamp(y, Math.floor(h * 0.3), h - 1));
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      const base = ["#475569", "#334155", "#1f2937"][L] || "#334155";
      ctx.fillStyle = shadeHex(base, -L * 0.1);
      ctx.fill();
    }
    addGrain(ctx, w, h, rng, 8);
  } else if (theme === "ocean") {
    gradient("#93c5fd", "#1e3a8a"); // sky
    // water
    const waterTop = Math.floor(h * 0.55);
    const g2 = ctx.createLinearGradient(0, waterTop, 0, h);
    g2.addColorStop(0, "#0ea5e9");
    g2.addColorStop(1, "#075985");
    ctx.fillStyle = g2;
    ctx.fillRect(0, waterTop, w, h - waterTop);
    // waves
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let y = waterTop + 2; y < h; y += 3) {
      ctx.beginPath();
      for (let x = 0; x <= w; x++) {
        const k = 6 + rng() * 6;
        const amp = 1 + rng() * 1.5;
        const yy = y + Math.sin(x / k + y * 0.05) * amp;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    addGrain(ctx, w, h, rng, 6);
  } else if (theme === "desert") {
    gradient("#fde68a", "#fbbf24");
    // dunes
    for (let L = 0; L < 3; L++) {
      const yBase = Math.floor(h * 0.55 + L * (h * 0.12));
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, yBase);
      for (let x = 0; x <= w; x++) {
        const k = 10 + rng() * 10;
        const amp = 3 + rng() * 4;
        const yy = yBase + Math.sin(x / k + L * 0.6) * amp;
        ctx.lineTo(x, clamp(yy, 0, h));
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = ["#f59e0b", "#d97706", "#b45309"][L] || "#d97706";
      ctx.fill();
    }
    addGrain(ctx, w, h, rng, 8);
  } else if (theme === "city") {
    gradient("#93c5fd", "#1e293b");
    // skyline
    const ground = Math.floor(h * 0.75);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, ground, w, h - ground);
    let x = 0;
    while (x < w) {
      const bw = 3 + Math.floor(rng() * 6);
      const bh = 6 + Math.floor(rng() * (h * 0.5));
      ctx.fillStyle = "#111827";
      ctx.fillRect(x, ground - bh, bw, bh);
      // windows
      for (let yy = ground - bh + 2; yy < ground - 2; yy += 3) {
        for (let xx = x + 1; xx < x + bw - 1; xx += 2) {
          if (rng() < 0.25) {
            ctx.fillStyle = rng() < 0.1 ? "#facc15" : "#e5e7eb";
            ctx.fillRect(xx, yy, 1, 1);
          }
        }
      }
      x += bw + (rng() < 0.1 ? 2 : 1);
    }
    addGrain(ctx, w, h, rng, 7);
  } else if (theme === "sunset") {
    gradient("#f97316", "#7c3aed");
    // sun
    const cx = Math.floor(w * 0.7),
      cy = Math.floor(h * 0.6),
      r = Math.floor(Math.min(w, h) * 0.18);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    addGrain(ctx, w, h, rng, 6);
  } else {
    // abstract gradient
    const palettes = [
      ["#06b6d4", "#3b82f6"],
      ["#f472b6", "#8b5cf6"],
      ["#22c55e", "#0ea5e9"],
      ["#f59e0b", "#ef4444"],
    ];
    const pair = palettes[Math.floor(rng() * palettes.length)];
    gradient(pair[0], pair[1]);
    addGrain(ctx, w, h, rng, 10);
  }

  return c;
}
