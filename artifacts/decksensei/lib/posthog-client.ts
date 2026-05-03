"use client";

import posthog from "posthog-js";

let initialized = false;

/**
 * Inicializa o PostHog no browser.
 * No-op quando NEXT_PUBLIC_POSTHOG_KEY não está definida.
 */
export function initPostHog(): void {
  if (typeof window === "undefined" || initialized) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  posthog.init(key, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
  });
  initialized = true;
}

/**
 * Captura um evento PostHog de forma segura.
 * No-op quando não inicializado ou em SSR.
 */
export function trackEvent(
  event: string,
  props?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  try {
    posthog.capture(event, props);
  } catch {
    // PostHog não inicializado ou indisponível
  }
}
