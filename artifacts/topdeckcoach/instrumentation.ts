/**
 * Next.js Instrumentation hook — roda no boot do servidor.
 * Importar env.ts aqui garante que a validação de variáveis
 * de ambiente acontece antes de qualquer request ser processada.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Runs in both dev and production for the Node.js runtime.
  // Edge runtime skipped intentionally (no server secrets needed there).
  if (process.env.NEXT_RUNTIME !== "edge") {
    await import("./lib/env");
  }
}
