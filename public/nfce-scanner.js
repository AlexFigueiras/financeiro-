/**
 * Escaneia o QR Code da NFC-e pela câmera (BarcodeDetector) e importa o cupom direto da
 * SEFAZ via POST /api/cupons/nfce. Expõe window.NfceScanner.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let stream = null;
  let rafId = null;
  let chamarApiRef = null;
  let aoSalvarRef = null;

  function pararCamera() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    const video = $('nfce-video');
    if (video) video.srcObject = null;
  }

  function mostrarErro(mensagem) {
    const erro = $('nfce-erro');
    if (!erro) return;
    erro.textContent = mensagem;
    erro.hidden = false;
  }

  function esconderErro() {
    const erro = $('nfce-erro');
    if (erro) erro.hidden = true;
  }

  function fecharModal() {
    pararCamera();
    const modal = $('modal-nfce');
    if (modal) modal.hidden = true;
  }

  async function enviarUrl(url, forcar = false) {
    try {
      await chamarApiRef('/api/cupons/nfce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, forcar }),
      });
      fecharModal();
      if (typeof aoSalvarRef === 'function') await aoSalvarRef();
    } catch (erro) {
      // Nota já importada antes (409 + detalhes.duplicado): pergunta em vez de falhar em silêncio,
      // espelhando o tratamento das dropzones de extrato/cupom.
      if (erro.status === 409 && erro.detalhes && erro.detalhes.duplicado) {
        const processarMesmoAssim = confirm(`${erro.message}\n\nDeseja processar mesmo assim?`);
        if (processarMesmoAssim) {
          await enviarUrl(url, true);
          return;
        }
        fecharModal();
        return;
      }
      mostrarErro(erro.message);
    }
  }

  async function iniciarCamera() {
    const areaCamera = $('nfce-camera-area');
    const video = $('nfce-video');
    if (!video) return;

    if (!('BarcodeDetector' in window)) {
      // Fallback (iOS/Safari sem suporte nativo): só o campo de colar link fica disponível.
      if (areaCamera) areaCamera.hidden = true;
      return;
    }
    if (areaCamera) areaCamera.hidden = false;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch {
      mostrarErro('Não foi possível acessar a câmera. Cole o link da NFC-e abaixo.');
      return;
    }

    video.srcObject = stream;
    await video.play();

    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    let processando = false;

    const loop = async () => {
      if (!stream) return; // câmera já foi encerrada (modal fechado/cancelado)
      if (!processando) {
        try {
          const codigos = await detector.detect(video);
          if (codigos.length > 0) {
            processando = true;
            pararCamera();
            await enviarUrl(codigos[0].rawValue);
            return;
          }
        } catch {
          // frame transitório/ilegível — tenta de novo no próximo quadro
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }

  function configurar(chamarApi, aoSalvar) {
    chamarApiRef = chamarApi;
    aoSalvarRef = aoSalvar;

    const btnAbrir = $('btn-escanear-nfce');
    const modal = $('modal-nfce');
    const btnCancelar = $('btn-cancelar-nfce');
    const formLink = $('form-nfce-link');
    const inputLink = $('nfce-link');

    if (btnAbrir && modal) {
      btnAbrir.addEventListener('click', () => {
        esconderErro();
        if (inputLink) inputLink.value = '';
        modal.hidden = false;
        iniciarCamera();
      });
    }

    if (btnCancelar) btnCancelar.addEventListener('click', fecharModal);

    // Vazamento de câmera é o bug clássico deste tipo de fluxo: encerra as tracks
    // sempre que a aba perde visibilidade enquanto o modal está aberto.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && modal && !modal.hidden) pararCamera();
    });

    if (formLink) {
      formLink.addEventListener('submit', async (e) => {
        e.preventDefault();
        esconderErro();
        const url = inputLink.value.trim();
        if (!url) return;
        await enviarUrl(url);
      });
    }
  }

  window.NfceScanner = { configurar };
})();
