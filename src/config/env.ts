import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. ` +
        `Copie .env.example para .env e preencha os valores.`
    );
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

// TODAS as variáveis são lidas sob demanda (getters lazy). Isso é essencial no
// Vercel: se a validação rodasse no import e alguma variável faltasse, a função
// serverless quebraria já na inicialização (FUNCTION_INVOCATION_FAILED, sem log
// útil). Com getters, uma variável ausente vira um erro tratado no handler.
export const env = {
  get databaseUrl(): string {
    return required('DATABASE_URL');
  },
  get databaseSsl(): boolean {
    return optional('DATABASE_SSL', 'true') === 'true';
  },
  get port(): number {
    return parseInt(optional('PORT', '3000'), 10);
  },
  get syncIntervalMinutes(): number {
    return parseInt(optional('SYNC_INTERVAL_MINUTES', '30'), 10);
  },
  get geminiApiKey(): string {
    return required('GEMINI_API_KEY');
  },
  get geminiModel(): string {
    return optional('GEMINI_MODEL', 'gemini-1.5-flash');
  },
};
