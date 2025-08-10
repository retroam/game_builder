import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  clamp,
  createPixelCanvas,
  drawCheckers,
  hexToRgba,
  floodFill,
  canvasToBlob,
  downloadBlob,
  nearestNeighborDraw,
  drawLinePixel,
} from "../../lib/canvas.js";
import { backgroundFromText } from "../../lib/background.js";
import { generateImageFromPrompt } from "../../lib/gptImage.js";

/**
 * CanvasEditor – Pixel editor with tools, onion skin, timeline, import/export.
 * This file is a direct extraction/refactor of the previous monolith,
 * now depending on lib/* pure helpers. Behavior is preserved.
 */

export default function CanvasEditor({ onCharacterExtract }) {
  // Sprite settings
  const [spriteW, setSpriteW] = useState(64);
  const [spriteH, setSpriteH] = useState(64);
  const [color, setColor] = useState("#3b82f6"); // Tailwind blue-500
  const [brush, setBrush] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(8); // scale factor (1..32)
  const [fps, setFps] = useState(8);
  const [onion, setOnion] = useState(false);

  // Character attributes (MVP): toggles
  const [attrJump, setAttrJump] = useState(true);
  const [attrSlide, setAttrSlide] = useState(false);
  const [attrPunch, setAttrPunch] = useState(false);

  // Tools
  const Tools = {
    Pencil: "pencil",
    Eraser: "eraser",
    Bucket: "bucket",
    Rect: "rect",
    Circle: "circle",
    Eyedrop: "eye",
    Hand: "hand",
  };
  const [tool, setTool] = useState(Tools.Pencil);

  // Canvas & view
  const viewRef = useRef(null); // display canvas
  const wrapRef = useRef(null); // container for size
  const [viewSize, setViewSize] = useState({ w: 800, h: 600 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpace, setIsSpace] = useState(false); // spacebar panning

  // Frames data (each frame is its own pixel canvas)
  const [frames, setFrames] = useState(() => [createPixelCanvas(spriteW, spriteH)]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  // History per frame
  const historyRef = useRef(new Map()); // frameIndex -> {stack: ImageData[], idx:number}

  // Shape preview
  const previewRef = useRef(null); // {x0,y0,x1,y1}

  // Pointer state
  const draggingRef = useRef(false);
  const lastPtRef = useRef({ x: 0, y: 0 });

  // ------------------------------ Resize observer for view ------------------------------
  useLayoutEffect(() => {
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setViewSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) });
      }
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Ensure frame canvases match sprite size
  useEffect(() => {
    setFrames((prev) =>
      prev.map((c) => {
        if (c.width === spriteW && c.height === spriteH) return c;
        // Resize with nearest neighbor
        const tmp = createPixelCanvas(spriteW, spriteH);
        const tctx = tmp.getContext("2d");
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(c, 0, 0, c.width, c.height, 0, 0, spriteW, spriteH);
        return tmp;
      })
    );
    // Reset history because dimensions changed
    historyRef.current = new Map();
  }, [spriteW, spriteH]);

  // Playback loop
  useEffect(() => {
    if (!playing) return;
    const interval = Math.max(1, Math.floor(1000 / fps));
    const id = setInterval(() => {
      setCurrent((i) => (i + 1) % frames.length);
      requestAnimationFrame(draw);
    }, interval);
    return () => clearInterval(id);
  }, [playing, fps, frames.length]);

  // Keyboard handlers
  useEffect(() => {
    function onKey(e) {
      if (e.repeat) return;
      if (e.code === "Space") {
        setIsSpace(e.type === "keydown");
      }
      // Shortcuts
      const mod = e.metaKey || e.ctrlKey;
      if (e.type === "keydown") {
        if (mod && e.key.toLowerCase() === "z") {
          e.shiftKey ? redo() : undo();
          e.preventDefault();
        }
        if (mod && e.key.toLowerCase() === "y") {
          redo();
          e.preventDefault();
        }
        if (e.key === "1") setTool(Tools.Pencil);
        if (e.key === "2") setTool(Tools.Eraser);
        if (e.key === "3") setTool(Tools.Bucket);
        if (e.key === "4") setTool(Tools.Rect);
        if (e.key === "5") setTool(Tools.Circle);
        if (e.key === "i" || e.key === "I") setTool(Tools.Eyedrop);
        if (e.key === "h" || e.key === "H") setTool(Tools.Hand);
        if (e.key === "g" || e.key === "G") setShowGrid((v) => !v);
        if (e.key === " ") setIsSpace(true);
      } else if (e.type === "keyup") {
        if (e.key === " ") setIsSpace(false);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  // ------------------------------ Drawing helpers ------------------------------
  const currCanvas = frames[current];

  function pushHistory() {
    // Snapshot current frame image for undo
    const key = current;
    const stackObj = historyRef.current.get(key) || { stack: [], idx: -1 };
    const ctx = currCanvas.getContext("2d");
    const snap = ctx.getImageData(0, 0, currCanvas.width, currCanvas.height);
    // If we undid previously, discard redo tail
    if (stackObj.idx < stackObj.stack.length - 1) {
      stackObj.stack = stackObj.stack.slice(0, stackObj.idx + 1);
    }
    stackObj.stack.push(snap);
    // Limit history size
    if (stackObj.stack.length > 50) stackObj.stack.shift();
    stackObj.idx = stackObj.stack.length - 1;
    historyRef.current.set(key, stackObj);
  }

  function undo() {
    const key = current;
    const h = historyRef.current.get(key);
    if (!h || h.idx <= 0) return;
    h.idx -= 1;
    const ctx = currCanvas.getContext("2d");
    ctx.putImageData(h.stack[h.idx], 0, 0);
    requestAnimationFrame(draw);
  }

  function redo() {
    const key = current;
    const h = historyRef.current.get(key);
    if (!h || h.idx >= h.stack.length - 1) return;
    h.idx += 1;
    const ctx = currCanvas.getContext("2d");
    ctx.putImageData(h.stack[h.idx], 0, 0);
    requestAnimationFrame(draw);
  }

  // Convert client -> sprite pixel coordinates
  function clientToPixel(e) {
    const rect = viewRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left - pan.x;
    const cy = e.clientY - rect.top - pan.y;
    const x = Math.floor(cx / zoom);
    const y = Math.floor(cy / zoom);
    return { x, y };
  }

  function draw() {
    const canvas = viewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { w, h } = viewSize;
    // ensure pixel ratio
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Work area background
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, w, h);

    // Canvas frame area
    const vw = spriteW * zoom;
    const vh = spriteH * zoom;
    const vx = pan.x;
    const vy = pan.y;
    drawCheckers(ctx, vx, vy, vw, vh, Math.max(8, zoom));

    // Onion skin (prev frame)
    if (onion && frames.length > 1) {
      const prev = frames[(current - 1 + frames.length) % frames.length];
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 0.35;
      ctx.drawImage(prev, 0, 0, prev.width, prev.height, vx, vy, vw, vh);
      ctx.globalAlpha = 1;
    }

    // Current frame
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(currCanvas, 0, 0, currCanvas.width, currCanvas.height, vx, vy, vw, vh);

    // Shape preview overlay
    const prev = previewRef.current;
    if (prev) {
      ctx.save();
      ctx.translate(vx, vy);
      ctx.scale(zoom, zoom);
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1 / zoom; // hairline
      ctx.fillStyle = "rgba(17,17,17,0.15)";
      const x = Math.min(prev.x0, prev.x1),
        y = Math.min(prev.y0, prev.y1);
      const w2 = Math.abs(prev.x1 - prev.x0) + 1,
        h2 = Math.abs(prev.y1 - prev.y0) + 1;
      if (tool === Tools.Rect) {
        ctx.fillRect(x, y, w2, h2);
        ctx.strokeRect(x + 0.5 / zoom, y + 0.5 / zoom, w2 - 1 / zoom, h2 - 1 / zoom);
      } else if (tool === Tools.Circle) {
        // draw ellipse approximated by circle within rect bounds
        const cx = x + w2 / 2,
          cy = y + h2 / 2;
        const rx = Math.max(0.5, w2 / 2),
          ry = Math.max(0.5, h2 / 2);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Grid overlay
    if (showGrid && zoom >= 4) {
      ctx.save();
      ctx.translate(vx, vy);
      ctx.beginPath();
      for (let x = 0; x <= spriteW; x++) {
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, spriteH * zoom);
      }
      for (let y = 0; y <= spriteH; y++) {
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(spriteW * zoom, y * zoom + 0.5);
      }
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Border
    ctx.strokeStyle = "#bbb";
    ctx.strokeRect(vx - 0.5, vy - 0.5, vw + 1, vh + 1);

    ctx.restore();
  }

  useEffect(() => {
    requestAnimationFrame(draw);
  }, [frames, current, viewSize, zoom, pan, showGrid, onion, tool]);

  // Center sprite and take initial history snapshot once on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setPan({
        x: Math.floor((viewSize.w - spriteW * zoom) / 2),
        y: Math.floor((viewSize.h - spriteH * zoom) / 2),
      });
      pushHistory();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------ Pointer interactions ------------------------------
  function beginStroke(e) {
    const handMode = tool === Tools.Hand || isSpace;
    if (handMode) {
      draggingRef.current = "pan";
      lastPtRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { x, y } = clientToPixel(e);
    if (x < 0 || y < 0 || x >= spriteW || y >= spriteH) return;

    pushHistory();
    draggingRef.current = true;
    lastPtRef.current = { x, y };
    const ctx = currCanvas.getContext("2d");

    if (tool === Tools.Pencil || tool === Tools.Eraser) {
      drawLinePixel(ctx, x, y, x, y, color, brush, tool === Tools.Eraser);
    } else if (tool === Tools.Bucket) {
      const target = getPixel(currCanvas, x, y);
      const repl = hexToRgba(color);
      floodFill(currCanvas, x, y, target, repl);
    } else if (tool === Tools.Rect || tool === Tools.Circle) {
      previewRef.current = { x0: x, y0: y, x1: x, y1: y };
    } else if (tool === Tools.Eyedrop) {
      const rgba = getPixel(currCanvas, x, y);
      setColor(rgbaToHex(rgba));
    }
    requestAnimationFrame(draw);
  }

  function moveStroke(e) {
    const mode = draggingRef.current;
    if (!mode) return;

    if (mode === "pan") {
      const last = lastPtRef.current;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      lastPtRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { x, y } = clientToPixel(e);
    const ctx = currCanvas.getContext("2d");
    if (tool === Tools.Pencil || tool === Tools.Eraser) {
      const last = lastPtRef.current;
      drawLinePixel(ctx, last.x, last.y, x, y, color, brush, tool === Tools.Eraser);
      lastPtRef.current = { x, y };
    } else if (tool === Tools.Rect || tool === Tools.Circle) {
      const prev = previewRef.current;
      if (!prev) return;
      prev.x1 = clamp(x, 0, spriteW - 1);
      prev.y1 = clamp(y, 0, spriteH - 1);
    }
    requestAnimationFrame(draw);
  }

  function endStroke(e) {
    const mode = draggingRef.current;
    draggingRef.current = false;
    if (!mode) return;

    if (mode === "pan") return;

    const { x, y } = clientToPixel(e);
    const ctx = currCanvas.getContext("2d");
    if (tool === Tools.Rect || tool === Tools.Circle) {
      const prev = previewRef.current;
      if (!prev) return;
      previewRef.current = null;
      const x0 = clamp(Math.min(prev.x0, prev.x1), 0, spriteW - 1);
      const y0 = clamp(Math.min(prev.y0, prev.y1), 0, spriteH - 1);
      const x1 = clamp(Math.max(prev.x0, prev.x1), 0, spriteW - 1);
      const y1 = clamp(Math.max(prev.y0, prev.y1), 0, spriteH - 1);
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.imageSmoothingEnabled = false;
      if (tool === Tools.Rect) {
        ctx.fillRect(x0, y0, w, h);
      } else {
        // Rasterize ellipse by drawing to temp canvas at native res, then copy
        const tmp = createPixelCanvas(w, h);
        const t = tmp.getContext("2d");
        t.fillStyle = color;
        t.beginPath();
        t.ellipse(w / 2, h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
        t.fill();
        // Composite with nearest-neighbor
        ctx.drawImage(tmp, x0, y0);
      }
      ctx.restore();
    }
    requestAnimationFrame(draw);
  }

  function getPixel(canvas, x, y) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const d = ctx.getImageData(x, y, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }

  function rgbaToHex([r, g, b, a]) {
    const to2 = (n) => n.toString(16).padStart(2, "0");
    return "#" + to2(r) + to2(g) + to2(b);
  }

  // ------------------------------ Timeline ops ------------------------------
  function addFrame() {
    const c = createPixelCanvas(spriteW, spriteH);
    setFrames((f) => {
      const nf = f.slice();
      nf.splice(current + 1, 0, c);
      return nf;
    });
    setCurrent((i) => i + 1);
  }
  function duplicateFrame() {
    const src = frames[current];
    const c = createPixelCanvas(spriteW, spriteH);
    c.getContext("2d").drawImage(src, 0, 0);
    setFrames((f) => {
      const nf = f.slice();
      nf.splice(current + 1, 0, c);
      return nf;
    });
    setCurrent((i) => i + 1);
  }
  function deleteFrame() {
    if (frames.length === 1) {
      // clear instead
      const ctx = currCanvas.getContext("2d");
      ctx.clearRect(0, 0, currCanvas.width, currCanvas.height);
      pushHistory();
      requestAnimationFrame(draw);
      return;
    }
    setFrames((f) => {
      const nf = f.slice();
      nf.splice(current, 1);
      return nf;
    });
    setCurrent((i) => clamp(i - 1, 0, frames.length - 2));
  }
  function moveFrame(dir) {
    const j = current + dir;
    if (j < 0 || j >= frames.length) return;
    setFrames((f) => {
      const nf = f.slice();
      const [item] = nf.splice(current, 1);
      nf.splice(j, 0, item);
      return nf;
    });
    setCurrent(j);
  }

  // ------------------------------ Import/Export ------------------------------
  async function exportPNG() {
    const blob = await canvasToBlob(currCanvas);
    downloadBlob(blob, `sprite_frame_${current + 1}.png`);
  }

  async function exportSpritesheet() {
    // Horizontal strip spritesheet + JSON
    const cols = frames.length;
    const rows = 1;
    const sheet = createPixelCanvas(spriteW * cols, spriteH * rows);
    const sctx = sheet.getContext("2d");
    frames.forEach((c, i) => {
      sctx.drawImage(c, i * spriteW, 0);
    });
    const meta = { frameWidth: spriteW, frameHeight: spriteH, frames: [] };
    for (let i = 0; i < frames.length; i++)
      meta.frames.push({ x: i * spriteW, y: 0, w: spriteW, h: spriteH, index: i });
    const blob = await canvasToBlob(sheet);
    const json = new Blob([JSON.stringify(meta, null, 2)], { type: "application/json" });
    downloadBlob(blob, "spritesheet.png");
    downloadBlob(json, "spritesheet.json");
  }

  function handleImport(file) {
    const img = new Image();
    img.onload = () => {
      const ctx = currCanvas.getContext("2d");
      // Fit inside sprite bounds, preserving aspect (nearest neighbor)
      const scale = Math.min(spriteW / img.width, spriteH / img.height);
      const w = Math.max(1, Math.floor(img.width * scale));
      const h = Math.max(1, Math.floor(img.height * scale));
      const x = Math.floor((spriteW - w) / 2);
      const y = Math.floor((spriteH - h) / 2);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, spriteW, spriteH);
      ctx.drawImage(img, x, y, w, h);
      pushHistory();
      requestAnimationFrame(draw);
    };
    img.src = URL.createObjectURL(file);
  }

  // ------------------------------ Background: apply from description ------------------------------
  async function applyBackgroundFromDescription(desc, mode = "behind") {
    if (!desc) return;
    const bg = backgroundFromText(spriteW, spriteH, desc);
    const ctx = currCanvas.getContext("2d");
    pushHistory();
    if (mode === "replace") {
      ctx.clearRect(0, 0, spriteW, spriteH);
      ctx.drawImage(bg, 0, 0);
    } else {
      // behind: keep existing pixels on top
      const fore = createPixelCanvas(spriteW, spriteH);
      fore.getContext("2d").drawImage(currCanvas, 0, 0);
      ctx.clearRect(0, 0, spriteW, spriteH);
      ctx.drawImage(bg, 0, 0);
      ctx.drawImage(fore, 0, 0);
    }
    requestAnimationFrame(draw);
  }

  // ------------------------------ Background: AI (GPT) ------------------------------
  async function applyBackgroundFromAI(desc, fit = "cover") {
    if (!desc) return;
    console.info("[AI BG] start:", desc);
    try {
      // Generate image via API (returns data URL)
      const dataUrl = await generateImageFromPrompt(desc, { width: 1280, height: 720 });
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          console.info("[AI BG] loaded image, applying", { w: img.width, h: img.height, fit });
          const ctx = currCanvas.getContext("2d");
          pushHistory();
          ctx.clearRect(0, 0, spriteW, spriteH);
          ctx.imageSmoothingEnabled = false;

          if (fit === "stretch") {
            ctx.drawImage(img, 0, 0, spriteW, spriteH);
          } else {
            // cover (centered), preserving aspect ratio
            const s = Math.max(spriteW / img.width, spriteH / img.height);
            const dw = Math.floor(img.width * s);
            const dh = Math.floor(img.height * s);
            const dx = Math.floor((spriteW - dw) / 2);
            const dy = Math.floor((spriteH - dh) / 2);
            ctx.drawImage(img, dx, dy, dw, dh);
          }

          requestAnimationFrame(draw);
          resolve();
        };
        img.onerror = () => reject(new Error("Failed to load AI image"));
        img.crossOrigin = "anonymous";
        img.src = dataUrl;
      });
      console.info("[AI BG] success");
    } catch (e) {
      console.warn("[AI BG] error, falling back to procedural:", e?.message || e);
      // Fallback: default to deterministic background generator
      const bg = backgroundFromText(spriteW, spriteH, desc);
      const ctx = currCanvas.getContext("2d");
      pushHistory();
      ctx.clearRect(0, 0, spriteW, spriteH);
      ctx.drawImage(bg, 0, 0);
      requestAnimationFrame(draw);
      console.info("[AI BG] fallback applied");
    }
  }

  // ------------------------------ UI Subcomponents (kept local for now) ------------------------------
  const Icon = {
    Pencil: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34a1.25 1.25 0 0 0 0-1.77l-2.98-2.98a1.25 1.25 0 0 0-1.77 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
      </svg>
    ),
    Eraser: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M16.24 3.56 21 8.32a2 2 0 0 1 0 2.83l-7.9 7.9a2 2 0 0 1-1.42.59H5.41a2 2 0 0 1-1.41-.59l-1.99-2A2 2 0 0 1 2 15.05l7.9-7.9a2 2 0 0 1 2.83 0l3.51 3.51 1.41-1.41-3.51-3.51a4 4 0 0 0-5.66 0L1 13.17a4 4 0 0 0 0 5.66l2 2A4 4 0 0 0 5.41 22h6.27a4 4 0 0 0 2.83-1.17l7.9-7.9a4 4 0 0 0 0-5.66l-4.76-4.76-1.41 1.41z" />
      </svg>
    ),
    Bucket: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M2 12l7-7 10 10-7 7L2 12zm17.5-5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" />
      </svg>
    ),
    Rect: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <rect x="4" y="4" width="16" height="16" rx="1" />
      </svg>
    ),
    Circle: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <circle cx="12" cy="12" r="8" />
      </svg>
    ),
    Eyedrop: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M16.88 3.29a2.5 2.5 0 0 1 3.53 3.54l-2.12 2.12-3.54-3.54 2.13-2.12zM13.59 6.59l3.54 3.54-9.19 9.19H4.4v-3.53l9.19-9.2z" />
      </svg>
    ),
    Hand: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M6 11V6a2 2 0 1 1 4 0v3h1V4a2 2 0 1 1 4 0v5h1V6a2 2 0 1 1 4 0v9a6 6 0 1 1-12 0v-4H6z" />
      </svg>
    ),
    Undo: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M7 6v4H3L9 16l6-6H11V6z" />
      </svg>
    ),
    Redo: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M17 6v4h4l-6 6-6-6h4V6z" />
      </svg>
    ),
    Grid: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M3 3h18v18H3V3zm6 0v18M3 9h18M12 3v18M3 15h18" />
      </svg>
    ),
    Zoom: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M10 18a8 8 0 1 1 5.3-14l4.7 4.7-1.4 1.4-4.6-4.6A6 6 0 1 0 10 16v2z" />
      </svg>
    ),
    Play: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M8 5v14l11-7z" />
      </svg>
    ),
    Pause: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
      </svg>
    ),
    Plus: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M11 5h2v14h-2zM5 11h14v2H5z" />
      </svg>
    ),
    Copy: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M8 8h12v12H8zM4 4h12v2H6v10H4z" />
      </svg>
    ),
    Trash: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z" />
      </svg>
    ),
    Upload: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M5 20h14v-2H5v2zM12 2l5 5h-3v6h-4V7H7l5-5z" />
      </svg>
    ),
    Download: (p) => (
      <svg viewBox="0 0 24 24" {...p}>
        <path d="M5 20h14v-2H5v2zM11 2h2v10h3l-4 4-4-4h3z" />
      </svg>
    ),
  };

  const ToolButton = ({ active, title, onClick, children }) => (
    <button
      title={title}
      onClick={onClick}
      className={`p-2 rounded-xl border ${
        active ? "bg-black text-white border-black" : "bg-white text-black border-neutral-200 hover:border-neutral-400"
      } shadow-sm`}
    >
      {children}
    </button>
  );

  const Toolbar = () => (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-neutral-200 bg-white">
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-neutral-200 bg-white cursor-pointer hover:border-neutral-400">
          <Icon.Upload className="w-4 h-4" />
          <span className="text-sm">Import</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
            }}
          />
        </label>
        <button
          onClick={() => {
            const ctx = currCanvas.getContext("2d");
            ctx.clearRect(0, 0, currCanvas.width, currCanvas.height);
            pushHistory();
            requestAnimationFrame(draw);
          }}
          className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-400"
        >
          New Sprite
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const desc = prompt('Describe a background (e.g., "sunset mountains", "space nebula")');
              if (desc) await applyBackgroundFromDescription(desc, "behind");
            }}
            className="px-2 py-1 rounded border bg-white hover:bg-gray-50 text-sm"
          >
            Background
          </button>
          <button
            onClick={async () => {
              const desc = prompt('Describe an AI background (e.g., "lush forest concept art")');
              if (!desc) return;
              await applyBackgroundFromAI(desc, "cover");
            }}
            className="px-2 py-1 rounded border bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm"
            title="AI Generate (requires API key)"
          >
            AI Generate
          </button>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={undo}
            className="px-2 py-1.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-400"
            title="Undo (Ctrl/Cmd+Z)"
          >
            <Icon.Undo className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            className="px-2 py-1.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-400"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Icon.Redo className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-2 py-1 rounded-xl border border-neutral-200 bg-white">
          <Icon.Zoom className="w-4 h-4" />
          <input type="range" min={1} max={32} value={zoom} onChange={(e) => setZoom(parseInt(e.target.value))} />
          <span className="text-sm w-10 text-right">{zoom}×</span>
        </div>
        <button
          onClick={() => setShowGrid((v) => !v)}
          className={`px-2 py-1.5 rounded-xl border ${
            showGrid ? "bg-black text-white border-black" : "bg-white border-neutral-200 hover:border-neutral-400"
          }`}
          title="Toggle grid"
        >
          <Icon.Grid className="w-4 h-4" />
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-400"
          title="Play/Pause"
        >
          {playing ? <Icon.Pause className="w-4 h-4" /> : <Icon.Play className="w-4 h-4" />}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={exportPNG}
          className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-400 flex items-center gap-2"
        >
          <Icon.Download className="w-4 h-4" /> PNG
        </button>
        <button
          onClick={exportSpritesheet}
          className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-400"
        >
          Spritesheet
        </button>
        {onCharacterExtract && (
          <button
            onClick={handleExtractCharacter}
            className="px-3 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
            title="Extract current frame as a game character"
          >
            🎮 Extract Character
          </button>
        )}
      </div>
    </div>
  );

  const LeftTools = () => (
    <div className="flex flex-col gap-2 p-2 border-r border-neutral-200 bg-white">
      <ToolButton title="Pencil (1)" active={tool === Tools.Pencil} onClick={() => setTool(Tools.Pencil)}>
        <Icon.Pencil className="w-5 h-5" />
      </ToolButton>
      <ToolButton title="Eraser (2)" active={tool === Tools.Eraser} onClick={() => setTool(Tools.Eraser)}>
        <Icon.Eraser className="w-5 h-5" />
      </ToolButton>
      <ToolButton title="Fill (3)" active={tool === Tools.Bucket} onClick={() => setTool(Tools.Bucket)}>
        <Icon.Bucket className="w-5 h-5" />
      </ToolButton>
      <ToolButton title="Rectangle (4)" active={tool === Tools.Rect} onClick={() => setTool(Tools.Rect)}>
        <Icon.Rect className="w-5 h-5" />
      </ToolButton>
      <ToolButton title="Circle (5)" active={tool === Tools.Circle} onClick={() => setTool(Tools.Circle)}>
        <Icon.Circle className="w-5 h-5" />
      </ToolButton>
      <ToolButton title="Eyedropper (I)" active={tool === Tools.Eyedrop} onClick={() => setTool(Tools.Eyedrop)}>
        <Icon.Eyedrop className="w-5 h-5" />
      </ToolButton>
      <ToolButton title="Hand (H) / hold Space" active={tool === Tools.Hand || isSpace} onClick={() => setTool(Tools.Hand)}>
        <Icon.Hand className="w-5 h-5" />
      </ToolButton>
    </div>
  );

  const RightPanel = () => (
    <div className="w-64 border-l border-neutral-200 bg-white p-3 flex flex-col gap-3">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-700">Properties</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex items-center gap-2 col-span-1">
            W
            <input
              type="number"
              className="w-full px-2 py-1 border rounded-lg"
              value={spriteW}
              min={1}
              max={1024}
              onChange={(e) => setSpriteW(parseInt(e.target.value || "1"))}
            />
          </label>
          <label className="flex items-center gap-2 col-span-1">
            H
            <input
              type="number"
              className="w-full px-2 py-1 border rounded-lg"
              value={spriteH}
              min={1}
              max={1024}
              onChange={(e) => setSpriteH(parseInt(e.target.value || "1"))}
            />
          </label>
          <label className="flex items-center gap-2 col-span-2">
            Brush
            <input type="range" min={1} max={16} value={brush} onChange={(e) => setBrush(parseInt(e.target.value))} />
            <span className="w-6 text-right">{brush}</span>
          </label>
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-700">Color</h3>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-10 rounded overflow-hidden"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="px-2 py-1 border rounded-lg w-full"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {[
            "#000000",
            "#ffffff",
            "#ef4444",
            "#f59e0b",
            "#10b981",
            "#3b82f6",
            "#8b5cf6",
            "#ec4899",
            "#78350f",
            "#6b7280",
          ].map((c) => (
            <button key={c} onClick={() => setColor(c)} style={{ background: c }} className="w-6 h-6 rounded border" />
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-700">Animation</h3>
        <label className="flex items-center gap-2 text-sm">
          FPS
          <input type="range" min={1} max={24} value={fps} onChange={(e) => setFps(parseInt(e.target.value))} />
          <span className="w-6 text-right">{fps}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} />
          Onion skin (prev)
        </label>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-700">Character Attributes</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={attrJump} onChange={(e) => setAttrJump(e.target.checked)} />
          Jump (Space)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={attrSlide} onChange={(e) => setAttrSlide(e.target.checked)} />
          Slide (Hold Down + Arrow)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={attrPunch} onChange={(e) => setAttrPunch(e.target.checked)} />
          Punch (X)
        </label>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-700">Export</h3>
        <p className="text-xs text-neutral-500">
          PNG exports the current frame. Spritesheet exports a horizontal strip PNG and a JSON map.
        </p>
      </section>
    </div>
  );

  const Timeline = () => (
    <div className="border-t border-neutral-200 bg-white p-2 flex items-center gap-2 overflow-x-auto">
      <button
        onClick={addFrame}
        className="px-2 py-1.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-400 flex items-center gap-1"
      >
        <Icon.Plus className="w-4 h-4" /> Add
      </button>
      <button
        onClick={duplicateFrame}
        className="px-2 py-1.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-400 flex items-center gap-1"
      >
        <Icon.Copy className="w-4 h-4" /> Duplicate
      </button>
      <button
        onClick={deleteFrame}
        className="px-2 py-1.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-400 flex items-center gap-1"
      >
        <Icon.Trash className="w-4 h-4" /> Delete
      </button>
      <div className="w-px h-6 bg-neutral-200 mx-1" />
      <button
        onClick={() => moveFrame(-1)}
        className="px-2 py-1.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-400"
      >
        ←
      </button>
      <button
        onClick={() => moveFrame(1)}
        className="px-2 py-1.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-400"
      >
        →
      </button>
      <div className="w-px h-6 bg-neutral-200 mx-1" />
      <div className="flex items-center gap-2">
        {frames.map((c, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`relative rounded-lg border ${
              i === current ? "border-black" : "border-neutral-300 hover:border-neutral-500"
            } bg-white p-1`}
          >
            <canvas
              width={Math.max(1, Math.min(96, spriteW * 2))}
              height={Math.max(1, Math.min(96, spriteH * 2))}
              ref={(el) => {
                if (el) {
                  const ctx = el.getContext("2d");
                  ctx.imageSmoothingEnabled = false;
                  ctx.fillStyle = "#fff";
                  ctx.fillRect(0, 0, el.width, el.height);
                  nearestNeighborDraw(c, el);
                }
              }}
              style={{ imageRendering: "pixelated" }}
            />
            <span className="absolute -top-2 -right-2 text-[10px] bg-black text-white px-1 rounded">{i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );

  // ------------------------------ Render ------------------------------
  return (
    <div className="h-screen w-full grid grid-rows-[auto_1fr_auto] bg-neutral-50 text-neutral-900">
      <Toolbar />
      <div className="grid grid-cols-[auto_1fr_auto] overflow-hidden">
        <LeftTools />
        <div className="relative">
          <div ref={wrapRef} className="absolute inset-0">
            <canvas
              ref={viewRef}
              className="w-full h-full cursor-crosshair select-none"
              role="img"
              aria-label="Sprite editor canvas"
              onPointerDown={(e) => {
                e.target.setPointerCapture(e.pointerId);
                beginStroke(e);
              }}
              onPointerMove={moveStroke}
              onPointerUp={endStroke}
              onWheel={(e) => {
                const dir = Math.sign(e.deltaY);
                const nz = clamp(zoom + (dir > 0 ? -1 : 1), 1, 32);
                if (nz !== zoom) setZoom(nz);
              }}
              onDoubleClick={() => {
                setPan({
                  x: Math.floor((viewSize.w - spriteW * zoom) / 2),
                  y: Math.floor((viewSize.h - spriteH * zoom) / 2),
                });
              }}
              style={{ imageRendering: "pixelated", background: "transparent" }}
            />
          </div>
        </div>
        <RightPanel />
      </div>
      <Timeline />
    </div>
  );
}
