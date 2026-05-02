/**
 * Validação de variáveis de ambiente no boot.
 * Todas as regras são verificadas ao importar este módulo.
 * Se qualquer variável estiver faltando ou inválida, o boot falha
 * com mensagem clara listando TODOS os problemas de uma vez.
 */

type EnvError = string;

const errors: EnvError[] = [];

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    errors.push(`${name}: variável obrigatória não definida`);
    return "";
  }
  return value.trim();
}

function requiredMinLength(name: string, minLength: number): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    errors.push(`${name}: variável obrigatória não definida`);
    return "";
  }
  if (value.trim().length < minLength) {
    errors.push(
      `${name}: mínimo de ${minLength} caracteres (atual: ${value.trim().length})`,
    );
    return value.trim();
  }
  return value.trim();
}

function requiredUrl(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    errors.push(`${name}: variável obrigatória não definida`);
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("https://")) {
    errors.push(`${name}: deve ser uma URL válida começando com https://`);
    return trimmed;
  }
  try {
    new URL(trimmed);
  } catch {
    errors.push(`${name}: URL inválida — "${trimmed}"`);
    return trimmed;
  }
  return trimmed;
}

function optionalNumeric(name: string, defaultValue: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    return defaultValue;
  }
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (isNaN(parsed) || parsed <= 0) {
    errors.push(`${name}: deve ser um número positivo (atual: "${trimmed}")`);
    return defaultValue;
  }
  return trimmed;
}

// ─── Verificação de todas as variáveis ──────────────────────────────────────

const DATABASE_URL = required("DATABASE_URL");
const ANTHROPIC_API_KEY = required("ANTHROPIC_API_KEY");
const RESEND_API_KEY = required("RESEND_API_KEY");
const ADMIN_TOKEN = requiredMinLength("ADMIN_TOKEN", 32);
const APP_URL = requiredUrl("APP_URL");
const DAILY_COST_CAP_USD = optionalNumeric("DAILY_COST_CAP_USD", "10");

// ─── Falha no boot se houver qualquer problema ───────────────────────────────

if (errors.length > 0) {
  const msg = [
    "",
    "╔══════════════════════════════════════════════════════════════╗",
    "║       TopdeckCoach — erro de configuração no boot            ║",
    "╚══════════════════════════════════════════════════════════════╝",
    "",
    `${errors.length} problema(s) encontrado(s) nas variáveis de ambiente:`,
    "",
    ...errors.map((e) => `  • ${e}`),
    "",
    "Configure todas as variáveis em Replit Secrets antes de iniciar.",
    "Veja .env.example para a lista completa.",
    "",
  ].join("\n");

  throw new Error(msg);
}

// ─── Exportação tipada ───────────────────────────────────────────────────────

export const env = {
  DATABASE_URL,
  ANTHROPIC_API_KEY,
  RESEND_API_KEY,
  ADMIN_TOKEN,
  APP_URL,
  DAILY_COST_CAP_USD,
} as const;

export type Env = typeof env;
