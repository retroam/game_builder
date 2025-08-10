import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { clamp, drawCheckers } from "../../lib/canvas.js";

/**
 * PlatformEditor - Rectangle platform placement with snap-to-grid
 * Users can draw rectangular platforms that will become collision objects in the game
 */

export default function PlatformEditor({ 
  platforms = [], 
  world = { width: 1280, height: 720 },
  grid = { enabled: true, size: 16 },
  background = null,
  onPlatformsChange 
}) {
  // Canvas and view setup
  const viewRef = useRef(null);
  const wrapRef = useRef(null);
  const [viewSize, setViewSize] = useState({ w: 800, h: 600 });
  const [zoom, setZoom] = useState(4); // Scale factor for world display
  const [pan, setPan] = useState({ x: 50, y: 50 });
  
  // Editing state
  const [tool, setTool] = useState("platform"); // "platform", "select", "pan"
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragMode, setDragMode] = useState(null); // "create", "move", "resize"
  const [previewRect, setPreviewRect] = useState(null);

  // Resize observer for view
  useLayoutEffect(() => {
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setViewSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) });
      }
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Snap coordinate to grid
  function snapToGrid(x, y) {
    if (!grid.enabled) return { x, y };
    const size = grid.size;
    return {
      x: Math.round(x / size) * size,
      y: Math.round(y / size) * size
    };
  }

  // Convert client coordinates to world coordinates
  function clientToWorld(e) {
    const rect = viewRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left - pan.x;
    const cy = e.clientY - rect.top - pan.y;
    const wx = cx / zoom;
    const wy = cy / zoom;
    return snapToGrid(wx, wy);
  }

  // Find platform at world coordinates
  function findPlatformAt(wx, wy) {
    for (let i = platforms.length - 1; i >= 0; i--) {
      const p = platforms[i];
      if (wx >= p.x && wx < p.x + p.w && wy >= p.y && wy < p.y + p.h) {
        return { platform: p, index: i };
      }
    }
    return null;
  }

  // Handle mouse/pointer events
  function handlePointerDown(e) {
    e.target.setPointerCapture(e.pointerId);
    const { x, y } = clientToWorld(e);
    setDragStart({ x, y, clientX: e.clientX, clientY: e.clientY });
    
    if (tool === "pan") {
      setIsDragging(true);
      setDragMode("pan");
      return;
    }

    const found = findPlatformAt(x, y);
    
    if (tool === "select") {
      if (found) {
        setSelectedPlatform(found.index);
        setIsDragging(true);
        setDragMode("move");
      } else {
        setSelectedPlatform(null);
      }
    } else if (tool === "platform") {
      if (found) {
        // Start moving existing platform
        setSelectedPlatform(found.index);
        setIsDragging(true);
        setDragMode("move");
      } else {
        // Start creating new platform
        setIsDragging(true);
        setDragMode("create");
        setPreviewRect({ x, y, w: 0, h: 0 });
      }
    }
  }

  function handlePointerMove(e) {
    if (!isDragging) return;

    const { x, y } = clientToWorld(e);
    const dx = e.clientX - dragStart.clientX;
    const dy = e.clientY - dragStart.clientY;

    if (dragMode === "pan") {
      setPan(prevPan => ({ x: prevPan.x + dx, y: prevPan.y + dy }));
      setDragStart({ ...dragStart, clientX: e.clientX, clientY: e.clientY });
    } else if (dragMode === "create") {
      const startX = dragStart.x;
      const startY = dragStart.y;
      const width = Math.abs(x - startX);
      const height = Math.abs(y - startY);
      const rectX = Math.min(startX, x);
      const rectY = Math.min(startY, y);
      
      setPreviewRect({ x: rectX, y: rectY, w: width, h: height });
    } else if (dragMode === "move" && selectedPlatform !== null) {
      const platform = platforms[selectedPlatform];
      const newX = clamp(platform.x + (x - dragStart.x), 0, world.width - platform.w);
      const newY = clamp(platform.y + (y - dragStart.y), 0, world.height - platform.h);
      
      const newPlatforms = [...platforms];
      newPlatforms[selectedPlatform] = { ...platform, x: newX, y: newY };
      onPlatformsChange?.(newPlatforms);
      
      setDragStart({ x, y, clientX: e.clientX, clientY: e.clientY });
    }
  }

  function handlePointerUp(e) {
    if (!isDragging) return;

    const { x, y } = clientToWorld(e);
    
    if (dragMode === "create" && previewRect) {
      // Create new platform if it has minimum size
      if (previewRect.w >= grid.size && previewRect.h >= grid.size) {
        const newPlatform = {
          x: previewRect.x,
          y: previewRect.y,
          w: previewRect.w,
          h: previewRect.h
        };
        onPlatformsChange?.([...platforms, newPlatform]);
      }
      setPreviewRect(null);
    }

    setIsDragging(false);
    setDragMode(null);
    setDragStart(null);
  }

  // Delete selected platform
  function deletePlatform() {
    if (selectedPlatform !== null) {
      const newPlatforms = platforms.filter((_, i) => i !== selectedPlatform);
      onPlatformsChange?.(newPlatforms);
      setSelectedPlatform(null);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedPlatform !== null) {
          deletePlatform();
          e.preventDefault();
        }
      }
      if (e.key === "1") setTool("platform");
      if (e.key === "2") setTool("select");
      if (e.key === "3" || e.key === "h" || e.key === "H") setTool("pan");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPlatform]);

  // Drawing function
  function draw() {
    const canvas = viewRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    const { w, h } = viewSize;
    
    // Set up canvas for DPR
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

    // Background
    ctx.fillStyle = "#f8f9fa";
    ctx.fillRect(0, 0, w, h);

    // World area with checkerboard
    const worldX = pan.x;
    const worldY = pan.y;
    const worldW = world.width * zoom;
    const worldH = world.height * zoom;
    
    drawCheckers(ctx, worldX, worldY, worldW, worldH, 16);
    
    // World border
    ctx.strokeStyle = "#dee2e6";
    ctx.lineWidth = 2;
    ctx.strokeRect(worldX - 1, worldY - 1, worldW + 2, worldH + 2);

    // Grid
    if (grid.enabled) {
      ctx.save();
      ctx.translate(worldX, worldY);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.lineWidth = 1;
      
      const gridSize = grid.size * zoom;
      for (let x = 0; x <= worldW; x += gridSize) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, worldH);
      }
      for (let y = 0; y <= worldH; y += gridSize) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(worldW, y + 0.5);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Background image preview (if available)
    if (background?.imageUrl) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      // This would need background image loading logic
      ctx.restore();
    }

    // Platforms
    ctx.save();
    ctx.translate(worldX, worldY);
    ctx.scale(zoom, zoom);
    
    platforms.forEach((platform, i) => {
      const isSelected = i === selectedPlatform;
      
      // Platform body
      ctx.fillStyle = isSelected ? "rgba(59, 130, 246, 0.8)" : "rgba(75, 85, 99, 0.8)";
      ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
      
      // Platform border
      ctx.strokeStyle = isSelected ? "#3b82f6" : "#4b5563";
      ctx.lineWidth = isSelected ? 2 / zoom : 1 / zoom;
      ctx.strokeRect(platform.x, platform.y, platform.w, platform.h);
      
      // Size label
      if (isSelected || platform.w * zoom > 50) {
        ctx.save();
        ctx.fillStyle = "#fff";
        ctx.font = `${Math.max(10, 12 / zoom)}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const text = `${platform.w}×${platform.h}`;
        ctx.fillText(text, platform.x + platform.w/2, platform.y + platform.h/2);
        ctx.restore();
      }
    });

    // Preview rectangle while creating
    if (previewRect && dragMode === "create") {
      ctx.fillStyle = "rgba(59, 130, 246, 0.3)";
      ctx.fillRect(previewRect.x, previewRect.y, previewRect.w, previewRect.h);
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(previewRect.x, previewRect.y, previewRect.w, previewRect.h);
    }

    ctx.restore();
    ctx.restore();
  }

  // Redraw when state changes
  useEffect(() => {
    requestAnimationFrame(draw);
  }, [viewSize, zoom, pan, platforms, selectedPlatform, previewRect, world, grid]);

  // Center world initially
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setPan({
        x: Math.max(50, (viewSize.w - world.width * zoom) / 2),
        y: Math.max(50, (viewSize.h - world.height * zoom) / 2)
      });
    });
    return () => cancelAnimationFrame(id);
  }, []);

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

  return (
    <div className="h-full w-full flex flex-col bg-neutral-50">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-neutral-200 bg-white">
        <div className="flex items-center gap-2">
          <ToolButton title="Platform Tool (1)" active={tool === "platform"} onClick={() => setTool("platform")}>
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <rect x="4" y="12" width="16" height="4" rx="1" />
            </svg>
          </ToolButton>
          <ToolButton title="Select Tool (2)" active={tool === "select"} onClick={() => setTool("select")}>
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
            </svg>
          </ToolButton>
          <ToolButton title="Pan Tool (3)" active={tool === "pan"} onClick={() => setTool("pan")}>
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M6 11V6a2 2 0 1 1 4 0v3h1V4a2 2 0 1 1 4 0v5h1V6a2 2 0 1 1 4 0v9a6 6 0 1 1-12 0v-4H6z" />
            </svg>
          </ToolButton>
          <div className="w-px h-6 bg-neutral-200 mx-1" />
          <button
            onClick={deletePlatform}
            disabled={selectedPlatform === null}
            className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete Selected Platform (Delete)"
          >
            Delete
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2 py-1 rounded-xl border border-neutral-200 bg-white">
            <span className="text-sm">Zoom</span>
            <input 
              type="range" 
              min={1} 
              max={16} 
              step={0.5}
              value={zoom} 
              onChange={(e) => setZoom(parseFloat(e.target.value))} 
            />
            <span className="text-sm w-8 text-right">{zoom}×</span>
          </div>
          <label className="flex items-center gap-2 px-2 py-1 rounded-xl border border-neutral-200 bg-white">
            <input 
              type="checkbox" 
              checked={grid.enabled} 
              onChange={(e) => onPlatformsChange && onPlatformsChange(platforms, { ...grid, enabled: e.target.checked })}
            />
            <span className="text-sm">Grid</span>
          </label>
        </div>

        <div className="text-sm text-neutral-600">
          Platforms: {platforms.length} | Selected: {selectedPlatform !== null ? selectedPlatform + 1 : "None"}
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 relative">
        <div ref={wrapRef} className="absolute inset-0">
          <canvas
            ref={viewRef}
            className="w-full h-full cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={(e) => {
              const dir = Math.sign(e.deltaY);
              const newZoom = clamp(zoom + (dir > 0 ? -0.5 : 0.5), 1, 16);
              if (newZoom !== zoom) setZoom(newZoom);
            }}
            onDoubleClick={() => {
              setPan({
                x: Math.max(50, (viewSize.w - world.width * zoom) / 2),
                y: Math.max(50, (viewSize.h - world.height * zoom) / 2)
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}