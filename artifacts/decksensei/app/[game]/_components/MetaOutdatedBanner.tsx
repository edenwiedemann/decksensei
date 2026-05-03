"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface MetaOutdatedBannerProps {
  deckText: string;
  gameId: string;
}

export default function MetaOutdatedBanner({ deckText, gameId }: MetaOutdatedBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(`ds_meta_banner_dismissed_${gameId}`)) {
        setDismissed(true);
      }
    } catch {}
  }, [gameId]);

  if (dismissed) return null;

  function handleDismiss() {
    try {
      sessionStorage.setItem(`ds_meta_banner_dismissed_${gameId}`, "1");
    } catch {}
    setDismissed(true);
  }

  function handleReanalyze() {
    const encoded = btoa(
      encodeURIComponent(deckText).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16)),
      ),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    router.push(`/${gameId}?deck=${encoded}`);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
      <span className="flex-1 text-sm text-amber-300/90 min-w-0">
        O meta evoluiu desde esta análise. Quer re-analisar com o meta atual?
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={handleReanalyze}
          className="inline-flex h-8 items-center justify-center rounded-md bg-amber-500/20 px-3 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 transition-colors hover:bg-amber-500/30"
        >
          Re-analisar
        </button>
        <button
          onClick={handleDismiss}
          className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-border/30"
        >
          Dispensar
        </button>
      </div>
    </div>
  );
}
