# GPT-5 Hackathon Task

Goal: Build a minimal app that turns a user’s sketch into a playable web game in minutes.

Assumptions (MVP):
- One level, 1–2 characters, 2D platformer-lite.
- Desktop Chrome/Edge/Firefox; keyboard only (no mobile).
- Static bundle preferred; server runtime used only as fallback/demo.

## MVP Flow
- Draw character shapes on a simple canvas.
- Enter a 1-line prompt to generate a background.
- Assign basic abilities to a selected character.
- Click “Generate Game” and toggle “Play” to try it in-canvas.

De-scopes (to hit demo):
- No remappable controls, no save/gallery, no multi-scene.
- Background “variant pick” optional; single best image acceptable.

## UI (Simple)
- Canvas centered; left toolbar: Select, Brush, Erase, Undo/Redo, Zoom.
- Right sidebar with two tabs:
  - Edit: Background prompt + button; Character list + Abilities.
  - Play: “Generate Game” button, short status, Play toggle.
- Minimal mode toggle: Edit ↔ Play (or just the Play toggle).
- Basic snap-to-grid (on/off) and bounding-box handles.
- Iframe focus hint: when Play is on, auto-focus the iframe; show a tip if keys don’t respond; prevent page scroll on arrows/space.

## Abilities (MVP)
- Move Left/Right: speed slider maps to `moveSpeed` (px/s).
- Jump: height slider maps to `jumpVelocity` (px/s upward).
- Optional Shoot (if time): `projectileSpeed` (px/s) + `cooldownMs`.
- Controls fixed to Arrow keys + Space (no custom mapping).

## Background (Simple)
- 1-line text prompt input.
- Generate once → prefer single image; up to 2 variants if trivial.
- Output: background `imageUrl` (PNG/JPEG, 16:9, ~1280×720 recommended).
- Recent prompt history: last 1 item only (client-side).

## Generation & Runtime (Minimal)
- Primary engine: “pygame-web (via pygbag)”.
- Build: generator produces `main.py` + assets; build with `pygbag` to a static web bundle (`index.html` + WASM + assets).
- Async API with job queue: return `id` on submit; poll for status and `bundleUrl`.
- Status values: `queued` → `building` → `ready` | `failed` (no streaming logs).

### Alternative Runtime (In Scope)
- e2b server runtime: launch a short-lived Python server (FastAPI) in e2b for preview.
- Endpoints: start runtime → returns `runtimeUrl`; stop runtime; status.
- Client: load a minimal web client in iframe that talks to the runtime (HTTP/SSE). Use only if static bundle is unavailable or for demo purposes.

## Play Mode
- In-canvas iframe loads `bundleUrl`.
- Quick “Reset” button to restart the level.
- Keyboard focus captured by the iframe; show tooltip if focus lost.

## Deployment
- Main app backend can run on Modal (Python FastAPI), exposing the `/api/games` build endpoint and proxying to e2b.
- Frontend as static hosting (e.g., Vercel/Netlify) or served by the Modal app.
- Store build artifacts on temporary storage (e2b artifact URL or object store) and reference via `bundleUrl`.
- Set COOP/COEP and compression (gzip/brotli) for WASM performance; long cache headers on immutable artifacts.
- Artifacts expire after 24–72h (configurable TTL); serve via signed URLs if needed.

## Acceptance Criteria
- Create at least one character and assign Move + Jump (with visible effect on speed/jump).
- Background image generated and used as level background.
- Submitting a build returns a job `id`; polling reaches `ready` and provides `bundleUrl` within ~60–90s wall-clock.
- Play mode runs in-app; Arrow keys move, Space jumps; Reset re-initializes the level.
- Alternative path: start e2b runtime and load client in iframe → character responds to controls.

## Nice-to-Haves (Time Permitting)
- Simple Layers list: reorder + hide/show.
- Parallax toggle with 2 depth layers.
- Simple collider editor: rectangle only.

---

## Data Contracts

### Character
```jsonc
{
  "id": "char-1",
  "name": "Hero",
  "imageUrl": "https://cdn/.../hero.png", // or imageData: data: URI (PNG)
  "collider": [ { "x": 10, "y": 22, "w": 48, "h": 64 } ],
  "abilities": {
    "moveSpeed": 180,           // px/s
    "jumpVelocity": 420,        // px/s upward
    "shoot": {                  // optional
      "projectileSpeed": 600,   // px/s
      "cooldownMs": 300
    }
  }
}
```

### POST /api/games (submit build)
Request body
```jsonc
{
  "characters": [ /* Character[] as above */ ],
  "background": { "imageUrl": "https://cdn/.../bg.png", "prompt": "sunset hills" },
  "grid": { "enabled": true, "size": 8 },
  "engine": "pygbag" // or "e2b" fallback
}
```
Response
```jsonc
{ "id": "job_123", "status": "queued" }
```

### GET /api/games/:id (poll status)
Response
```jsonc
{
  "id": "job_123",
  "status": "queued" | "building" | "ready" | "failed",
  "bundleUrl": "https://cdn/.../index.html", // present when ready
  "etaSeconds": 30,                            // optional
  "error": "build failed: ..."                // on failure
}
```

### Generator Output
- Files: `main.py`, `assets/characters/<id>.png`, `assets/bg.png`.
- Physics: simple gravity, ground plane, horizontal accel; jump only when on ground.
- Controls: ArrowLeft/ArrowRight, Space; `R` to reset (and a UI Reset button).

## Build Orchestration
- Queue on submit; immediate response with `id`.
- Timeouts: queue wait ≤ 15s; build ≤ 90s; 1 retry on transient failure.
- Logs stored server-side; return short `error` string only.
- Artifact hosting: object store/CDN; immutable URLs with cache headers; TTL 24–72h.

## Constraints & Guardrails
- Canvas export target: up to 1280×720; DPR-aware; PNG with alpha.
- Image limits: ≤ 1 MB per PNG; ≤ 3 character images for MVP.
- CORS restricted to frontend origin; rate limit submits per IP.
- No PII in payloads; prompts logged with redaction if stored.

## Testing Strategy (Minimal)
- Unit: abilities → codegen mapping; collider conversion.
- Integration: build with stub assets (no external model calls).
- Smoke: load WASM bundle headlessly; send keys and assert movement.
