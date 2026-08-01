/** Dropzone genérico de upload (extrato OFX ou cupom fiscal). Expõe window.Dropzone. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function resumoUpload(r) {
    const partes = [];
    if (typeof r.importadas === 'number') partes.push(`${r.importadas} importada(s)`);
    if (typeof r.ignoradasDuplicadas === 'number' && r.ignoradasDuplicadas > 0) {
      partes.push(`${r.ignoradasDuplicadas} duplicada(s) ignorada(s)`);
    }
    if (typeof r.itens === 'number') partes.push(`${r.itens} item(ns) extraído(s)`);
    if (typeof r.reconciliacoesEfetuadas === 'number' && r.reconciliacoesEfetuadas > 0) {
      partes.push(`${r.reconciliacoesEfetuadas} reconciliação(ões)`);
    }
    return partes.length > 0 ? `(${partes.join(', ')})` : '';
  }

  /**
   * deps: { chamarApi, mostrarFeedback, aoConcluir }.
   * opcoes.obterCamposExtras: função async opcional chamada uma vez por envio
   * (não se repete no reenvio automático de "forcar"), que devolve campos extras
   * pro FormData (ex.: conta_id) ou null pra cancelar o envio. Usada só pelo
   * dropzone de cupom, pra perguntar a conta antes de enviar — o de extrato OFX
   * não passa essa opção e continua com o comportamento de sempre.
   */
  function configurar(idZona, idInput, url, nomeAmigavel, textoProcessando, deps, opcoes = {}) {
    const { chamarApi, mostrarFeedback, aoConcluir } = deps;
    const { obterCamposExtras } = opcoes;
    const zona = $(idZona);
    const input = $(idInput);
    const permiteMultiplo = input.multiple;
    const legenda = zona.querySelector('span');
    const legendaOriginal = legenda.textContent;

    const montarFormulario = (arquivos, forcar, camposExtras) => {
      const form = new FormData();
      if (permiteMultiplo) {
        for (let i = 0; i < arquivos.length; i++) {
          form.append('arquivo', arquivos[i]);
        }
      } else {
        form.append('arquivo', arquivos[0]);
      }
      if (forcar) form.append('forcar', 'true');
      if (camposExtras) {
        for (const [chave, valor] of Object.entries(camposExtras)) form.append(chave, valor);
      }
      return form;
    };

    const enviar = async (arquivos, forcar = false, camposExtras = undefined) => {
      if (!arquivos || arquivos.length === 0) return;
      if (camposExtras === undefined && obterCamposExtras) {
        camposExtras = await obterCamposExtras();
        if (camposExtras === null) { input.value = ''; return; } // usuário cancelou
      }
      zona.classList.add('enviando');
      if (textoProcessando) legenda.textContent = textoProcessando;
      try {
        // O spinner (classe .enviando) só some no finally, depois do await abaixo —
        // ou seja, continua girando até os valores atualizados aparecerem na tela.
        const r = await chamarApi(url, { method: 'POST', body: montarFormulario(arquivos, forcar, camposExtras) });
        mostrarFeedback(`${nomeAmigavel}: ${r.mensagem} ${resumoUpload(r)}`, 'sucesso');
        await aoConcluir();
      } catch (erro) {
        // Reenvio do mesmo arquivo detectado pelo backend (409 + detalhes.duplicado):
        // pergunta em vez de simplesmente falhar em silêncio.
        if (erro.status === 409 && erro.detalhes && erro.detalhes.duplicado) {
          zona.classList.remove('enviando');
          legenda.textContent = legendaOriginal;
          const processarMesmoAssim = confirm(
            `${erro.message}\n\nDeseja processar mesmo assim?`
          );
          if (processarMesmoAssim) {
            await enviar(arquivos, true, camposExtras);
            return;
          }
          mostrarFeedback(`${nomeAmigavel}: envio cancelado (arquivo já importado).`, '');
        } else {
          mostrarFeedback(`${nomeAmigavel}: ${erro.message}`, 'erro');
        }
      } finally {
        zona.classList.remove('enviando');
        legenda.textContent = legendaOriginal;
        input.value = '';
      }
    };

    zona.addEventListener('click', () => input.click());
    zona.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', () => enviar(input.files));
    zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrastando'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
    zona.addEventListener('drop', (e) => {
      e.preventDefault();
      zona.classList.remove('arrastando');
      enviar(e.dataTransfer.files);
    });
  }

  window.Dropzone = { configurar };
})();
