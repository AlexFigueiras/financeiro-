import { MulterError } from 'multer';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../app-error';
import { errorHandler } from '../error-handler';

function fakeRes() {
  const res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as { status: (n: number) => typeof res; json: (b: unknown) => void };
}

describe('errorHandler', () => {
  it('responde com o status e mensagem de um AppError', () => {
    const res = fakeRes();
    errorHandler(new AppError('Não encontrado.', 404), {} as never, res as never, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ erro: 'Não encontrado.', detalhes: null });
  });

  it('mapeia MulterError de tamanho de arquivo para 413 com mensagem clara', () => {
    const res = fakeRes();
    const err = new MulterError('LIMIT_FILE_SIZE');
    errorHandler(err, {} as never, res as never, vi.fn());
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      erro: 'Arquivo muito grande. Envie um arquivo de até 4 MB.',
      detalhes: null,
    });
  });

  it('mapeia outro MulterError para 400 com a mensagem original', () => {
    const res = fakeRes();
    const err = new MulterError('LIMIT_UNEXPECTED_FILE');
    errorHandler(err, {} as never, res as never, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ erro: err.message, detalhes: null });
  });

  it('responde 409 para violação de unicidade do Postgres', () => {
    const res = fakeRes();
    errorHandler({ code: '23505', message: 'duplicado' }, {} as never, res as never, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('responde 500 para erro não tratado', () => {
    const res = fakeRes();
    errorHandler(new Error('boom'), {} as never, res as never, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ erro: 'Erro interno do servidor.', detalhes: null });
  });
});
