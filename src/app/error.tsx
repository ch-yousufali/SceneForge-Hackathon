"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-[#0a0b0f] p-6 text-center">
      <h1 className="text-xl font-semibold text-white">Something broke while rendering the scene.</h1>
      <p className="max-w-sm text-sm text-zinc-400">
        Your recent scenes are saved in this browser. Reload to pick up where you left off.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400"
      >
        Try again
      </button>
    </main>
  );
}
