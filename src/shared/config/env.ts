import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();
dotenv.config({ path: '.env.local', override: false });

/** Tenant usado para os dados migrados da fase single-user e para AUTH_MODE=off. */
export const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000000';

/**
 * TODAS as variáveis são lidas sob demanda (getters lazy) e validadas com Zod
 * no primeiro acesso. Isso é essencial no Vercel: se a validação rodasse no
 * import e alguma variável faltasse, a função serverless quebraria já na
 * inicialização (FUNCTION_INVOCATION_FAILED, sem log útil). Com getters, uma
 * variável ausente vira um erro tratado no handler.
 */
const cache = new Map<string, unknown>();

function lerVar<T>(name: string, schema: z.ZodType<T>): T {
  if (cache.has(name)) return cache.get(name) as T;
  const parsed = schema.safeParse(process.env[name]);
  if (!parsed.success) {
    throw new Error(
      `Variável de ambiente inválida ou ausente: ${name} — ${parsed.error.issues[0]?.message}. ` +
        `Copie .env.example para .env e preencha os valores.`
    );
  }
  cache.set(name, parsed.data);
  return parsed.data;
}

const obrigatoria = z.string().trim().min(1, 'valor obrigatório');
const booleana = (padrao: 'true' | 'false') =>
  z
    .string()
    .trim()
    .optional()
    .default(padrao)
    .transform((v) => v === 'true');
const inteira = (padrao: number) =>
  z.coerce.number().int().positive().optional().default(padrao);

export const env = {
  // --- Banco -----------------------------------------------------------------
  get databaseUrl(): string {
    return lerVar('DATABASE_URL', obrigatoria);
  },
  get databaseSsl(): boolean {
    return lerVar('DATABASE_SSL', booleana('true'));
  },
  /**
   * Lei 7 (fail-secure): valida o certificado TLS por padrão. Para Supabase,
   * baixe o CA em Settings → Database → SSL e informe em DATABASE_CA_CERT.
   * Desligar exige decisão explícita (e gera warning em runtime).
   */
  get databaseSslRejectUnauthorized(): boolean {
    return lerVar('DATABASE_SSL_REJECT_UNAUTHORIZED', booleana('true'));
  },
  get databaseCaCert(): string | undefined {
    return lerVar('DATABASE_CA_CERT', z.string().trim().min(1).optional());
  },

  // --- Servidor ----------------------------------------------------------------
  get port(): number {
    return lerVar('PORT', inteira(3000));
  },
  get syncIntervalMinutes(): number {
    return lerVar('SYNC_INTERVAL_MINUTES', inteira(30));
  },
  get logLevel(): string {
    return lerVar('LOG_LEVEL', z.string().trim().optional().default('info'));
  },

  // --- IA (OCR de cupons/extratos) ----------------------------------------------
  get geminiApiKey(): string {
    return lerVar('GEMINI_API_KEY', obrigatoria);
  },
  get geminiModel(): string {
    return lerVar('GEMINI_MODEL', z.string().trim().optional().default('gemini-1.5-flash'));
  },

  // --- Autenticação / multi-tenant ---------------------------------------------
  /**
   * 'supabase' (padrão, fail-closed): toda rota /api exige JWT do Supabase Auth.
   * 'off': modo local single-user SEM auth — apenas para dev; loga warning alto.
   */
  get authMode(): 'supabase' | 'off' {
    return lerVar('AUTH_MODE', z.enum(['supabase', 'off']).optional().default('supabase'));
  },
  get supabaseUrl(): string {
    return lerVar('SUPABASE_URL', obrigatoria.regex(/^https?:\/\//, 'deve ser uma URL'));
  },
  get supabaseAnonKey(): string {
    return lerVar('SUPABASE_ANON_KEY', obrigatoria);
  },
  /** Segredo HS256 dos JWTs (Supabase: Settings → API → JWT Secret). */
  get supabaseJwtSecret(): string {
    return lerVar('SUPABASE_JWT_SECRET', obrigatoria.min(20, 'segredo curto demais'));
  },
  get devTenantId(): string {
    return lerVar('DEV_TENANT_ID', z.string().uuid().optional().default(DEFAULT_TENANT_ID));
  },
};
