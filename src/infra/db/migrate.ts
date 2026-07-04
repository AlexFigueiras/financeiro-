/**
 * Runner de migrations versionadas (§2.5 do Dev OS).
 * Aplica infra/db/migrations/*.sql em ordem lexicográfica, registrando cada
 * versão em schema_migrations. Arquivos são idempotentes por convenção, mas o
 * registro garante que cada um rode UMA vez por banco.
 *
 * Uso: npm run db:migrate (dev, via tsx) | node dist/infra/db/migrate.js (prod)
 */
import fs from 'fs';
import path from 'path';
import { pool } from './pool';
import { logger } from '../../shared/observability/logger';

function dirMigrations(): string {
  const candidatos = [
    path.resolve(__dirname, '../../../infra/db/migrations'), // dist/ e src/ → raiz
    path.resolve(process.cwd(), 'infra/db/migrations'),
  ];
  for (const dir of candidatos) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error(`Diretório de migrations não encontrado. Procurado em: ${candidatos.join(' | ')}`);
}

async function main(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      versao     TEXT PRIMARY KEY,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const dir = dirMigrations();
  const arquivos = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows } = await pool.query<{ versao: string }>('SELECT versao FROM schema_migrations');
  const aplicadas = new Set(rows.map((r) => r.versao));

  let novas = 0;
  for (const arquivo of arquivos) {
    if (aplicadas.has(arquivo)) continue;
    const sql = fs.readFileSync(path.join(dir, arquivo), 'utf8');
    logger.info(`Aplicando migration: ${arquivo}`);
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (versao) VALUES ($1)', [arquivo]);
    novas++;
  }

  logger.info(novas === 0 ? 'Banco já está atualizado.' : `${novas} migration(s) aplicada(s).`);
  await pool.end();
}

main().catch((err) => {
  logger.error({ err: err.message }, 'Falha na migração');
  process.exit(1);
});
