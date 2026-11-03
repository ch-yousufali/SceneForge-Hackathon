"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import SceneViewer, { type SceneViewerHandle } from "@/components/SceneViewer";
import StylePanel from "@/components/StylePanel";
import * as Icon from "@/components/Icons";
import { PRESET_PROMPTS } from "@/lib/scene";
import type { SceneData, SceneResponse } from "@/lib/scene";

interface HistoryEntry {
  id: number;
  prompt: string;
  scene: SceneData;
}

const HISTORY_KEY = "sceneforge:history:v1";
const MAX_HISTORY = 12;
const REQUEST_TIMEOUT_MS = 90_000;
const LOADING_STAGES = [
  "Reading your description…",
  "Sketching the layout…",
  "Placing objects…",
  "Setting the mood lighting…",
];

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "scene";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ToolButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition disabled:pointer-events-none disabled:opacity-35 ${
        active ? "bg-white/[0.12] text-white" : "text-zinc-400 hover:bg-white/[0.08] hover:text-white"
      }`}
    >
      {children}
      <span className="hidden whitespace-nowrap xl:inline">{label}</span>
    </button>
  );
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const viewerRef = useRef<SceneViewerHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const active = history.find((h) => h.id === activeId) ?? null;
  const scene = active?.scene ?? null;

  // Restore history saved in this browser
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryEntry[];
      if (Array.isArray(saved) && saved.length) {
        // Syncing from browser storage once on mount.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHistory(saved.slice(0, MAX_HISTORY));
        setActiveId(saved[0].id);
        setPrompt(saved[0].prompt);
      }
    } catch {
      /* storage unavailable or corrupt — start fresh */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* storage full or blocked — history just won't persist */
    }
  }, [history]);

  // Cycle loading messages
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, LOADING_STAGES.length - 1)), 2500);
    return () => clearInterval(t);
  }, [loading]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const generate = async (text?: string) => {
    const value = (text ?? prompt).trim();
    if (!value || loading) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    setLoading(true);
    setStage(0);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: value }),
        signal: controller.signal,
      });
      const data = (await res.json()) as SceneResponse;
      if (!data.success || !data.scene) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      if (data.warning) setNotice(data.warning);
      const entry: HistoryEntry = { id: Date.now(), prompt: value, scene: data.scene };
      setHistory((h) => [entry, ...h].slice(0, MAX_HISTORY));
      setActiveId(entry.id);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setError(controller.signal.reason === "user" ? null : "That took too long — please try again.");
      } else {
        setError("Network error — check your connection and try again.");
      }
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      setLoading(false);
    }
  };

  const exportJson = () => {
    if (!scene) return;
    downloadBlob(new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" }), `${slug(scene.title)}.json`);
  };

  const exportGlb = async () => {
    if (!scene) return;
    try {
      const buf = await viewerRef.current?.exportGLB();
      if (!buf) return;
      downloadBlob(new Blob([buf], { type: "model/gltf-binary" }), `${slug(scene.title)}.glb`);
    } catch {
      flash("GLB export failed");
    }
  };

  const copyJson = async () => {
    if (!scene) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(scene, null, 2));
      flash("Scene JSON copied");
    } catch {
      flash("Clipboard blocked — use Export instead");
    }
  };

  const screenshot = () => {
    const url = viewerRef.current?.capture();
    if (!url || !scene) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(scene.title)}.png`;
    a.click();
  };

  const isDemo = notice?.startsWith("No API key");

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#0a0b0f] text-zinc-200 lg:flex-row">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="flex max-h-[52dvh] w-full shrink-0 flex-col border-b border-white/[0.06] bg-[#0d0f14] lg:max-h-none lg:w-[400px] lg:border-b-0 lg:border-r">
        <header className="flex items-center gap-3 px-5 pb-4 pt-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-rose-500 text-white shadow-lg shadow-orange-500/20">
            <Icon.LogoMark width={20} height={20} />
          </div>
          <div className="leading-tight">
            <h1 className="text-[15px] font-semibold tracking-tight text-white">SceneForge</h1>
            <p className="text-xs text-zinc-500">Text to 3D scene blockout</p>
          </div>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-6">
          {/* Composer */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] transition focus-within:border-orange-400/40 focus-within:bg-white/[0.045]">
            <label htmlFor="prompt" className="sr-only">
              Describe a scene
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  generate();
                }
              }}
              placeholder="Describe a place — e.g. a misty swamp village on stilts, lanterns glowing, rickety bridges…"
              rows={4}
              maxLength={1000}
              className="block w-full resize-none bg-transparent px-4 pt-3.5 text-sm leading-relaxed text-zinc-100 placeholder-zinc-600 outline-none"
            />
            <div className="flex items-center gap-3 px-3 pb-3 pt-1">
              <span className="pl-1 text-[11px] text-zinc-600">
                {prompt.length > 0 ? `${prompt.length}/1000` : "Ctrl / ⌘ + Enter"}
              </span>
              {loading ? (
                <button
                  onClick={() => abortRef.current?.abort("user")}
                  className="ml-auto h-9 rounded-lg border border-white/10 px-4 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
              ) : (
                <button
                  onClick={() => generate()}
                  disabled={!prompt.trim()}
                  className="ml-auto flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-b from-orange-400 to-orange-500 px-4 text-sm font-semibold text-black shadow-md shadow-orange-500/20 transition hover:from-orange-300 hover:to-orange-400 disabled:cursor-not-allowed disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-400 disabled:shadow-none"
                >
                  <Icon.Sparkle width={15} height={15} />
                  Forge scene
                </button>
              )}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="-mt-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2.5 text-xs leading-relaxed text-red-300"
            >
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} aria-label="Dismiss error" className="text-red-300/70 hover:text-red-200">
                <Icon.X width={14} height={14} />
              </button>
            </div>
          )}
          {notice && !isDemo && (
            <p className="-mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5 text-xs leading-relaxed text-amber-200/90">
              {notice}
            </p>
          )}

          {/* Presets */}
          <section>
            <h2 className="mb-2.5 text-xs font-medium text-zinc-500">Start from a preset</h2>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_PROMPTS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPrompt(p.prompt);
                    generate(p.prompt);
                  }}
                  disabled={loading}
                  title={p.prompt}
                  className="group overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02] text-left transition hover:border-white/20 hover:bg-white/[0.05] disabled:opacity-40"
                >
                  <div className="flex h-1.5">
                    {p.colors.map((c) => (
                      <span key={c} className="flex-1" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <div className="px-3 py-2.5">
                    <div className="text-[13px] font-medium text-zinc-200 group-hover:text-white">{p.label}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">{p.tagline}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Style direction */}
          {scene && (
            <section>
              <h2 className="mb-2.5 text-xs font-medium text-zinc-500">Style direction</h2>
              <StylePanel key={activeId} scene={scene} />
            </section>
          )}

          {/* History */}
          {history.length > 1 && (
            <section>
              <div className="mb-2 flex items-center">
                <h2 className="text-xs font-medium text-zinc-500">Recent scenes</h2>
                <button
                  onClick={() => {
                    setHistory((h) => h.filter((e) => e.id === activeId));
                  }}
                  className="ml-auto text-[11px] text-zinc-600 transition hover:text-zinc-300"
                >
                  Clear
                </button>
              </div>
              <ul className="space-y-0.5">
                {history.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => {
                        setActiveId(h.id);
                        setPrompt(h.prompt);
                        setNotice(null);
                        setError(null);
                      }}
                      title={h.prompt}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                        h.id === activeId ? "bg-white/[0.07] text-white" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                    >
                      <span className="flex h-4 w-6 shrink-0 overflow-hidden rounded-sm ring-1 ring-white/10">
                        {h.scene.style.colorPalette.slice(0, 4).map((c, i) => (
                          <span key={i} className="flex-1" style={{ backgroundColor: c }} />
                        ))}
                      </span>
                      <span className="truncate">{h.scene.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>

      {/* ── Viewport ────────────────────────────────────────── */}
      <section className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <SceneViewer scene={scene} showGrid={showGrid} handleRef={viewerRef} />
        </div>

        {/* Title + mode badge */}
        {scene && (
          <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap items-center gap-2">
            <div className="rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-[13px] font-medium text-white backdrop-blur-md">
              {scene.title}
            </div>
            {isDemo && (
              <div
                className="pointer-events-auto rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-200 backdrop-blur-md"
                title={notice ?? ""}
              >
                Demo mode · add an API key for AI scenes
              </div>
            )}
          </div>
        )}

        {/* Floating toolbar */}
        {scene && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-white/10 bg-[#111318]/85 p-1 shadow-2xl shadow-black/40 backdrop-blur-md">
            <ToolButton label="Grid" onClick={() => setShowGrid((g) => !g)} active={showGrid}>
              <Icon.Grid />
            </ToolButton>
            <ToolButton label="Reframe" onClick={() => viewerRef.current?.resetCamera()}>
              <Icon.Focus />
            </ToolButton>
            <ToolButton label="Regenerate" onClick={() => active && generate(active.prompt)} disabled={loading}>
              <Icon.Refresh />
            </ToolButton>
            <span className="mx-1 h-5 w-px bg-white/10" />
            <ToolButton label="Screenshot" onClick={screenshot}>
              <Icon.Camera />
            </ToolButton>
            <ToolButton label="Copy JSON" onClick={copyJson}>
              <Icon.Copy />
            </ToolButton>
            <ToolButton label="JSON" onClick={exportJson}>
              <Icon.Download />
            </ToolButton>
            <button
              onClick={exportGlb}
              title="Export .glb for Unity, Godot, Unreal or Blender"
              className="ml-0.5 flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black transition hover:bg-zinc-200"
            >
              <Icon.Download />
              GLB
            </button>
          </div>
        )}

        {scene && (
          <p className="pointer-events-none absolute bottom-6 right-4 hidden text-[11px] text-white/35 2xl:block">
            Drag to orbit · Scroll to zoom · Right-drag to pan
          </p>
        )}

        {/* Toast */}
        {toast && (
          <div
            role="status"
            className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/10 bg-black/80 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-md"
          >
            <Icon.Check width={14} height={14} className="text-emerald-400" />
            {toast}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="flex w-72 flex-col items-center gap-4 rounded-2xl border border-white/10 bg-[#111318]/90 px-6 py-6 text-center shadow-2xl backdrop-blur-md">
              <div className="relative h-10 w-10">
                <span className="absolute inset-0 animate-ping rounded-xl bg-orange-500/30" />
                <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-rose-500 text-white">
                  <Icon.LogoMark width={20} height={20} />
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-white">Forging your scene</p>
                <p className="mt-1 text-xs text-zinc-400" aria-live="polite">
                  {LOADING_STAGES[stage]}
                </p>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-400 to-rose-500 transition-all duration-[2500ms] ease-out"
                  style={{ width: `${((stage + 1) / LOADING_STAGES.length) * 90}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!scene && !loading && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-orange-300">
                <Icon.LogoMark width={28} height={28} />
              </div>
              <h2 className="text-balance text-2xl font-semibold tracking-tight text-white">
                Describe a place. Get a blockout.
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-pretty text-sm leading-relaxed text-zinc-400">
                SceneForge turns a sentence into a 3D layout of primitives with lighting, palette and
                mood, ready to orbit and export to your engine.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {PRESET_PROMPTS.slice(0, 3).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPrompt(p.prompt);
                      generate(p.prompt);
                    }}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-2 pr-3.5 text-xs font-medium text-zinc-300 transition hover:border-white/25 hover:text-white"
                  >
                    <span className="flex h-3.5 w-3.5 overflow-hidden rounded-full">
                      {p.colors.slice(0, 2).map((c) => (
                        <span key={c} className="flex-1" style={{ backgroundColor: c }} />
                      ))}
                    </span>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
