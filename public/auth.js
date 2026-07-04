/**
 * Cliente mínimo de autenticação (Supabase Auth via REST), sem SDK externo —
 * mantém o frontend 100% vanilla/sem bundler. Expõe window.Auth.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'financeiro.sessao';
  let configPromise = null;

  async function carregarConfig() {
    if (!configPromise) {
      configPromise = fetch('/api/config').then((r) => r.json());
    }
    return configPromise;
  }

  function lerSessao() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function salvarSessao(sessao) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessao));
  }

  function limparSessao() {
    localStorage.removeItem(STORAGE_KEY);
  }

  async function chamarAuth(config, caminho, body) {
    const resposta = await fetch(`${config.supabaseUrl}/auth/v1/${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.supabaseAnonKey },
      body: JSON.stringify(body),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      throw new Error(dados.error_description || dados.msg || dados.error || 'Falha na autenticação.');
    }
    return dados;
  }

  async function entrar(email, senha) {
    const config = await carregarConfig();
    const dados = await chamarAuth(config, 'token?grant_type=password', { email, password: senha });
    salvarSessao({
      accessToken: dados.access_token,
      refreshToken: dados.refresh_token,
      expiraEm: Date.now() + dados.expires_in * 1000,
      email: dados.user?.email ?? email,
    });
    return dados;
  }

  async function cadastrar(email, senha) {
    const config = await carregarConfig();
    return chamarAuth(config, 'signup', { email, password: senha });
  }

  async function renovar() {
    const sessao = lerSessao();
    if (!sessao?.refreshToken) return null;
    const config = await carregarConfig();
    try {
      const dados = await chamarAuth(config, 'token?grant_type=refresh_token', {
        refresh_token: sessao.refreshToken,
      });
      salvarSessao({
        accessToken: dados.access_token,
        refreshToken: dados.refresh_token,
        expiraEm: Date.now() + dados.expires_in * 1000,
        email: dados.user?.email ?? sessao.email,
      });
      return dados.access_token;
    } catch {
      limparSessao();
      return null;
    }
  }

  /** Token válido para uso imediato, renovando sozinho se estiver perto de expirar. */
  async function tokenValido() {
    const sessao = lerSessao();
    if (!sessao) return null;
    const prestesAExpirar = sessao.expiraEm - Date.now() < 60_000;
    if (prestesAExpirar) return renovar();
    return sessao.accessToken;
  }

  function sair() {
    limparSessao();
  }

  function sessaoAtual() {
    return lerSessao();
  }

  window.Auth = { carregarConfig, entrar, cadastrar, renovar, tokenValido, sair, sessaoAtual };
})();
