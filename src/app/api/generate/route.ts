import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  FALLBACK_SCENE,
  SCENE_JSON_SCHEMA,
  sanitizeScene,
  validateScene,
} from "@/lib/scene";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";

export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.SCENEFORGE_EFFORT || "low") as "low" | "medium" | "high";

// Per-IP limit on AI generations (demo-mode requests are free and not limited).
const rateLimit = createRateLimiter(Number(process.env.SCENEFORGE_RATE_LIMIT) || 10, 60_000);

const SYSTEM_PROMPT = `You are SceneForge, a 3D scene blockout engine for indie game developers.
Convert a short scene description into a structured 3D layout made ONLY of primitive shapes, plus a style direction.

Output a single JSON object with: title, description (one sentence on mood), style, objects.

Style:
- lightingMood: one of daylight, sunset, night, moonlit, foggy, neon, stormy, warm, cold
- colorPalette: 3-5 hex colors (#rrggbb) that define the scene
- era: e.g. ancient, medieval, fantasy, sci-fi, modern, post-apocalyptic
- ambientLightColor (hex), ambientIntensity (0.1-1.5), sunLightColor (hex), sunIntensity (0-3)
- fogColor (hex or null), fogDensity (0.005-0.08 or null)
- groundColor (hex). The app always draws a 30x30 ground at y=0 in this color — do NOT add a ground object.

Objects (8-24 of them):
- shape: box | cylinder | cone | sphere | plane
- position: [x, y, z] is the CENTER of the object. Something resting on the ground has y = height / 2.
- scale: box [width, height, depth]; cylinder/cone [radius, height, radius]; sphere [radiusX, radiusY, radiusZ]; plane [width, 1, depth] (planes always lie flat — use them for water, paths, rugs, puddles at y ≈ 0.02)
- rotation: [x, y, z] in radians ([0,0,0] if none). A fallen column is a cylinder with rotation [0, 0, 1.5708].
- color: hex; opacity: 0.1-1 (1 unless glass/water/mist); emissive: true only for light sources (lanterns, fire, neon, glowing crystals, lava)

Layout rules:
- 1 unit ≈ 1 meter. Keep x and z within -12..12. Use height for silhouette (trees, towers, cliffs, walls).
- Compose like a game level: a clear focal point near the center, supporting props around it, framing elements at the edges.
- Build recognizable things from several primitives (tree = cylinder trunk + cone/sphere canopy; house = box + cone roof).
- Colors and lighting must match the described mood; give the scene at least one emissive accent if it fits.`;

/** Pull a JSON object out of model text, tolerating code fences or stray prose. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(text.slice(start, end + 1));
}

function fallback(warning: string) {
  return NextResponse.json({ success: true, scene: FALLBACK_SCENE, warning });
}

export async function POST(req: Request) {
  let prompt: string;
  try {
    const body = (await req.json()) as { prompt?: unknown };
    prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json({ success: false, error: "Please describe a scene first." }, { status: 400 });
  }
  if (prompt.length > 1000) {
    return NextResponse.json(
      { success: false, error: "Prompt is too long (max 1000 characters)." },
      { status: 400 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;

  if (!apiKey && !authToken) {
    return fallback(
      "No API key configured — showing a demo scene. Add ANTHROPIC_API_KEY to .env.local for AI-generated scenes."
    );
  }

  const limit = rateLimit(clientIp(req));
  if (!limit.ok) {
    return NextResponse.json(
      {
        success: false,
        error: `Too many scenes too quickly — try again in ${limit.retryAfterSec}s.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const client = new Anthropic({
    apiKey: apiKey || null,
    authToken: apiKey ? null : authToken,
    baseURL,
  });

  // First-party API: use structured outputs (schema-guaranteed JSON) + server-side
  // refusal fallback. Proxies like OpenRouter may not support these, so skip them there.
  const firstParty = !baseURL || baseURL.includes("api.anthropic.com");

  let text: string;
  try {
    const message = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Scene description: "${prompt}"\n\nGenerate the blockout scene JSON now.`,
        },
      ],
      ...(firstParty
        ? {
            output_config: {
              effort: EFFORT,
              format: { type: "json_schema" as const, schema: SCENE_JSON_SCHEMA },
            },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default" as const,
          }
        : {}),
    });

    if (message.stop_reason === "refusal") {
      return NextResponse.json(
        { success: false, error: "The AI declined this description. Try rephrasing it." },
        { status: 422 }
      );
    }

    text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (message.stop_reason === "max_tokens") {
      console.warn("Scene generation hit max_tokens; attempting to parse anyway.");
    }
  } catch (err) {
    console.error("Claude API error:", err);
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { success: false, error: "The API key was rejected. Check ANTHROPIC_API_KEY in .env.local." },
        { status: 502 }
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { success: false, error: "Rate limited by the AI service — wait a few seconds and try again." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { success: false, error: "The AI service returned an error. Please try again in a moment." },
      { status: 502 }
    );
  }

  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    console.error("Model returned invalid JSON:", text.slice(0, 500));
    return fallback("The AI returned invalid JSON. Showing a fallback scene instead.");
  }

  const validation = validateScene(raw);
  if (!validation.ok) {
    return fallback(
      `The AI output didn't pass validation (${validation.error}). Showing a fallback scene instead.`
    );
  }

  const scene = sanitizeScene(raw);
  if (scene.objects.length === 0) {
    return fallback("The AI produced no usable objects. Showing a fallback scene instead.");
  }

  return NextResponse.json({ success: true, scene });
}
