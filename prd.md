# SceneForge — Product Requirements Document

**Product:** SceneForge — text-to-3D scene blockout for game pre-production
**Author:** Yousuf Ali (solo)
**Status:** v1.0 — Hackathon release
**Last updated:** November 2026

---

## 1. Summary

SceneForge turns a one-line scene description into an interactive 3D blockout in seconds. A developer types something like *"dark forest clearing with ancient ruins, moonlight"* and gets back a laid-out scene built from simple primitives (boxes, cylinders, cones, spheres, planes), along with a style direction: lighting mood, color palette, era, and fog. The result renders live in the browser and can be orbited, screenshotted, and exported as JSON.

SceneForge does not generate final art assets. It is a fast **blocking and mood tool** for the earliest stage of level and environment design.

## 2. Problem

Early pre-production of a game scene is slow and repetitive:

- Developers spend hours dragging placeholder objects around an engine just to test whether a layout idea works.
- Mood exploration (lighting, palette, atmosphere) usually waits until after layout is done, so composition and mood are rarely judged together.
- Small and solo teams lack a dedicated environment artist to sketch quick concepts, and written descriptions are hard to share and critique.

The result is fewer ideas explored, later feedback, and wasted engine time on layouts that get thrown away.

## 3. Goals and Non-Goals

### Goals
1. Go from a text idea to a viewable 3D layout in **under 30 seconds**.
2. Deliver **layout and mood together**, so the scene can be judged as a whole.
3. Need **zero setup for viewers**: runs in a browser with no install or account.
4. Produce output developers can **take with them** (structured JSON and screenshots).
5. **Never show a broken state**: every request ends in either a valid scene or a clear message.

### Non-Goals (v1)
- Generating textured meshes, models, or production-ready assets.
- Direct export into Unity, Unreal, or Godot project formats.
- Manually editing individual objects in the viewport.
- User accounts, cloud saving, or collaboration.

## 4. Target Users

| Persona | Need | How SceneForge helps |
|---|---|---|
| **Indie game developer** (solo or small team) | Quickly test level ideas without an environment artist | Instant blockouts to iterate on before building in-engine |
| **Level / environment designer** | Explore composition and mood options fast | Many variations per hour; compare them side by side in session history |
| **3D / concept artist** | A spatial and color starting point for concept work | Screenshots and palettes to use as reference |
| **Game jam participant** | Move from theme to playable space in minutes | Presets and fast turnaround fit jam timelines |

## 5. User Stories

- As a developer, I want to **describe a scene in plain English** and see it in 3D, so I can judge an idea without building it by hand.
- As a designer, I want to **see the lighting mood and palette** next to the layout, so I can judge atmosphere and composition together.
- As a user, I want to **orbit, zoom, and pan** the scene, so I can check it from several angles.
- As a user, I want to **hover over an object to see what it is**, so I can tell primitives apart.
- As a developer, I want to **export the scene as JSON**, so I can rebuild the layout in my engine.
- As a user, I want to **take a screenshot** of the view, so I can share it with my team or use it as reference.
- As a first-time visitor, I want **one-click preset prompts**, so I can try the tool without thinking of a description.
- As a user, I want to **switch between scenes I generated this session**, so I can compare variations.

## 6. Functional Requirements

### 6.1 Scene generation
| ID | Requirement | Priority |
|---|---|---|
| F1 | Accept a free-text scene description of up to 1,000 characters. | Must |
| F2 | Return a structured scene: title, one-line description, style direction, and 8–24 objects. | Must |
| F3 | Each object has a name, shape, position, size, rotation, color, opacity, and a glow flag. | Must |
| F4 | Style direction includes lighting mood, a 3–5 color palette, era, ambient/key light color and intensity, optional fog, and ground color. | Must |
| F5 | Validate and sanitize every generated scene (clamp values, fix bad colors, cap object count) before it is shown. | Must |
| F6 | If generation fails or returns unusable data, show a demo scene with a clear notice instead of an error screen. | Must |
| F7 | Run in demo mode with a built-in scene when no API key is configured. | Should |

### 6.2 3D viewport
| ID | Requirement | Priority |
|---|---|---|
| V1 | Render each object as a primitive with its color, lighting, shadows, and fog. | Must |
| V2 | Orbit, zoom, and pan camera controls. | Must |
| V3 | Frame the camera on the generated scene automatically. | Must |
| V4 | Glowing objects (fires, lanterns, neon, crystals) emit local light. | Should |
| V5 | Show object names on hover. | Should |
| V6 | Toggle the reference grid on and off; reset the camera view. | Should |
| V7 | Show a clear fallback message if the browser doesn't support WebGL. | Must |

### 6.3 Workflow and output
| ID | Requirement | Priority |
|---|---|---|
| W1 | At least six one-click preset prompts covering different moods and genres. | Must |
| W2 | Style panel showing the palette (click a swatch to copy its hex), lights, tags, and object count. | Must |
| W3 | Collapsible object list showing shape, color, and position. | Should |
| W4 | Export the scene as a `.json` file and copy it to the clipboard. | Must |
| W5 | Save the current view as a `.png` screenshot. | Should |
| W6 | Session history of up to 12 recent scenes, switchable with one click. | Should |
| W7 | Ctrl/⌘ + Enter to generate. | Could |

## 7. Non-Functional Requirements

- **Performance:** A typical generation finishes in under 30 seconds, and the viewport holds a smooth frame rate on a mid-range laptop with up to 60 objects.
- **Reliability:** No request ends in a blank or broken viewport. Invalid output is caught on the server.
- **Security:** API keys stay server-side and are never sent to the browser. User input is length-limited.
- **Compatibility:** Works in current Chrome, Edge, Firefox, and Safari with WebGL enabled. The layout adapts to tablet and desktop widths.
- **Configurability:** The model provider endpoint and model can be changed through environment variables.

## 8. Scene Data Format

Exported JSON follows this shape (abridged):

```json
{
  "title": "Moonlit Ruins",
  "description": "A hushed clearing where broken columns catch cold moonlight.",
  "style": {
    "lightingMood": "moonlit",
    "colorPalette": ["#1a2a4a", "#3b5e7d", "#8aa5b8"],
    "era": "ancient",
    "ambientLightColor": "#4a6a8a", "ambientIntensity": 0.7,
    "sunLightColor": "#b8ccdd", "sunIntensity": 1.1,
    "fogColor": "#1c2638", "fogDensity": 0.03,
    "groundColor": "#2e3a2a"
  },
  "objects": [
    {
      "id": "obj-0", "name": "broken column", "shape": "cylinder",
      "position": [-2, 1, 1.5], "scale": [0.5, 2, 0.5], "rotation": [0, 0, 0],
      "color": "#7a7a72", "opacity": 1, "emissive": false
    }
  ]
}
```

**Conventions:** 1 unit ≈ 1 meter. `position` is the object's center. `scale` is `[width, height, depth]` for boxes, `[radius, height, radius]` for cylinders and cones, per-axis radii for spheres, and `[width, –, depth]` for flat planes. Rotation is in radians.

## 9. Technical Approach

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), React, Tailwind CSS |
| 3D rendering | Three.js with orbit controls, soft shadows, exponential fog, and ACES tone mapping |
| Backend | Next.js API route (`POST /api/generate`) |
| Layout generation | Large language model through the Anthropic API, constrained to a strict JSON schema |
| Validation | Server-side schema check plus per-field sanitization, with a built-in fallback scene |
| Hosting | Vercel (or any Node.js host) |

**Request flow:** prompt → API route → schema-constrained layout generation → validation and sanitization → JSON response → Three.js scene build → camera auto-framing.

## 10. Success Metrics

| Metric | Target |
|---|---|
| Time from prompt to rendered scene | < 30 s (median) |
| Requests that end in a valid AI-generated scene (no fallback) | ≥ 95% |
| Generated scenes that match the prompt's mood (manual review of presets) | 6 of 6 presets |
| First-time visitor reaches a rendered scene | ≤ 1 click (via preset) |

## 11. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Generated output is malformed or inconsistent | Schema-constrained output, server-side validation and sanitization, and a fallback scene |
| Objects float, overlap, or sit outside the scene | Explicit spatial conventions in the generation instructions; position and size clamping |
| Slow responses during a live demo | Lower reasoning effort by default, a loading state, and presets for quick retries |
| Scope creep into asset generation | Hard rule: primitives only in v1 |
| WebGL unavailable on the viewer's device | Detect the failure and show a clear message |

## 12. Future Roadmap

1. **Engine export:** glTF export, plus Unity and Godot importer scripts that read the JSON format.
2. **Edit and refine:** select, move, and recolor objects; follow-up prompts like *"add a bridge over the river"*.
3. **Variations:** generate three layouts per prompt and compare them side by side.
4. **Persistence and sharing:** save scenes and share them by link.
5. **Reference input:** start from a sketch or mood-board image.

## 13. Demo Plan

- [ ] Screenshot of the app with a generated scene (use the built-in **Screenshot** button)
- [ ] 60–90 second screen recording: type a prompt → scene renders → orbit → show style panel → export JSON
- [ ] Before/after: empty viewport vs. generated blockout

## 14. Links

- Source code: *(add GitHub link)*
- Live demo: *(add Vercel link)*
