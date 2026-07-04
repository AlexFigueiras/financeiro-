/**
 * Resolve req.tenantId a partir do usuário autenticado (req.auth), criado
 * pelo authMiddleware. Roda DEPOIS dele. Em AUTH_MODE=off, usa DEV_TENANT_ID
 * fixo (sem tocar no domínio tenancy).
 */
import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../errors/app-error';
import { enriquecerContexto } from '../observability/tracing';
import { tenantService } from '../../domains/tenancy';
import './tipos-auth';

export async function tenantMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (env.authMode === 'off') {
    req.tenantId = env.devTenantId;
    enriquecerContexto({ tenantId: req.tenantId });
    next();
    return;
  }

  if (!req.auth) {
    next(new AppError('Autenticação necessária.', 401));
    return;
  }

  try {
    req.tenantId = await tenantService.resolverOuProvisionar(req.auth.userId, req.auth.email);
    enriquecerContexto({ tenantId: req.tenantId });
    next();
  } catch (err) {
    next(err);
  }
}
