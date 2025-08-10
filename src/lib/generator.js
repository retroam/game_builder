/**
 * src/lib/generator.js
 *
 * Deterministic generator: DesignJSON -> BuildManifest (static runtime).
 *
 * This produces a minimal static BuildManifest suitable for the local StaticRunner
 * and demo: `index.html` + `game.js`. For fast demos we load Phaser from CDN.
 *
 * NOTE: This generator is intentionally conservative:
 * - clamps numeric ranges
 * - produces a single-character player if none provided
 * - inlines no external assets (it uses image URLs from design if present; for demo they
 *   can be remote CDN URLs -- in production you may want to inline or validate CORS)
 */

function stableStringify(obj) {
  // deterministic JSON stringify with sorted keys
  return JSON.stringify(obj, Object.keys(obj).sort(), 2);
}

function clamp(n, a, b) {
  if (typeof n !== 'number' || Number.isNaN(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function ensureScene(design) {
  // Map incoming DesignJSON to SCENE shape expected by the engine template.
  // design.canvas {width,height}, design.entities[] -> platforms, characters, targets.
  const canvas = design.canvas || { width: 1280, height: 720 };
  const defaults = {
    world: { width: canvas.width || 1280, height: canvas.height || 720, gravity: 1400 },
    background: { imageUrl: '', fit: 'cover' },
    platforms: [],
    targets: [],
    characters: [],
    controls: { arrows: true, spaceJump: true, resetKey: 'R', shootKey: 'X' }
  };

  const scene = Object.assign({}, defaults);
  // Map entities
  (design.entities || []).forEach((e) => {
    const type = e.type;
    if (type === 'platform') {
      // rectangle platforms only
      if (e.shape === 'rect' && typeof e.w === 'number' && typeof e.h === 'number') {
        scene.platforms.push({ x: e.x, y: e.y, w: e.w, h: e.h });
      } else if (e.shape === 'line' && typeof e.x2 === 'number' && typeof e.y2 === 'number') {
        // line -> thin platform
        const w = Math.abs(e.x2 - e.x) || 24;
        const h = Math.max(4, Math.abs(e.y2 - e.y) || 4);
        scene.platforms.push({ x: Math.min(e.x, e.x2), y: Math.min(e.y, e.y2), w, h });
      }
    } else if (type === 'coin' || type === 'goal' || type === 'hazard') {
      // targets
      const w = e.w || 28;
      const h = e.h || 28;
      scene.targets.push({ x: e.x, y: e.y, w, h, type: type });
    } else if (type === 'playerSpawn') {
      // spawn point -> character
      const id = e.id || 'char-1';
      const spawn = { x: e.x || 100, y: e.y || 100 };
      const abilities = Object.assign({ moveSpeed: 180, jumpVelocity: 420 }, e.props || {});
      scene.characters.push({
        id,
        name: e.label || 'Hero',
        imageUrl: (e.props && e.props.imageUrl) || '',
        collider: (e.props && e.props.collider) || { w: 48, h: 64, offsetX: 0, offsetY: 0 },
        abilities,
        spawn
      });
    } else if (type === 'enemy') {
      // enemy -> target-like with simple patrol prop; we'll treat as target to allow demo
      const w = e.w || 32, h = e.h || 32;
      scene.targets.push({ x: e.x, y: e.y, w, h, type: 'enemy', props: e.props || {} });
    }
  });

  // If no platforms, create a ground
  if (scene.platforms.length === 0) {
    const H = scene.world.height;
    scene.platforms.push({ x: 0, y: H - 60, w: scene.world.width, h: 60 });
  }

  // Ensure at least one character
  if (scene.characters.length === 0) {
    scene.characters.push({
      id: 'char-1',
      name: 'Hero',
      imageUrl: '',
      collider: { w: 48, h: 64, offsetX: 0, offsetY: 0 },
      abilities: { moveSpeed: 180, jumpVelocity: 420 },
      spawn: { x: 120, y: scene.world.height - 120 }
    });
  }

  return scene;
}

function buildIndexHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Sketch2Play Demo</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    html,body{margin:0;height:100%;background:#0b1220;color:#fff;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial}
    #game{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
    canvas{outline:none;display:block}
    .hint{position:fixed;bottom:8px;left:8px;color:#cbd5e1;font-size:12px}
  </style>
</head>
<body>
  <div id="game"></div>
  <div class="hint">Arrows move • Space jumps • R resets</div>

  <!-- Phaser (CDN for demo) -->
  <script src="https://cdn.jsdelivr.net/npm/phaser@3/dist/phaser.min.js"></script>

  <!-- Game code -->
  <script src="./game.js"></script>

  <script>
    // Parent can instruct reset via postMessage
    window.addEventListener('message', (e) => {
      try {
        if (e.data && e.data.type === 'reset' && window.__levelScene) {
          window.__levelScene.scene.restart();
        }
      } catch (err) { /* ignore */ }
    }, false);
  </script>
</body>
</html>
`;
}

function buildGameJs(scene) {
  // Inline the SCENE data deterministically
  const sceneJson = stableStringify(scene);

  // Minimal engine glue similar to the task example
  return `/* ==== GENERATED BY sketch2play static generator ==== */
const SCENE = ${sceneJson};

(function () {
  const W = SCENE.world.width, H = SCENE.world.height;

  const config = {
    type: Phaser.AUTO,
    width: W,
    height: H,
    parent: 'game',
    backgroundColor: '#0b1220',
    physics: { default: 'arcade', arcade: { gravity: { y: SCENE.world.gravity || 1400 }, debug: false } },
    scene: { preload, create, update }
  };

  const game = new Phaser.Game(config);

  let cursors, keyR, player, platformsGroup, targetsGroup, bulletsGroup, facing = 1, canShootAt = 0;

  function preload() {
    // Pixel texture for primitives
    this.textures.generate('pixel', { data: ['1'], pixelWidth: 1, pixelHeight: 1 });

    // Load background if provided
    if (SCENE.background && SCENE.background.imageUrl) {
      try { this.load.image('bg', SCENE.background.imageUrl); } catch (e) {}
    }

    // Load first character image if present
    if (SCENE.characters && SCENE.characters[0] && SCENE.characters[0].imageUrl) {
      try { this.load.image('hero', SCENE.characters[0].imageUrl); } catch (e) {}
    }
  }

  function create() {
    // Background (best-effort)
    if (this.textures.exists('bg')) {
      const bg = this.add.image(0, 0, 'bg').setOrigin(0,0);
      fitBackground(bg, SCENE.background && SCENE.background.fit ? SCENE.background.fit : 'cover', this.scale.width, this.scale.height);
    }

    // Platforms
    platformsGroup = this.physics.add.staticGroup();
    (SCENE.platforms || []).forEach(p => {
      const x = p.x + (p.w || 100) / 2;
      const y = p.y + (p.h || 24) / 2;
      const s = platformsGroup.create(x, y, 'pixel').setDisplaySize(p.w || 100, p.h || 24);
      s.refreshBody();
      s.setVisible(false);
    });

    // Targets (coins, goals, enemies)
    targetsGroup = this.physics.add.staticGroup();
    (SCENE.targets || []).forEach(t => {
      const s = targetsGroup.create((t.x || 0) + (t.w || 28)/2, (t.y || 0) + (t.h||28)/2, 'pixel').setDisplaySize(t.w || 28, t.h || 28);
      s.refreshBody();
      // color hints by type
      if (t.type === 'coin') s.setTint(0xffd54f);
      if (t.type === 'goal') s.setTint(0x6ee7b7);
      if (t.type === 'hazard') s.setTint(0xff6b6b);
      s.setAlpha(0.95);
    });

    // Player
    const hero = SCENE.characters[0];
    const spawn = hero.spawn || { x: 100, y: H - 120 };
    if (this.textures.exists('hero')) {
      player = this.physics.add.sprite(spawn.x, spawn.y, 'hero');
      if (hero.collider) {
        player.body.setSize(hero.collider.w || 48, hero.collider.h || 64);
        player.setOffset(hero.collider.offsetX || 0, hero.collider.offsetY || 0);
      }
    } else {
      // fallback rectangle
      player = this.physics.add.sprite(spawn.x, spawn.y, 'pixel').setDisplaySize(48, 64);
      player.body.setSize(48, 64);
      player.setTint(0x8b5cf6);
    }
    player.setCollideWorldBounds(true);
    player.setBounce(0);

    // Collisions
    this.physics.add.collider(player, platformsGroup);
    this.physics.add.overlap(player, targetsGroup, (_p, target) => {
      target.destroy();
      const txt = this.add.text(W/2, 48, 'Collected!', { fontFamily: 'system-ui', fontSize: 24, color: '#fff' }).setOrigin(0.5);
      this.time.delayedCall(900, () => txt.destroy());
    });

    // Input
    cursors = this.input.keyboard.createCursorKeys();
    keyR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    // Expose for parent reset
    window.__levelScene = this;

    // Prevent page scrolls
    this.input.keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.LEFT, Phaser.Input.Keyboard.KeyCodes.RIGHT, Phaser.Input.Keyboard.KeyCodes.SPACE]);
  }

  function update(time, delta) {
    const hero = SCENE.characters[0];
    const speed = clamp(hero.abilities && hero.abilities.moveSpeed ? hero.abilities.moveSpeed : 180, 50, 1000);
    const jumpV = -clamp(hero.abilities && hero.abilities.jumpVelocity ? hero.abilities.jumpVelocity : 420, 120, 1500);

    if (cursors.left.isDown) {
      player.setVelocityX(-speed);
      facing = -1; player.setFlipX(true);
    } else if (cursors.right.isDown) {
      player.setVelocityX(speed);
      facing = 1; player.setFlipX(false);
    } else {
      player.setVelocityX(0);
    }

    const grounded = player.body.blocked.down || player.body.touching.down;
    if (Phaser.Input.Keyboard.JustDown(cursors.space) && grounded) {
      player.setVelocityY(jumpV);
    }

    if (Phaser.Input.Keyboard.JustDown(keyR)) {
      this.scene.restart();
      return;
    }
  }

  function fitBackground(img, mode, w, h) {
    try {
      if (!img.texture || !img.texture.getSourceImage) return;
      if (mode === 'stretch') { img.setDisplaySize(w, h); return; }
      const tex = img.texture.getSourceImage();
      const sx = w / tex.width, sy = h / tex.height, s = Math.max(sx, sy);
      img.setScale(s).setPosition(0,0).setOrigin(0,0);
    } catch (e) { /* ignore */ }
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
})();
`;
}

/**
 * Public API:
 * generateBuildManifest(design: DesignJSON) => BuildManifest
 */
function generateBuildManifest(design) {
  const scene = ensureScene(design);

  const files = [
    { path: 'index.html', content: buildIndexHtml() },
    { path: 'game.js', content: buildGameJs(scene) }
  ];

  const manifest = {
    kind: 'web-service',
    runtime: 'static',
    entry: 'index.html',
    start: 'static', // runner-specific; StaticRunner should serve index.html
    files
  };

  return manifest;
}

export { generateBuildManifest };
