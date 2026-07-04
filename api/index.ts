/**
 * Entry point serverless para o Vercel. O vercel.json reescreve toda
 * requisição /api/* para esta função; o roteamento interno de sub-rotas
 * (/api/dashboard/resumo, /api/cupons/upload etc.) continua sendo feito
 * pelo próprio Express, então nenhuma rota precisa mudar.
 */
import { criarApp } from '../src/app';

export default criarApp();
