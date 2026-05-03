/**
 * Rate limiter serial genérico — executa tarefas em fila com intervalo mínimo.
 * Extraído de digimon/card-api.ts para reutilização pelos adapters genéricos.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class SerialRateLimiter {
  private chain: Promise<void> = Promise.resolve();
  private lastFiredAt = 0;
  private readonly intervalMs: number;

  /**
   * @param maxPerWindow Número máximo de requisições na janela
   * @param windowMs    Tamanho da janela em milissegundos
   */
  constructor(maxPerWindow: number, windowMs: number) {
    this.intervalMs = Math.ceil(windowMs / maxPerWindow);
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.chain.then(async (): Promise<T> => {
      const elapsed = Date.now() - this.lastFiredAt;
      if (elapsed < this.intervalMs) {
        await sleep(this.intervalMs - elapsed);
      }
      this.lastFiredAt = Date.now();
      return fn();
    });

    this.chain = result.then(
      () => {},
      () => {},
    );

    return result;
  }
}
