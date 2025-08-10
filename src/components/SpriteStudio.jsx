import React from "react";
import CanvasEditor from "./editors/CanvasEditor.jsx";

/**
 * SpriteStudio orchestrator.
 * Phase 1: render CanvasEditor only (keeps behavior unchanged).
 * Next phases will add:
 *  - PlatformEditor (snap-to-grid rectangles)
 *  - RightSidebar with EditTab (background, characters, abilities) and PlayTab (generate/poll/play/reset)
 *  - Scene model + generator client wiring
 */
export default function SpriteStudio() {
  return <CanvasEditor />;
}
