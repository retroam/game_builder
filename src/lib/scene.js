/**
 * Scene model and guardrails for Phaser generator.
 * Converts UI state into the SCENE contract expected by game.js.
 */
import { clamp } from "./canvas.js";

export const DEFAULTS = {
  world: { width: 1280, height: 720, gravity: 1400 },
  controls: { arrows: true, spaceJump: true, resetKey: "R", shootKey: "X" },
};

export const CONSTRAINTS = {
  bgMaxMB: 1.5, // JPEG/WebP preferred
  spriteMaxMB: 1.0,
  maxCharacters: 3,
  canvasMax: { w: 1280, h: 720 },
  gravity: { min: 100, max: 3000 },
  moveSpeed: { min: 50, max: 800 },
  jumpVelocity: { min: 100, max: 1500 },
  projectileSpeed: { min: 100, max: 2000 },
  cooldownMs: { min: 80, max: 2000 },
};

export function toScene({ characters, platforms, background, world = {}, controls }) {
  const W = world.width ?? DEFAULTS.world.width;
  const H = world.height ?? DEFAULTS.world.height;

  const chars = (characters || []).slice(0, CONSTRAINTS.maxCharacters).map((c, i) => ({
    id: c.id || `char-${i + 1}`,
    name: c.name || "Hero",
    imageUrl: c.imageUrl, // data URI or remote URL (CORS-safe)
    collider: c.collider
      ? {
          w: clamp(c.collider.w, 8, 256),
          h: clamp(c.collider.h, 8, 256),
          offsetX: c.collider.offsetX || 0,
          offsetY: c.collider.offsetY || 0,
        }
      : undefined,
    abilities: {
      // Attributes-first contract (booleans) with numeric defaults preserved for engine runtime.
      ...(typeof c.abilities?.jump === "boolean" ? { jump: !!c.abilities.jump } : {}),
      ...(typeof c.abilities?.slide === "boolean" ? { slide: !!c.abilities.slide } : {}),
      ...(typeof c.abilities?.punch === "boolean" ? { punch: !!c.abilities.punch } : {}),

      // Engine-tuned numeric defaults (UI no longer exposes sliders)
      moveSpeed: clamp(c.abilities?.moveSpeed ?? 180, CONSTRAINTS.moveSpeed.min, CONSTRAINTS.moveSpeed.max),
      jumpVelocity: clamp(c.abilities?.jumpVelocity ?? 420, CONSTRAINTS.jumpVelocity.min, CONSTRAINTS.jumpVelocity.max),

      // Optional ranged attack (unchanged)
      ...(c.abilities?.shoot
        ? {
            shoot: {
              projectileSpeed: clamp(
                c.abilities.shoot.projectileSpeed,
                CONSTRAINTS.projectileSpeed.min,
                CONSTRAINTS.projectileSpeed.max
              ),
              cooldownMs: clamp(c.abilities.shoot.cooldownMs, CONSTRAINTS.cooldownMs.min, CONSTRAINTS.cooldownMs.max),
            },
          }
        : {}),
    },
    spawn: {
      x: clamp(c.spawn?.x ?? 100, 0, W),
      y: clamp(c.spawn?.y ?? H - 200, 0, H),
    },
  }));

  return {
    world: {
      width: W,
      height: H,
      gravity: clamp(world.gravity ?? DEFAULTS.world.gravity, CONSTRAINTS.gravity.min, CONSTRAINTS.gravity.max),
    },
    background: {
      imageUrl: background?.imageUrl,
      fit: background?.fit || "cover",
    },
    platforms: (platforms || []).map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h })),
    targets: background?.targets || [],
    characters: chars,
    controls: controls || DEFAULTS.controls,
  };
}

/**
 * Utility: compute rough size of a data URI (bytes) to enforce size limits.
 */
export function dataUriBytes(dataUri) {
  if (!dataUri || typeof dataUri !== "string") return 0;
  // strip metadata "data:*/*;base64,"
  const base64 = dataUri.split(",")[1] || "";
  // Each 4 base64 chars encode 3 bytes
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Utility: enforce asset size constraints (returns an array of violations).
 */
export function validateAssets({ background, characters }) {
  const errs = [];
  const MB = (n) => (n / (1024 * 1024)).toFixed(2);

  if (background?.imageUrl?.startsWith("data:")) {
    const sz = dataUriBytes(background.imageUrl);
    const max = CONSTRAINTS.bgMaxMB * 1024 * 1024;
    if (sz > max) errs.push(`Background ${MB(sz)} MB exceeds limit ${CONSTRAINTS.bgMaxMB} MB`);
  }

  (characters || []).forEach((c, i) => {
    if (c.imageUrl?.startsWith("data:")) {
      const sz = dataUriBytes(c.imageUrl);
      const max = CONSTRAINTS.spriteMaxMB * 1024 * 1024;
      if (sz > max) errs.push(`Character #${i + 1} ${MB(sz)} MB exceeds limit ${CONSTRAINTS.spriteMaxMB} MB`);
    }
  });

  if ((characters || []).length > CONSTRAINTS.maxCharacters) {
    errs.push(`Too many characters: ${(characters || []).length} (max ${CONSTRAINTS.maxCharacters})`);
  }

  return errs;
}
