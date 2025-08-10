import React, { useState } from "react";
import { backgroundFromText } from "../../../lib/background.js";
import { generateImageFromPrompt } from "../../../lib/gptImage.js";

/**
 * EditTab - Configure background, characters, and game world settings
 */
export default function EditTab({
  world,
  characters,
  platforms,
  background,
  onCharactersChange,
  onBackgroundChange,
  onWorldChange
}) {
  const [backgroundPrompt, setBackgroundPrompt] = useState("");
  const [isGeneratingBackground, setIsGeneratingBackground] = useState(false);

  // Generate background from text prompt
  async function handleGenerateBackground(useAI = false) {
    if (!backgroundPrompt.trim()) return;
    
    setIsGeneratingBackground(true);
    try {
      if (useAI) {
        // Try AI generation first
        try {
          const dataUrl = await generateImageFromPrompt(backgroundPrompt, { width: 1280, height: 720 });
          onBackgroundChange?.({
            prompt: backgroundPrompt,
            imageUrl: dataUrl,
            fit: "cover"
          });
        } catch (aiError) {
          console.warn("AI generation failed, falling back to procedural:", aiError.message);
          // Fall back to procedural generation
          const canvas = backgroundFromText(1280, 720, backgroundPrompt);
          const dataUrl = canvas.toDataURL("image/png");
          onBackgroundChange?.({
            prompt: backgroundPrompt,
            imageUrl: dataUrl,
            fit: "cover"
          });
        }
      } else {
        // Direct procedural generation
        const canvas = backgroundFromText(1280, 720, backgroundPrompt);
        const dataUrl = canvas.toDataURL("image/png");
        onBackgroundChange?.({
          prompt: backgroundPrompt,
          imageUrl: dataUrl,
          fit: "cover"
        });
      }
    } catch (error) {
      console.error("Background generation failed:", error);
      alert("Failed to generate background: " + error.message);
    } finally {
      setIsGeneratingBackground(false);
    }
  }

  // Clear background
  function handleClearBackground() {
    onBackgroundChange?.(null);
    setBackgroundPrompt("");
  }

  // Add character from current canvas frame (placeholder for now)
  function handleAddCharacterFromCanvas() {
    // Direct users to use the canvas editor's extract button
    alert("To add a character:\n1. Switch to the Sprite Editor tab\n2. Create or draw your character\n3. Click the '🎮 Extract Character' button in the toolbar\n\nThis will automatically add the character to your game!");
  }

  // Update character
  function updateCharacter(index, updates) {
    const newCharacters = [...characters];
    newCharacters[index] = { ...newCharacters[index], ...updates };
    onCharactersChange?.(newCharacters);
  }

  // Delete character
  function deleteCharacter(index) {
    const newCharacters = characters.filter((_, i) => i !== index);
    onCharactersChange?.(newCharacters);
  }

  const Section = ({ title, children }) => (
    <div className="p-3 border-b border-neutral-100">
      <h3 className="text-sm font-semibold text-neutral-700 mb-3">{title}</h3>
      {children}
    </div>
  );

  return (
    <div>
      {/* Background Section */}
      <Section title="Background">
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Describe the background (e.g. 'sunset mountains', 'space nebula')"
            value={backgroundPrompt}
            onChange={(e) => setBackgroundPrompt(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm"
            maxLength={500}
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleGenerateBackground(false)}
              disabled={!backgroundPrompt.trim() || isGeneratingBackground}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingBackground ? "Generating..." : "Generate"}
            </button>
            <button
              onClick={() => handleGenerateBackground(true)}
              disabled={!backgroundPrompt.trim() || isGeneratingBackground}
              className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Generate with AI (requires API key)"
            >
              AI Generate
            </button>
            {background && (
              <button
                onClick={handleClearBackground}
                className="px-3 py-1.5 bg-gray-500 text-white text-sm rounded-lg hover:bg-gray-600"
              >
                Clear
              </button>
            )}
          </div>
          {background && (
            <div className="mt-2">
              <div className="text-xs text-neutral-500 mb-1">Preview:</div>
              <img
                src={background.imageUrl}
                alt="Background preview"
                className="w-full h-16 object-cover rounded border"
              />
              <div className="text-xs text-neutral-400 mt-1">"{background.prompt}"</div>
            </div>
          )}
        </div>
      </Section>

      {/* Characters Section */}
      <Section title={`Characters (${characters.length}/3)`}>
        <div className="space-y-2">
          <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <div className="text-blue-800 font-medium mb-1">💡 How to add characters:</div>
            <div className="text-blue-700 text-xs">
              1. Switch to <strong>🎨 Sprite Editor</strong><br/>
              2. Create or draw your character<br/>
              3. Click <strong>🎮 Extract Character</strong>
            </div>
          </div>
          
          {characters.map((char, i) => (
            <div key={char.id} className="border border-neutral-200 rounded-lg p-2">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={char.name}
                  onChange={(e) => updateCharacter(i, { name: e.target.value })}
                  className="flex-1 px-2 py-1 border border-neutral-200 rounded text-sm"
                />
                <button
                  onClick={() => deleteCharacter(i)}
                  className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-sm"
                  title="Delete character"
                >
                  🗑️
                </button>
              </div>
              
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={char.abilities.jump}
                    onChange={(e) => updateCharacter(i, { 
                      abilities: { ...char.abilities, jump: e.target.checked }
                    })}
                  />
                  Can Jump
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={char.abilities.slide}
                    onChange={(e) => updateCharacter(i, { 
                      abilities: { ...char.abilities, slide: e.target.checked }
                    })}
                  />
                  Can Slide
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={char.abilities.punch}
                    onChange={(e) => updateCharacter(i, { 
                      abilities: { ...char.abilities, punch: e.target.checked }
                    })}
                  />
                  Can Punch/Shoot
                </label>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label>
                    Speed: {char.abilities.moveSpeed}
                    <input
                      type="range"
                      min={50}
                      max={400}
                      value={char.abilities.moveSpeed}
                      onChange={(e) => updateCharacter(i, { 
                        abilities: { ...char.abilities, moveSpeed: parseInt(e.target.value) }
                      })}
                      className="w-full"
                    />
                  </label>
                  <label>
                    Jump: {char.abilities.jumpVelocity}
                    <input
                      type="range"
                      min={200}
                      max={800}
                      value={char.abilities.jumpVelocity}
                      onChange={(e) => updateCharacter(i, { 
                        abilities: { ...char.abilities, jumpVelocity: parseInt(e.target.value) }
                      })}
                      className="w-full"
                    />
                  </label>
                </div>
              </div>
            </div>
          ))}
          
          {characters.length === 0 && (
            <div className="text-center py-4 text-neutral-500 text-sm">
              No characters yet. Create a sprite in the Canvas Editor, then add it here.
            </div>
          )}
        </div>
      </Section>

      {/* World Settings Section */}
      <Section title="World Settings">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              Width
              <input
                type="number"
                value={world.width}
                onChange={(e) => onWorldChange?.({ ...world, width: parseInt(e.target.value) })}
                min={800}
                max={2560}
                className="w-full px-2 py-1 border border-neutral-200 rounded text-sm"
              />
            </label>
            <label className="text-xs">
              Height
              <input
                type="number"
                value={world.height}
                onChange={(e) => onWorldChange?.({ ...world, height: parseInt(e.target.value) })}
                min={600}
                max={1440}
                className="w-full px-2 py-1 border border-neutral-200 rounded text-sm"
              />
            </label>
          </div>
          <label className="text-xs">
            Gravity: {world.gravity || 1400}
            <input
              type="range"
              min={500}
              max={3000}
              step={100}
              value={world.gravity || 1400}
              onChange={(e) => onWorldChange?.({ ...world, gravity: parseInt(e.target.value) })}
              className="w-full"
            />
          </label>
          
        </div>
      </Section>

      {/* Validation Section */}
      <Section title="Requirements Check">
        <div className="space-y-1 text-sm">
          <div className={`flex items-center gap-2 ${characters.length > 0 ? 'text-green-600' : 'text-amber-600'}`}>
            {characters.length > 0 ? '✅' : '⚠️'} Characters: {characters.length}/3
          </div>
          <div className={`flex items-center gap-2 ${background ? 'text-green-600' : 'text-gray-400'}`}>
            {background ? '✅' : '➖'} Background: {background ? 'Set' : 'Optional'}
          </div>
        </div>
        
        {characters.length > 0 && (
          <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-lg">
            <div className="text-sm text-green-800 font-medium">🎉 Ready to generate game!</div>
            <div className="text-xs text-green-600">Switch to the Play tab to create your game.</div>
          </div>
        )}
      </Section>
    </div>
  );
}
