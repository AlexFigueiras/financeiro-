# PWA e publicação na Google Play Store

O sistema agora é um **PWA instalável**. Este documento explica o que foi adicionado e o passo a passo para publicar o app na Play Store como TWA (Trusted Web Activity).

---

## 1. O que foi adicionado ao PWA

* `public/manifest.webmanifest` — nome, ícones, cor de tema, `display: standalone`.
* `public/sw.js` — service worker com cache do *app shell* (HTML/CSS/JS/ícones). Chamadas a `/api/*` nunca são cacheadas: os dados financeiros sempre vêm da rede.
* `public/icons/` — ícones gerados (`192`, `512`, `512` maskable, apple-touch-icon, favicon).
* Tags no `<head>` de `public/index.html`: `theme-color`, `manifest`, ícones, meta tags de iOS/Android.
* Registro do service worker no final de `public/index.html`.
* `vercel.json` — headers corretos para `manifest.webmanifest` (`application/manifest+json`) e `sw.js` (`Service-Worker-Allowed`, sem cache).

Depois do próximo deploy no Vercel, teste no Chrome do Android (ou Chrome desktop com DevTools → Application → Manifest) se o app é instalável ("Adicionar à tela inicial").

**Regenerar os ícones**: se quiser um ícone diferente, edite/rode `public/icons` a partir de um logo próprio (qualquer gerador de PWA icon, ex. https://realfavicongenerator.net ou PWABuilder Image Generator) e substitua os arquivos mantendo os mesmos nomes.

---

## 2. Publicar na Play Store (via PWABuilder — recomendado)

Não é possível gerar/assinar/enviar o pacote Android automaticamente por aqui — isso exige uma conta Google Play Console (taxa única de US$ 25) e upload manual. Passo a passo:

1. **Deploy em produção** — confirme que `https://SEU-DOMINIO.vercel.app` (ou domínio próprio) está no ar com o manifest e o service worker funcionando.
2. Acesse **https://www.pwabuilder.com** e cole a URL do site.
3. O PWABuilder audita o manifest/service worker e mostra a pontuação. Clique em **"Package for stores" → Android**.
4. Escolha o tipo de pacote **Trusted Web Activity (TWA)**. Preencha:
   * **Package ID** (ex. `br.com.seunome.financeiro`).
   * **App name / Launcher name**.
   * Deixe **"Sign the package"** marcado para o PWABuilder gerar uma keystore nova (ou envie a sua, se já tiver uma).
5. Baixe o `.zip` gerado. Ele contém:
   * `app-release-signed.aab` (ou `.apk`) — o pacote para subir na Play Store.
   * `signing.keystore` + senha — **guarde em local seguro, sem essa chave você não consegue mais atualizar o app**.
   * `assetlinks.json` — arquivo de verificação de domínio.
6. **Publicar o `assetlinks.json`**: copie o conteúdo gerado para `public/.well-known/assetlinks.json` neste repositório e faça deploy. Esse arquivo prova ao Android que o app TWA e o site pertencem ao mesmo dono, o que remove a barra de endereço do navegador dentro do app (fica com cara de app nativo). Formato:
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "br.com.seunome.financeiro",
       "sha256_cert_fingerprints": ["FINGERPRINT_GERADO_PELO_PWABUILDER"]
     }
   }]
   ```
7. Confirme em `https://SEU-DOMINIO/.well-known/assetlinks.json` que o arquivo está acessível publicamente (sem exigir login).
8. Crie uma conta em **https://play.google.com/console** (taxa única, verificação de identidade pode levar 1–2 dias).
9. No Play Console: **Criar app** → preencha ficha da loja (nome, descrição, categoria "Finanças", ícone 512×512, capturas de tela do app) → em **"Versões" → "Produção"** (ou faixa de teste interno primeiro), envie o `.aab` gerado no passo 5.
10. Preencha os questionários obrigatórios (classificação de conteúdo, privacidade de dados, política de privacidade — como o app lida com dados financeiros/bancários, é necessário ter uma URL de política de privacidade).
11. Envie para revisão. A análise do Google costuma levar de algumas horas a poucos dias.

### Alternativa: Bubblewrap CLI
Se preferir gerar o `.aab` localmente em vez de usar o site do PWABuilder, use a mesma tecnologia via CLI:
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://SEU-DOMINIO/manifest.webmanifest
bubblewrap build
```
Requer JDK 17+ e Android SDK instalados (o `bubblewrap init` oferece baixar automaticamente).

---

## 3. Itens que valem revisão antes de publicar

* **Política de privacidade**: obrigatória na Play Store para apps que lidam com dados financeiros. Precisa de uma URL pública (pode ser uma página simples hospedada no próprio domínio).
* **Ícone/nome definitivos**: os ícones atuais em `public/icons/` são um placeholder gerado (gráfico de barras nas cores do app). Troque por uma identidade visual definitiva antes do envio, se desejar.
* **Autenticação**: se o sistema hoje não tem login/autenticação, avalie se faz sentido publicar publicamente na loja (qualquer pessoa que instalar o app acessa os mesmos dados). Considere adicionar autenticação antes de publicar.
