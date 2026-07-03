/**
 * Aplica db/schema.sql no banco configurado em DATABASE_URL.
 * Uso: npm run build && npm run db:migrate
 */
import fs from 'fs';
import path from 'path';
import { pool } from '../db/pool';

async function main(): Promise<void> {
  const schemaPath = path.resolve(__dirname, '../../db/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.log(`Aplicando schema: ${schemaPath}`);
  await pool.query(sql);
  console.log('Schema aplicado com sucesso.');
  await pool.end();
}

main().catch((err) => {
  console.error('Falha na migração:', err.message);
  process.exit(1);
});
