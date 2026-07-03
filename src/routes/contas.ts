/** CRUD mínimo de contas bancárias. */
import { Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler, AppError } from '../middleware/errorHandler';

export const contasRouter = Router();

contasRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      'SELECT id, nome, tipo, saldo_atual, atualizado_em FROM contas_bancarias ORDER BY id'
    );
    res.json(rows);
  })
);

contasRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nome, tipo } = req.body as { nome?: string; tipo?: string };
    if (!nome || typeof nome !== 'string' || nome.trim().length < 2) {
      throw new AppError('Campo obrigatório: nome (mínimo 2 caracteres).', 400);
    }
    const tiposValidos = ['corrente', 'poupanca', 'pagamento', 'carteira_digital', 'outro'];
    const tipoFinal = tipo && tiposValidos.includes(tipo) ? tipo : 'corrente';
    const { rows } = await pool.query(
      `INSERT INTO contas_bancarias (nome, tipo) VALUES ($1, $2)
       ON CONFLICT (nome) DO NOTHING
       RETURNING *`,
      [nome.trim(), tipoFinal]
    );
    if (rows.length === 0) throw new AppError(`Conta "${nome.trim()}" já existe.`, 409);
    res.status(201).json(rows[0]);
  })
);
