export type ShapeType = "box" | "cylinder" | "cone" | "sphere" | "plane";

export interface SceneObject {
  id: string;
  name: string;
  shape: ShapeType;
  /** [x, y, z] — the CENTER of the object. A box of height 2 resting on the ground has y = 1. */
  position: [number, number, number];
  /**
   * box: [width, height, depth]
   * cylinder / cone: [radius, height, radius]
   * sphere: [radiusX, radiusY, radiusZ]
   * plane: [width, ignored, depth] — always laid flat (horizontal)
   */
  scale: [number, number, number];
  rotation?: [number, number, number]; // radians
  color: string; // #rrggbb
  opacity?: number;
  emissive?: boolean;
}

export interface SceneStyle {
  lightingMood: string;
  colorPalette: string[];
  era: string;
  ambientLightColor: string;
  ambientIntensity: number;
  sunLightColor: string;
  sunIntensity: number;
  fogColor?: string;
  fogDensity?: number;
  groundColor: string;
}

export interface SceneData {
  title: string;
  description: string;
  style: SceneStyle;
  objects: SceneObject[];
}

export interface SceneResponse {
  success: boolean;
  scene?: SceneData;
  error?: string;
  warning?: string;
}

export interface PresetPrompt {
  id: string;
  label: string;
  tagline: string;
  /** Preview swatches for the preset card (not sent to the model). */
  colors: string[];
  prompt: string;
}

export const PRESET_PROMPTS: PresetPrompt[] = [
  {
    id: "ruins",
    tagline: "Night · ancient",
    colors: ["#1a2a4a", "#3b5e7d", "#8aa5b8", "#d8f0a0"],
    label: "Moonlit Ruins",
    prompt:
      "dark forest clearing with ancient stone ruins, broken columns, moonlight breaking through the canopy, fireflies, mossy ground",
  },
  {
    id: "cyber-alley",
    tagline: "Neon · sci-fi",
    colors: ["#0d0b1f", "#ff2bd6", "#00e5ff", "#3a3f5c"],
    label: "Cyber Alley",
    prompt:
      "narrow neon-lit alley in a rainy cyberpunk city, holographic signs, steam vents, dumpsters, wet asphalt reflections",
  },
  {
    id: "desert-outpost",
    tagline: "Midday · frontier",
    colors: ["#e8b46a", "#c97a3d", "#8a5a3a", "#f6e3b4"],
    label: "Desert Outpost",
    prompt:
      "sun-scorched desert outpost with crumbling adobe towers, wooden scaffolding, a well, dust storm on the horizon, harsh midday sun",
  },
  {
    id: "ice-cavern",
    tagline: "Cold · underground",
    colors: ["#0b1d2e", "#3fa7d6", "#a6e1fa", "#e6f7ff"],
    label: "Ice Cavern",
    prompt:
      "frozen underground cavern with giant glowing blue crystals, frozen waterfall, scattered ice shards, cold mist",
  },
  {
    id: "sunset-coast",
    tagline: "Sunset · coastal",
    colors: ["#ff8a3d", "#f2c14e", "#3b6e8f", "#5b4a3f"],
    label: "Sunset Coast",
    prompt:
      "tranquil seaside cliff with a lone lighthouse, crashing waves below, warm orange sunset, seagulls, driftwood",
  },
  {
    id: "forge",
    tagline: "Warm · fantasy",
    colors: ["#1c1210", "#ff5a1f", "#ffb347", "#4a4440"],
    label: "Fantasy Forge",
    prompt:
      "ancient dwarven forge interior, massive anvil, glowing molten metal channels, hanging chains, ember-lit haze",
  },
];

export const MAX_OBJECTS = 60;
const SHAPES: ShapeType[] = ["box", "cylinder", "cone", "sphere", "plane"];

/**
 * JSON schema sent to Claude via structured outputs (output_config.format).
 * Every field is required so the model can't omit anything; numeric ranges are
 * enforced in sanitizeScene() since the schema keeps to simple types.
 */
const vec3 = { type: "array", items: { type: "number" } };
const hex = { type: "string", description: "hex color, #rrggbb" };

export const SCENE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "style", "objects"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    style: {
      type: "object",
      additionalProperties: false,
      required: [
        "lightingMood",
        "colorPalette",
        "era",
        "ambientLightColor",
        "ambientIntensity",
        "sunLightColor",
        "sunIntensity",
        "fogColor",
        "fogDensity",
        "groundColor",
      ],
      properties: {
        lightingMood: { type: "string" },
        colorPalette: { type: "array", items: hex },
        era: { type: "string" },
        ambientLightColor: hex,
        ambientIntensity: { type: "number" },
        sunLightColor: hex,
        sunIntensity: { type: "number" },
        fogColor: { anyOf: [hex, { type: "null" }] },
        fogDensity: { anyOf: [{ type: "number" }, { type: "null" }] },
        groundColor: hex,
      },
    },
    objects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "shape", "position", "scale", "rotation", "color", "opacity", "emissive"],
        properties: {
          name: { type: "string" },
          shape: { type: "string", enum: SHAPES },
          position: vec3,
          scale: vec3,
          rotation: vec3,
          color: hex,
          opacity: { type: "number" },
          emissive: { type: "boolean" },
        },
      },
    },
  },
};

function isNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function toVec3(v: unknown): [number, number, number] | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const [a, b, c] = v;
  return isNum(a) && isNum(b) && isNum(c) ? [a, b, c] : null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Accepts #rgb or #rrggbb; returns normalized #rrggbb or null. */
function toHex(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    return ("#" + [...t.slice(1)].map((c) => c + c).join("")).toLowerCase();
  }
  return null;
}

function sanitizeObject(obj: unknown, index: number): SceneObject | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const shape = SHAPES.includes(o.shape as ShapeType) ? (o.shape as ShapeType) : "box";
  const p = toVec3(o.position) ?? [0, 0, 0];
  const s = toVec3(o.scale) ?? [1, 1, 1];
  const r = toVec3(o.rotation) ?? [0, 0, 0];

  return {
    id: `obj-${index}`,
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 60) : `Object ${index + 1}`,
    shape,
    position: [clamp(p[0], -40, 40), clamp(p[1], -5, 40), clamp(p[2], -40, 40)],
    scale: [clamp(Math.abs(s[0]), 0.05, 60), clamp(Math.abs(s[1]), 0.05, 60), clamp(Math.abs(s[2]), 0.05, 60)],
    rotation: [clamp(r[0], -7, 7), clamp(r[1], -7, 7), clamp(r[2], -7, 7)],
    color: toHex(o.color) ?? "#888888",
    opacity: isNum(o.opacity) ? clamp(o.opacity, 0.05, 1) : 1,
    emissive: o.emissive === true,
  };
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** Structural check on raw parsed output, before sanitizing. */
export function validateScene(scene: unknown): ValidationResult {
  if (!scene || typeof scene !== "object") return { ok: false, error: "scene is not an object" };
  const s = scene as Record<string, unknown>;
  if (!s.style || typeof s.style !== "object") return { ok: false, error: "missing style" };
  if (!Array.isArray(s.objects) || s.objects.length === 0) {
    return { ok: false, error: "missing or empty objects array" };
  }
  return { ok: true };
}

/** Turns any parsed scene-ish object into a guaranteed-valid SceneData (best effort per field). */
export function sanitizeScene(scene: unknown): SceneData {
  const sc = (scene && typeof scene === "object" ? scene : {}) as Record<string, unknown>;
  const s = (sc.style && typeof sc.style === "object" ? sc.style : {}) as Record<string, unknown>;

  const palette = Array.isArray(s.colorPalette)
    ? s.colorPalette.map(toHex).filter((c): c is string => c !== null).slice(0, 6)
    : [];
  if (palette.length === 0) palette.push("#888888");

  const fogColor = toHex(s.fogColor) ?? undefined;
  const fogDensity = isNum(s.fogDensity) && s.fogDensity > 0 ? clamp(s.fogDensity, 0, 0.12) : undefined;

  return {
    title: typeof sc.title === "string" && sc.title.trim() ? sc.title.trim().slice(0, 80) : "Untitled Scene",
    description: typeof sc.description === "string" ? sc.description.trim().slice(0, 240) : "",
    style: {
      lightingMood: typeof s.lightingMood === "string" ? s.lightingMood.slice(0, 40) : "daylight",
      colorPalette: palette,
      era: typeof s.era === "string" ? s.era.slice(0, 40) : "unknown",
      ambientLightColor: toHex(s.ambientLightColor) ?? "#ffffff",
      ambientIntensity: isNum(s.ambientIntensity) ? clamp(s.ambientIntensity, 0.05, 3) : 0.5,
      sunLightColor: toHex(s.sunLightColor) ?? "#ffffff",
      sunIntensity: isNum(s.sunIntensity) ? clamp(s.sunIntensity, 0, 5) : 1,
      fogColor: fogColor && fogDensity ? fogColor : undefined,
      fogDensity: fogColor && fogDensity ? fogDensity : undefined,
      groundColor: toHex(s.groundColor) ?? "#3a3a3a",
    },
    objects: Array.isArray(sc.objects)
      ? sc.objects
          .slice(0, MAX_OBJECTS)
          .map((o, i) => sanitizeObject(o, i))
          .filter((o): o is SceneObject => o !== null)
      : [],
  };
}

export const FALLBACK_SCENE: SceneData = sanitizeScene({
  title: "Demo: Moonlit Clearing",
  description: "A hand-made moonlit forest clearing with broken ruins and fireflies.",
  style: {
    lightingMood: "moonlit",
    colorPalette: ["#1a2a4a", "#3b5e7d", "#5a7d9a", "#8aa5b8", "#c8d8e0"],
    era: "ancient",
    ambientLightColor: "#4a6a8a",
    ambientIntensity: 0.7,
    sunLightColor: "#b8ccdd",
    sunIntensity: 1.1,
    fogColor: "#1c2638",
    fogDensity: 0.03,
    groundColor: "#2e3a2a",
  },
  objects: [
    { name: "tree trunk", shape: "cylinder", position: [-6, 1.75, -3], scale: [0.35, 3.5, 0.35], color: "#4a3528" },
    { name: "tree canopy", shape: "cone", position: [-6, 4.5, -3], scale: [1.8, 2.6, 1.8], color: "#2c4a2a" },
    { name: "tree trunk", shape: "cylinder", position: [5, 2, -5], scale: [0.45, 4, 0.45], color: "#4a3528" },
    { name: "tree canopy", shape: "cone", position: [5, 5.2, -5], scale: [2.2, 3, 2.2], color: "#274027" },
    { name: "tree trunk", shape: "cylinder", position: [7, 1.25, 4], scale: [0.3, 2.5, 0.3], color: "#4a3528" },
    { name: "tree canopy", shape: "cone", position: [7, 3.4, 4], scale: [1.5, 2, 1.5], color: "#2c4a2a" },
    { name: "broken column", shape: "cylinder", position: [-2, 1, 1.5], scale: [0.5, 2, 0.5], color: "#7a7a72" },
    { name: "toppled column", shape: "cylinder", position: [1.2, 0.45, 2.5], scale: [0.45, 2.4, 0.45], rotation: [0, 0.4, 1.5708], color: "#6e6e66" },
    { name: "ruin block", shape: "box", position: [-3.5, 0.3, 3], scale: [1.4, 0.6, 1.2], color: "#5a5a55" },
    { name: "altar slab", shape: "box", position: [0, 0.25, -0.5], scale: [2.4, 0.5, 1.4], color: "#646460" },
    { name: "moss patch", shape: "plane", position: [-1, 0.02, 0], scale: [6, 1, 5], color: "#3c5a32" },
    { name: "firefly", shape: "sphere", position: [1, 2, -1], scale: [0.1, 0.1, 0.1], color: "#d8f0a0", emissive: true },
    { name: "firefly", shape: "sphere", position: [-1, 1.5, 1.5], scale: [0.08, 0.08, 0.08], color: "#e8ffc0", emissive: true },
    { name: "firefly", shape: "sphere", position: [2.5, 1.2, 1], scale: [0.08, 0.08, 0.08], color: "#d8f0a0", emissive: true },
    { name: "boulder", shape: "sphere", position: [-7, 0.4, 5], scale: [0.9, 0.6, 0.8], color: "#555555" },
    { name: "boulder", shape: "sphere", position: [8, 0.3, -1], scale: [0.6, 0.4, 0.5], color: "#4a4a4a" },
  ],
});
