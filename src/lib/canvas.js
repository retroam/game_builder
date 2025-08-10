/**
 * Canvas utilities for the Sprite Studio editor.
 * Pure functions only. No React imports here.
 */

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export function createPixelCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return c;
}

export function drawCheckers(ctx, x, y, w, h, size = 8) {
  // Transparent background checkerboard
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const cols = Math.ceil(w / size),
    rows = Math.ceil(h / size);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const odd = (r + c) % 2 === 1;
      ctx.fillStyle = odd ? "#ddd" : "#f3f3f3";
      ctx.fillRect(x + c * size, y + r * size, size, size);
    }
  }
  ctx.restore();
}

export function hexToRgba(hex) {
  // #rgb, #rrggbb, #rrggbbaa
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
  let a = 255;
  if (h.length === 8) {
    a = parseInt(h.slice(6, 8), 16);
    h = h.slice(0, 6);
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b, a];
}

export function rgbaEq(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export function floodFill(canvas, x, y, targetColor, replacementColor) {
  const w = canvas.width,
    h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const ix = (x + y * w) * 4;
  const start = [data[ix], data[ix + 1], data[ix + 2], data[ix + 3]];
  if (rgbaEq(start, replacementColor)) return; // No-op
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const i = (cx + cy * w) * 4;
    if (
      data[i] === targetColor[0] &&
      data[i + 1] === targetColor[1] &&
      data[i + 2] === targetColor[2] &&
      data[i + 3] === targetColor[3]
    ) {
      data[i] = replacementColor[0];
      data[i + 1] = replacementColor[1];
      data[i + 2] = replacementColor[2];
      data[i + 3] = replacementColor[3];
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function drawLinePixel(ctx, x0, y0, x1, y1, color = "#000000", size = 1, erase = false) {
  ctx.save();
  if (erase) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = color;
  }
  // Bresenham
  let dx = Math.abs(x1 - x0),
    sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0),
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy,
    e2;
  let x = x0,
    y = y0;
  const s = clamp(size, 1, 64);
  while (true) {
    ctx.fillRect(x - Math.floor((s - 1) / 2), y - Math.floor((s - 1) / 2), s, s);
    if (x === x1 && y === y1) break;
    e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  ctx.restore();
}

// Nearest-neighbor draw helper for thumbnails/previews
export function nearestNeighborDraw(srcCanvas, destCanvasEl) {
  if (!srcCanvas || !destCanvasEl) return;
  const ctx = destCanvasEl.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, destCanvasEl.width, destCanvasEl.height);
  ctx.drawImage(
    srcCanvas,
    0, 0, srcCanvas.width, srcCanvas.height,
    0, 0, destCanvasEl.width, destCanvasEl.height
  );
}
