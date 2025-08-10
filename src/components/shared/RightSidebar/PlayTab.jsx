import React, { useState, useEffect } from "react";
import { toScene, validateAssets } from "../../../lib/scene.js";

/**
 * PlayTab - Game generation, polling, and iframe player
 */
export default function PlayTab({ world, characters, platforms, background }) {
  const [gameState, setGameState] = useState({
    status: "idle", // "idle" | "generating" | "ready" | "failed"
    jobId: null,
    bundleUrl: null,
    error: null,
    progress: null
  });
  
  const [isPlaying, setIsPlaying] = useState(false);
  const iframeRef = React.useRef(null);

  // Check if we can generate a game
  const canGenerate = characters.length > 0;
  
  // Validate assets
  const assetErrors = validateAssets({ background, characters });

  // Generate game
  async function handleGenerateGame() {
    if (!canGenerate) return;

    setGameState({ status: "generating", jobId: null, bundleUrl: null, error: null });
    
    try {
      // Build scene data
      const scene = toScene({ characters, platforms, background, world });
      
      // For now, we'll simulate the backend API call
      // In the real implementation, this would POST to /api/games
      await simulateGameGeneration(scene);
      
    } catch (error) {
      console.error("Game generation failed:", error);
      setGameState(prev => ({
        ...prev,
        status: "failed",
        error: error.message
      }));
    }
  }

  // Simulate game generation (placeholder for real backend)
  async function simulateGameGeneration(scene) {
    const jobId = `job_${Date.now()}`;
    setGameState(prev => ({ ...prev, jobId }));
    
    // Simulate progress updates
    const progressSteps = [
      { progress: 20, message: "Validating scene data..." },
      { progress: 40, message: "Generating Phaser game code..." },
      { progress: 60, message: "Processing assets..." },
      { progress: 80, message: "Building game bundle..." },
      { progress: 100, message: "Game ready!" }
    ];
    
    for (const step of progressSteps) {
      await new Promise(resolve => setTimeout(resolve, 800));
      setGameState(prev => ({ ...prev, progress: step }));
    }
    
    // For demo purposes, create a simple game URL
    // In reality, this would be the actual generated game
    const demoGameHtml = createDemoGame(scene);
    const blob = new Blob([demoGameHtml], { type: "text/html" });
    const bundleUrl = URL.createObjectURL(blob);
    
    setGameState({
      status: "ready",
      jobId,
      bundleUrl,
      error: null,
      progress: { progress: 100, message: "Game ready!" }
    });
  }

  // Create a demo HTML game (placeholder for real Phaser generator)
  function createDemoGame(scene) {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Generated Game</title>
    <style>
        body { margin: 0; background: #111; color: white; font-family: system-ui; overflow: hidden; }
        #game { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; flex-direction: column; }
        .platform { position: absolute; background: #666; }
        .character { position: absolute; background: #f39c12; border-radius: 4px; }
        .controls { position: absolute; bottom: 20px; left: 20px; font-size: 12px; }
    </style>
</head>
<body>
    <div id="game">
        <h2>🎮 Generated Game Demo</h2>
        <div style="margin: 20px; max-width: 500px; text-align: center;">
            <p><strong>World:</strong> ${scene.world.width}×${scene.world.height} (gravity: ${scene.world.gravity})</p>
            <p><strong>Characters:</strong> ${scene.characters.length}</p>
            <p><strong>Platforms:</strong> ${scene.platforms.length}</p>
            ${scene.background ? `<p><strong>Background:</strong> ${scene.background.fit}</p>` : ''}
        </div>
        
        ${scene.background?.imageUrl ? 
          `<div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${scene.background.imageUrl}'); background-size: ${scene.background.fit}; opacity: 0.3; z-index: -1;"></div>` : ''
        }
        
        <div style="position: relative; width: ${Math.min(800, scene.world.width)}px; height: ${Math.min(600, scene.world.height)}px; border: 2px solid #666; background: rgba(0,50,100,0.2);">
            ${scene.platforms.map((p, i) => 
              `<div class="platform" style="left: ${p.x * 0.6}px; top: ${p.y * 0.6}px; width: ${p.w * 0.6}px; height: ${p.h * 0.6}px;"></div>`
            ).join('')}
            
            ${scene.characters.map((c, i) => 
              `<div class="character" style="left: ${c.spawn.x * 0.6}px; top: ${(c.spawn.y - 32) * 0.6}px; width: 24px; height: 32px;" title="${c.name}"></div>`
            ).join('')}
        </div>
        
        <div class="controls">
            <div>🎯 This is a demo preview of your generated game</div>
            <div>⚡ In the real version, this would be a playable Phaser 3 game</div>
            <div>🕹️ Controls: Arrow keys, Space to jump, R to reset</div>
        </div>
    </div>
    
    <script>
        // Listen for reset messages from parent
        window.addEventListener('message', (e) => {
            if (e.data && e.data.type === 'reset') {
                location.reload();
            }
        });
        
        // Focus this iframe when loaded
        window.focus();
        
        // Prevent parent page from scrolling on arrow keys
        document.addEventListener('keydown', (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
                e.preventDefault();
            }
        });
    </script>
</body>
</html>`;
  }

  // Reset game and stop playing
  function handleReset() {
    if (iframeRef.current && gameState.bundleUrl) {
      iframeRef.current.contentWindow?.postMessage({ type: 'reset' }, '*');
    }
  }

  // Start/stop playing
  function togglePlay() {
    setIsPlaying(!isPlaying);
    if (!isPlaying && iframeRef.current) {
      // Focus the iframe when starting to play
      setTimeout(() => {
        iframeRef.current?.focus();
        iframeRef.current?.contentWindow?.focus();
      }, 100);
    }
  }

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (gameState.bundleUrl) {
        URL.revokeObjectURL(gameState.bundleUrl);
      }
    };
  }, [gameState.bundleUrl]);

  const Section = ({ title, children }) => (
    <div className="p-3 border-b border-neutral-100">
      <h3 className="text-sm font-semibold text-neutral-700 mb-3">{title}</h3>
      {children}
    </div>
  );

  return (
    <div>
      {/* Generation Section */}
      <Section title="Generate Game">
        <div className="space-y-3">
          {/* Requirements Check */}
          {!canGenerate && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="text-sm font-medium text-amber-800">⚠️ Missing Requirements</div>
              <div className="text-xs text-amber-700 mt-1">
                Need at least 1 character to generate a game.
              </div>
            </div>
          )}
          
          {/* Asset Validation Errors */}
          {assetErrors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-sm font-medium text-red-800">❌ Asset Issues</div>
              {assetErrors.map((error, i) => (
                <div key={i} className="text-xs text-red-700 mt-1">{error}</div>
              ))}
            </div>
          )}

          {/* Generation Button */}
          <button
            onClick={handleGenerateGame}
            disabled={!canGenerate || gameState.status === "generating" || assetErrors.length > 0}
            className="w-full px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {gameState.status === "generating" ? "Generating Game..." : "🚀 Generate Game"}
          </button>

          {/* Progress */}
          {gameState.status === "generating" && gameState.progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-600">{gameState.progress.message}</span>
                <span className="text-neutral-500">{gameState.progress.progress}%</span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${gameState.progress.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error State */}
          {gameState.status === "failed" && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-sm font-medium text-red-800">❌ Generation Failed</div>
              <div className="text-xs text-red-700 mt-1">{gameState.error}</div>
            </div>
          )}

          {/* Success State */}
          {gameState.status === "ready" && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-sm font-medium text-green-800">✅ Game Generated!</div>
              <div className="text-xs text-green-700 mt-1">Your game is ready to play.</div>
            </div>
          )}
        </div>
      </Section>

      {/* Play Section */}
      {gameState.status === "ready" && (
        <Section title="Play Game">
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={togglePlay}
                className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                  isPlaying 
                    ? "bg-red-600 text-white hover:bg-red-700" 
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {isPlaying ? "⏹️ Stop" : "▶️ Play"}
              </button>
              
              <button
                onClick={handleReset}
                disabled={!isPlaying}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Reset game"
              >
                🔄
              </button>
            </div>

            {isPlaying && (
              <div className="text-xs text-neutral-600 space-y-1">
                <div>🎮 Game is running in the iframe below</div>
                <div>🕹️ Use Arrow keys to move, Space to jump, R to reset</div>
                <div>💡 Click inside the game area to focus controls</div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Game Stats */}
      {gameState.status === "ready" && (
        <Section title="Game Info">
          <div className="text-xs text-neutral-600 space-y-1">
            <div>📦 Bundle: {gameState.bundleUrl ? "Generated" : "None"}</div>
            <div>🆔 Job ID: {gameState.jobId}</div>
            <div>🌍 World: {world.width}×{world.height}</div>
            <div>👥 Characters: {characters.length}</div>
          </div>
        </Section>
      )}

      {/* Iframe Game Player */}
      {isPlaying && gameState.bundleUrl && (
        <div className="fixed inset-4 bg-black rounded-lg shadow-2xl border-4 border-gray-800 z-50 flex flex-col">
          <div className="flex items-center justify-between p-2 bg-gray-800 text-white">
            <div className="text-sm font-medium">🎮 Your Game</div>
            <button
              onClick={() => setIsPlaying(false)}
              className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
            >
              ✕ Close
            </button>
          </div>
          <iframe
            ref={iframeRef}
            src={gameState.bundleUrl}
            className="flex-1 border-0"
            title="Generated Game"
            sandbox="allow-scripts allow-same-origin"
            onLoad={() => {
              // Focus the iframe when it loads
              setTimeout(() => {
                iframeRef.current?.focus();
                iframeRef.current?.contentWindow?.focus();
              }, 100);
            }}
          />
        </div>
      )}
    </div>
  );
}
