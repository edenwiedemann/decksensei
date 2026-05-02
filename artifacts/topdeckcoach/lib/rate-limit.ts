import { pool } from "@workspace/db";

export interface RateLimitResult {
  allowed: true;
}

export interface RateLimitDenied {
  allowed: false;
  retryAfterSec: number;
}

/**
 * checkRateLimit — fixed-window no Postgres.
 *
 * Upsert atômico via ON CONFLICT (key):
 * - Primeira requisição: INSERT com count=1
 * - Dentro da janela: incrementa count
 * - Janela expirada: reseta count=1 e windowStart=NOW()
 *
 * Retorna `{ allowed: true }` se dentro do limite,
 * ou `{ allowed: false, retryAfterSec }` se excedeu.
 *
 * @param key         Chave de identificação (ex: "anon:1.2.3.4", "auth:1.2.3.4")
 * @param windowSec   Duração da janela em segundos
 * @param maxRequests Número máximo de requisições permitidas na janela
 */
export async function checkRateLimit(
  key: string,
  windowSec: number,
  maxRequests: number,
): Promise<RateLimitResult | RateLimitDenied> {
  type Row = { count: number; retry_after_sec: number };

  const result = await pool.query<Row>(
    `
    INSERT INTO rate_limits (key, window_start, count)
    VALUES ($1, NOW(), 1)
    ON CONFLICT (key) DO UPDATE
      SET
        count = CASE
          WHEN rate_limits.window_start + ($2 || ' seconds')::interval < NOW()
          THEN 1
          ELSE rate_limits.count + 1
        END,
        window_start = CASE
          WHEN rate_limits.window_start + ($2 || ' seconds')::interval < NOW()
          THEN NOW()
          ELSE rate_limits.window_start
        END
    RETURNING
      rate_limits.count,
      GREATEST(
        0,
        EXTRACT(
          EPOCH FROM (
            rate_limits.window_start
            + ($2 || ' seconds')::interval
            - NOW()
          )
        )::int
      ) AS retry_after_sec
    `,
    [key, String(windowSec)],
  );

  const row = result.rows[0];

  if (!row) {
    return { allowed: true };
  }

  if (row.count > maxRequests) {
    return { allowed: false, retryAfterSec: row.retry_after_sec };
  }

  return { allowed: true };
}
