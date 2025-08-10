import React, { useState } from "react";
import CanvasEditor from "./editors/CanvasEditor.jsx";
import RightSidebar from "./shared/RightSidebar/RightSidebar.jsx";

/**
 * SpriteStudio orchestrator (simplified).
 * - Focuses on Sprite (Canvas) editing and Right Sidebar (Edit/Play).
 * - Platforms/Level Editor removed per product direction: GPT-5 will autogenerate game code from sprite(s) + background.
 */
export default function SpriteStudio() {
  // Game world state
  const [world, setWorld] = useState({ width: 1280, height: 720, gravity: 1400 });

  // Core authoring inputs
  const [characters, setCharacters] = useState([]);
  const [background, setBackground] = useState(null);

  // Platforms removed from UI (kept as empty array for scene contract compatibility)
  const [platforms] = useState([]);

  // Handle character extraction from canvas
  function handleCharacterExtract(characterData) {
    if (characters.length >= 3) {
      alert("Maximum 3 characters allowed. Remove a character first.");
      return;
    }
    setCharacters((prev) => [...prev, characterData]);
  }

  return (
    <div className="h-screen w-full flex flex-col bg-neutral-50">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-200 bg-white shadow-sm">
        <div className="text-sm font-medium text-neutral-800">🎨 Sprite Studio</div>
        <div className="text-xs text-neutral-500">
          Create sprites and backgrounds. GPT‑5 will autogenerate the game from these inputs.
        </div>
        <div className="flex-1" />
        <div className="text-sm text-gray-600">World: {world.width}×{world.height}</div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex">
        {/* Editor Area */}
        <div className="flex-1">
          <CanvasEditor onCharacterExtract={handleCharacterExtract} />
        </div>

        {/* Right Sidebar */}
        <RightSidebar
          world={world}
          characters={characters}
          platforms={platforms}
          background={background}
          onCharactersChange={setCharacters}
          onBackgroundChange={setBackground}
          onWorldChange={setWorld}
        />
      </div>
    </div>
  );
}
