/**
 * Rate limiter em memória por chave (email, IP, etc.)
 * Sliding-window: rastreia timestamps dos últimos requests dentro da janela.
 * Adequado para processos únicos (Next.js dev / single-instance prod).
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

/**
 * Verifica e registra uma tentativa para a chave dada.
 *
 * @param key       Chave de identificação (ex: email, IP)
 * @param limit     Número máximo de tentativas permitidas na janela
 * @param windowMs  Tamanho da janela em milissegundos
 * @returns `allowed: true` se dentro do limite, `allowed: false` se excedeu,
 *          junto com `remaining` e `resetInMs` para headers opcionais.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetInMs: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  const entry = store.get(key) ?? { timestamps: [] };

  // Remove timestamps fora da janela (sliding window)
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    const resetInMs = oldest + windowMs - now;
    store.set(key, entry);
    return { allowed: false, remaining: 0, resetInMs };
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  const remaining = limit - entry.timestamps.length;
  return { allowed: true, remaining, resetInMs: 0 };
}

/** Remove entradas antigas do store para evitar memory leak (limpeza periódica). */
export function pruneRateLimitStore(windowMs: number): void {
  const cutoff = Date.now() - windowMs;
  for (const [key, entry] of store.entries()) {
    const active = entry.timestamps.filter((t) => t > cutoff);
    if (active.length === 0) {
      store.delete(key);
    } else {
      entry.timestamps = active;
    }
  }
}
