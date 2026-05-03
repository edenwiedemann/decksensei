"use client";

import { useEffect } from "react";
import { initPostHog } from "@/lib/posthog-client";

/**
 * Componente vazio que inicializa o PostHog no primeiro render do cliente.
 * Renderizado no RootLayout para cobertura global.
 */
export default function PostHogInit() {
  useEffect(() => {
    initPostHog();
  }, []);
  return null;
}
