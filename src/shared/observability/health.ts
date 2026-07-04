/**
 * Liveness: o processo está de pé (não toca o banco).
 * Readiness: o processo consegue atender (banco alcançável).
 */
import { Request, Response } from 'express';
import { pool } from '../../infra/db/pool';

export function liveness(_req: Request, res: Response): void {
  res.json({ status: 'ok' });
}

export async function readiness(_req: Request, res: Response): Promise<void> {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', banco: 'conectado' });
  } catch (err) {
    res.status(503).json({ status: 'degradado', banco: (err as Error).message });
  }
}
