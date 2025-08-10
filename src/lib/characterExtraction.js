/**
 * Character extraction utilities - convert canvas frames to game character data
 */
import { canvasToBlob } from "./canvas.js";

/**
 * Extract character data from canvas frames
 * @param {HTMLCanvasElement[]} frames - Array of canvas frames
 * @param {number} currentFrame - Currently selected frame index  
 * @param {object} options - Extraction options
 * @returns {Promise<object>} Character data object
 */
export async function extractCharacterFromFrames(frames, currentFrame = 0, options = {}) {
  if (!frames || frames.length === 0) {
    throw new Error("No frames available for character extraction");
  }

  const {
    name = "Character",
    abilities = {
      jump: true,
      slide: false,
      punch: false,
      moveSpeed: 180,
      jumpVelocity: 420
    },
    spawn = { x: 100, y: 520 }
  } = options;

  // Use the current frame or first frame as the character sprite
  const frame = frames[currentFrame] || frames[0];
  const dataUrl = frame.toDataURL("image/png");

  // Calculate collider bounds based on canvas content
  const collider = calculateColliderBounds(frame);

  // Generate unique ID
  const id = `char_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  return {
    id,
    name,
    imageUrl: dataUrl,
    collider,
    abilities,
    spawn,
    extractedAt: new Date().toISOString(),
    frameData: {
      totalFrames: frames.length,
      extractedFrame: currentFrame,
      dimensions: { w: frame.width, h: frame.height }
    }
  };
}

/**
 * Calculate optimal collider bounds by finding the bounding box of non-transparent pixels
 */
function calculateColliderBounds(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  let minX = canvas.width, minY = canvas.height;
  let maxX = 0, maxY = 0;
  let hasContent = false;

  // Find bounding box of non-transparent pixels
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const index = (y * canvas.width + x) * 4;
      const alpha = data[index + 3];
      
      if (alpha > 0) { // Non-transparent pixel
        hasContent = true;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  // If no content, use full canvas size
  if (!hasContent) {
    return {
      w: Math.max(24, canvas.width),
      h: Math.max(32, canvas.height),
      offsetX: 0,
      offsetY: 0
    };
  }

  // Add some padding and ensure minimum size
  const padding = 2;
  const width = Math.max(16, maxX - minX + 1 + padding * 2);
  const height = Math.max(24, maxY - minY + 1 + padding * 2);
  
  // Calculate offset to center the collider on the sprite
  const offsetX = Math.max(0, Math.floor((canvas.width - width) / 2));
  const offsetY = Math.max(0, Math.floor((canvas.height - height) / 2));

  return {
    w: width,
    h: height,
    offsetX,
    offsetY
  };
}

/**
 * Validate character data before adding to the game
 */
export function validateCharacterData(character) {
  const errors = [];

  if (!character.name || character.name.trim().length === 0) {
    errors.push("Character name is required");
  }

  if (character.name && character.name.length > 50) {
    errors.push("Character name too long (max 50 characters)");
  }

  if (!character.imageUrl) {
    errors.push("Character image is required");
  }

  if (character.imageUrl && !character.imageUrl.startsWith("data:image/")) {
    errors.push("Invalid image data format");
  }

  if (!character.collider || character.collider.w < 8 || character.collider.h < 8) {
    errors.push("Character collider too small (minimum 8x8)");
  }

  if (!character.abilities) {
    errors.push("Character abilities are required");
  }

  if (character.abilities) {
    if (typeof character.abilities.moveSpeed !== "number" || character.abilities.moveSpeed < 10 || character.abilities.moveSpeed > 1000) {
      errors.push("Invalid move speed (must be 10-1000)");
    }
    
    if (typeof character.abilities.jumpVelocity !== "number" || character.abilities.jumpVelocity < 50 || character.abilities.jumpVelocity > 2000) {
      errors.push("Invalid jump velocity (must be 50-2000)");
    }
  }

  return errors;
}

/**
 * Create a preview image from character data (smaller version for UI)
 */
export function createCharacterPreview(character, size = 64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      
      // Fill with transparent checkerboard background
      const checkerSize = 4;
      for (let y = 0; y < size; y += checkerSize) {
        for (let x = 0; x < size; x += checkerSize) {
          if ((Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2 === 0) {
            ctx.fillStyle = "#f0f0f0";
            ctx.fillRect(x, y, checkerSize, checkerSize);
          }
        }
      }
      
      // Draw character centered
      ctx.imageSmoothingEnabled = false;
      const scale = Math.min(size / img.width, size / img.height);
      const scaledW = img.width * scale;
      const scaledH = img.height * scale;
      const x = (size - scaledW) / 2;
      const y = (size - scaledH) / 2;
      
      ctx.drawImage(img, x, y, scaledW, scaledH);
      
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = character.imageUrl;
  });
}

/**
 * Export character as JSON file for sharing/backup
 */
export function exportCharacterAsJSON(character) {
  const exportData = {
    ...character,
    exportedAt: new Date().toISOString(),
    version: "1.0"
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `${character.name.replace(/[^a-zA-Z0-9]/g, "_")}.character.json`;
  a.click();
  
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}