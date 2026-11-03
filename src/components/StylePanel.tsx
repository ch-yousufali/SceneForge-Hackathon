"use client";

import { useState } from "react";
import type { SceneData } from "@/lib/scene";
import { ChevronDown, Sun } from "./Icons";

const SHAPE_ICON: Record<string, string> = {
  box: "▢",
  cylinder: "▯",
  cone: "△",
  sphere: "○",
  plane: "▱",
};

export default function StylePanel({ scene }: { scene: SceneData }) {
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [showObjects, setShowObjects] = useState(false);
  const { style } = scene;

  const copyHex = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopiedHex(hex);
      setTimeout(() => setCopiedHex(null), 1200);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const shapeCounts = scene.objects.reduce<Record<string, number>>((acc, o) => {
    acc[o.shape] = (acc[o.shape] ?? 0) + 1;
    return acc;
  }, {});

  const lights = [
    { label: "Key light", color: style.sunLightColor, value: `×${style.sunIntensity.toFixed(1)}` },
    { label: "Ambient", color: style.ambientLightColor, value: `×${style.ambientIntensity.toFixed(1)}` },
    { label: "Ground", color: style.groundColor, value: style.groundColor },
    ...(style.fogColor && style.fogDensity
      ? [{ label: "Fog", color: style.fogColor, value: style.fogDensity.toFixed(3) }]
      : []),
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
      {/* Palette strip */}
      <div className="flex h-16">
        {style.colorPalette.map((c) => (
          <button
            key={c}
            onClick={() => copyHex(c)}
            className="group relative flex-1 transition-[flex] duration-200 hover:flex-[1.6] focus-visible:flex-[1.6] focus-visible:outline-none"
            style={{ backgroundColor: c }}
            aria-label={`Copy ${c}`}
          >
            <span className="absolute inset-x-0 bottom-1 text-center font-mono text-[10px] text-white opacity-0 mix-blend-difference transition group-hover:opacity-100 group-focus-visible:opacity-100">
              {copiedHex === c ? "copied" : c}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-4 p-4">
        <div>
          <h2 className="text-[15px] font-semibold leading-snug text-white">{scene.title}</h2>
          {scene.description && (
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">{scene.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[11px] font-medium capitalize text-orange-300">
              <Sun width={11} height={11} />
              {style.lightingMood}
            </span>
            <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[11px] font-medium capitalize text-zinc-300">
              {style.era}
            </span>
            {style.fogDensity ? (
              <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[11px] font-medium text-zinc-300">
                Fog
              </span>
            ) : null}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-white/[0.06] pt-4">
          {lights.map((l) => (
            <div key={l.label} className="flex items-center gap-2 text-xs">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/20"
                style={{ backgroundColor: l.color }}
              />
              <dt className="text-zinc-500">{l.label}</dt>
              <dd className="ml-auto font-mono text-[11px] text-zinc-300">{l.value}</dd>
            </div>
          ))}
        </dl>

        <div className="border-t border-white/[0.06] pt-3">
          <button
            onClick={() => setShowObjects((v) => !v)}
            className="flex w-full items-center gap-2 text-xs text-zinc-400 transition hover:text-white"
            aria-expanded={showObjects}
          >
            <span className="shrink-0 whitespace-nowrap font-medium text-zinc-200">{scene.objects.length} objects</span>
            <span className="truncate text-zinc-500">
              {Object.entries(shapeCounts)
                .map(([k, n]) => `${n} ${k}${n > 1 ? (k === "box" ? "es" : "s") : ""}`)
                .join(" · ")}
            </span>
            <ChevronDown
              className={`ml-auto shrink-0 transition-transform ${showObjects ? "rotate-180" : ""}`}
              width={14}
              height={14}
            />
          </button>
          {showObjects && (
            <ul className="mt-2.5 max-h-56 space-y-0.5 overflow-y-auto pr-1">
              {scene.objects.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[11px] hover:bg-white/[0.04]"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-white/10"
                    style={{ backgroundColor: o.color }}
                  />
                  <span className="w-3 text-center text-zinc-500">{SHAPE_ICON[o.shape]}</span>
                  <span className="truncate text-zinc-300">{o.name}</span>
                  {o.emissive && <span className="text-orange-300" title="Emits light">✦</span>}
                  <span className="ml-auto shrink-0 font-mono text-zinc-600">
                    {o.position.map((n) => n.toFixed(1)).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="sr-only" role="status">
        {copiedHex ? `Copied ${copiedHex}` : ""}
      </div>
    </div>
  );
}
