import { test } from "node:test";
import assert from "node:assert/strict";
import { FALLBACK_SCENE, PRESET_PROMPTS, sanitizeScene, validateScene } from "../src/lib/scene.ts";

test("validateScene rejects non-objects and empty scenes", () => {
  assert.equal(validateScene(null).ok, false);
  assert.equal(validateScene("nope").ok, false);
  assert.equal(validateScene({ style: {}, objects: [] }).ok, false);
  assert.equal(validateScene({ objects: [{}] }).ok, false);
  assert.equal(validateScene({ style: {}, objects: [{}] }).ok, true);
});

test("sanitizeScene fills defaults for missing fields", () => {
  const s = sanitizeScene({ style: {}, objects: [{}] });
  assert.equal(s.title, "Untitled Scene");
  assert.equal(s.style.groundColor, "#3a3a3a");
  assert.deepEqual(s.style.colorPalette, ["#888888"]);
  assert.equal(s.objects.length, 1);
  assert.equal(s.objects[0].shape, "box");
  assert.deepEqual(s.objects[0].position, [0, 0, 0]);
  assert.deepEqual(s.objects[0].scale, [1, 1, 1]);
  assert.equal(s.objects[0].color, "#888888");
});

test("sanitizeScene normalizes colors and rejects bad ones", () => {
  const s = sanitizeScene({
    style: { colorPalette: ["#ABC", "red", "#112233", 5], groundColor: "#zzzzzz" },
    objects: [{ color: "#FFF" }, { color: "blue" }],
  });
  assert.deepEqual(s.style.colorPalette, ["#aabbcc", "#112233"]);
  assert.equal(s.style.groundColor, "#3a3a3a");
  assert.equal(s.objects[0].color, "#ffffff");
  assert.equal(s.objects[1].color, "#888888");
});

test("sanitizeScene clamps out-of-range numbers", () => {
  const s = sanitizeScene({
    style: { ambientIntensity: 99, sunIntensity: -4, fogColor: "#000000", fogDensity: 5 },
    objects: [{ position: [1000, -50, 0], scale: [-2, 0, 500], opacity: 7, shape: "torus" }],
  });
  assert.equal(s.style.ambientIntensity, 3);
  assert.equal(s.style.sunIntensity, 0);
  assert.equal(s.style.fogDensity, 0.12);
  const o = s.objects[0];
  assert.deepEqual(o.position, [40, -5, 0]);
  assert.deepEqual(o.scale, [2, 0.05, 60]);
  assert.equal(o.opacity, 1);
  assert.equal(o.shape, "box");
});

test("sanitizeScene drops fog unless both color and density are valid", () => {
  const s = sanitizeScene({ style: { fogColor: "#101010", fogDensity: null }, objects: [{}] });
  assert.equal(s.style.fogColor, undefined);
  assert.equal(s.style.fogDensity, undefined);
});

test("sanitizeScene caps object count and assigns unique ids", () => {
  const s = sanitizeScene({ style: {}, objects: Array.from({ length: 100 }, () => ({})) });
  assert.equal(s.objects.length, 60);
  assert.equal(new Set(s.objects.map((o) => o.id)).size, 60);
});

test("sanitizeScene ignores non-object entries and NaN vectors", () => {
  const s = sanitizeScene({ style: {}, objects: [null, 3, { position: [NaN, 1, 2] }] });
  assert.equal(s.objects.length, 1);
  assert.deepEqual(s.objects[0].position, [0, 0, 0]);
});

test("fallback scene and presets are well-formed", () => {
  assert.ok(FALLBACK_SCENE.objects.length >= 8);
  assert.ok(FALLBACK_SCENE.objects.every((o) => /^#[0-9a-f]{6}$/.test(o.color)));
  assert.equal(new Set(PRESET_PROMPTS.map((p) => p.id)).size, PRESET_PROMPTS.length);
  assert.ok(PRESET_PROMPTS.every((p) => p.prompt.length > 20 && p.colors.length > 0));
});
