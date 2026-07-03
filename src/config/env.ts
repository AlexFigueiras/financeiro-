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

export const env = {
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: optional('DATABASE_SSL', 'true') === 'true',
  port: parseInt(optional('PORT', '3000'), 10),
  syncIntervalMinutes: parseInt(optional('SYNC_INTERVAL_MINUTES', '30'), 10),

  // Token lido sob demanda (lazy) para que o servidor suba mesmo sem ele —
  // o módulo de OCR falha com erro claro se ausente.
  get geminiApiKey(): string {
    return required('GEMINI_API_KEY');
  },
  geminiModel: optional('GEMINI_MODEL', 'gemini-1.5-flash'),
};
