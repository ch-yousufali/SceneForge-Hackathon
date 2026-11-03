# SceneForge

Text → 3D blockout for indie game developers. Type a short scene description, get a structured 3D layout of primitive shapes (boxes, cylinders, cones) plus a style direction (lighting mood, palette, era) — rendered live in the browser with Three.js.

Built with Next.js, Three.js, and the Claude API.

## Getting started

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000.

If no API key is set, the app still runs — it returns a hand-built fallback scene so you can see the full pipeline.

## Features

- Text → 3D blockout with style direction (mood, palette, era, lights, fog)
- Six one-click preset prompts
- Orbit / zoom / pan, auto-framing, hover labels, grid toggle
- Glowing (emissive) objects cast local light
- Export to **.glb** (opens in Unity, Godot, Unreal, Blender), export/copy scene JSON, save PNG screenshot
- Recent-scene history saved in the browser, one-click regenerate for variations
- Per-IP rate limiting on the generate endpoint for public deployments

## How it works

1. You type a scene description (or pick a preset).
2. `POST /api/generate` sends it to the Claude API, using structured outputs to constrain the response to the scene JSON schema.
3. The response is validated field-by-field and sanitized (bad fields fall back to safe defaults) before being sent to the client.
4. `SceneViewer` renders each object as a Three.js primitive with the style's colors, lights, and fog, with orbit controls to look around.

## API key setup

Set `ANTHROPIC_API_KEY` in `.env.local`. Defaults to `claude-opus-5-5` with structured outputs (schema-guaranteed JSON) at `low` effort for fast turnaround.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_MODEL` | Override the model |
| `SCENEFORGE_EFFORT` | `low` (default), `medium`, or `high` — higher is slower but more detailed |
| `SCENEFORGE_RATE_LIMIT` | AI generations allowed per IP per minute (default `10`; best-effort, per server instance) |
| `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` | Use a proxy such as OpenRouter (structured outputs are skipped there; output is still validated) |

## Project structure

- `src/app/api/generate/route.ts` — Claude API call + JSON validation
- `src/lib/scene.ts` — types, JSON schema, validation/sanitization, fallback scene, preset prompts
- `src/lib/rateLimit.ts` — in-memory per-IP rate limiter
- `src/components/StylePanel.tsx` — palette, lights and object list
- `tests/` — unit tests (`npm test`, Node's built-in runner)
- `src/components/SceneViewer.tsx` — Three.js renderer, camera framing, GLB export
- `src/app/page.tsx` — main UI (prompt, presets, style panel, viewport)
