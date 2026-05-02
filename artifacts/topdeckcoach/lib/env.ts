/**
 * Valida todas as variáveis de ambiente obrigatórias no boot.
 * Se alguma estiver faltando, o app falha com mensagem clara listando todas.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[env] Variável de ambiente obrigatória não definida: ${name}\n` +
        `Configure todas as seguintes no Replit Secrets antes de usar este recurso:\n` +
        `  DATABASE_URL, ANTHROPIC_API_KEY, RESEND_API_KEY, ADMIN_TOKEN, APP_URL`,
    );
  }
  return value;
}

export const env = {
  get DATABASE_URL() {
    return requireEnv("DATABASE_URL");
  },
  get ANTHROPIC_API_KEY() {
    return requireEnv("ANTHROPIC_API_KEY");
  },
  get RESEND_API_KEY() {
    return requireEnv("RESEND_API_KEY");
  },
  get ADMIN_TOKEN() {
    return requireEnv("ADMIN_TOKEN");
  },
  get APP_URL() {
    return requireEnv("APP_URL");
  },
  get DAILY_COST_CAP_USD(): string {
    return process.env.DAILY_COST_CAP_USD ?? "10";
  },
} as const;
