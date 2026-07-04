/** Tela de login/cadastro e alternância login ↔ app. Expõe window.LoginUI. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function mostrarTelaLogin() {
    $('app-shell').hidden = true;
    $('tela-login').hidden = false;
  }

  function mostrarApp() {
    $('tela-login').hidden = true;
    $('app-shell').hidden = false;
  }

  /** aposEntrar: callback disparado após login bem-sucedido (recarrega os dados do painel). */
  function configurarLogin(aposEntrar) {
    const form = $('form-login');
    const erro = $('login-erro');
    const btnSair = $('btn-sair');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      erro.hidden = true;
      try {
        await window.Auth.entrar($('login-email').value.trim(), $('login-senha').value);
        mostrarApp();
        btnSair.hidden = false;
        aposEntrar();
      } catch (err) {
        erro.textContent = err.message;
        erro.className = 'feedback erro';
        erro.hidden = false;
      }
    });

    $('btn-cadastrar').addEventListener('click', async () => {
      erro.hidden = true;
      try {
        await window.Auth.cadastrar($('login-email').value.trim(), $('login-senha').value);
        erro.textContent = 'Conta criada! Verifique seu e-mail (se a confirmação estiver ativa) e entre.';
        erro.className = 'feedback';
        erro.hidden = false;
      } catch (err) {
        erro.textContent = err.message;
        erro.className = 'feedback erro';
        erro.hidden = false;
      }
    });

    btnSair.addEventListener('click', () => {
      window.Auth.sair();
      mostrarTelaLogin();
    });
  }

  window.LoginUI = { mostrarTelaLogin, mostrarApp, configurarLogin };
})();
