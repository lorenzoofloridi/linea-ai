/*
 * MoreAI — chat da installare sul sito dell'azienda.
 * Uso: <script src="https://www.moreai.it/moreai-widget.js" data-company="CODICE" defer></script>
 * Opzionale: data-position="left" per mostrarla a sinistra.
 * Lo script aggiunge solo un pulsante e un riquadro; la chat vera gira in un
 * iframe di moreai.it, isolato dalla pagina che la ospita.
 */
(() => {
  'use strict';
  const script = document.currentScript || document.querySelector('script[src*="moreai-widget.js"][data-company]');
  if (!script || window.__moreaiWidget) return;
  const company = (script.dataset.company || '').trim();
  if (!/^[\w-]{1,100}$/.test(company)) return;
  window.__moreaiWidget = true;
  const base = new URL(script.src, location.href).origin;
  const side = script.dataset.position === 'left' ? 'left' : 'right';

  const host = document.createElement('div');
  host.setAttribute('data-moreai-widget', '');
  const root = host.attachShadow ? host.attachShadow({ mode: 'closed' }) : host;
  root.innerHTML = `
<style>
:host{all:initial}
.btn{position:fixed;${side}:20px;bottom:20px;z-index:2147483646;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;
background:linear-gradient(135deg,#8B5CF6,#6D28D9);color:#fff;box-shadow:0 14px 34px -10px rgba(76,29,149,.7);display:flex;align-items:center;justify-content:center;transition:transform .2s ease}
.btn:hover{transform:translateY(-2px) scale(1.03)}
.btn:focus-visible{outline:3px solid #C4B5FD;outline-offset:3px}
.btn svg{width:28px;height:28px}
.panel{position:fixed;${side}:20px;bottom:92px;z-index:2147483647;width:380px;height:min(620px,calc(100vh - 120px));border-radius:20px;overflow:hidden;
box-shadow:0 30px 80px -20px rgba(18,16,28,.45);background:#fff;opacity:0;transform:translateY(12px) scale(.98);pointer-events:none;transition:opacity .2s ease,transform .2s ease}
.panel.open{opacity:1;transform:none;pointer-events:auto}
iframe{border:0;width:100%;height:100%;display:block}
@media(max-width:520px){.panel{left:0;right:0;bottom:0;width:100%;height:100%;border-radius:0}.panel.open+.btn{display:none}}
@media(prefers-reduced-motion:reduce){.btn,.panel{transition:none}}
</style>
<div class="panel" role="dialog" aria-label="Chat"></div>
<button class="btn" type="button" aria-label="Apri la chat" aria-expanded="false">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg>
</button>`;
  const panel = root.querySelector('.panel');
  const button = root.querySelector('.btn');
  let frame = null;

  function open() {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = 'Chat con l’assistente';
      frame.src = base + '/api/widget-frame?c=' + encodeURIComponent(company);
      frame.allow = '';
      frame.referrerPolicy = 'strict-origin';
      panel.append(frame);
    }
    panel.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-label', 'Chiudi la chat');
  }
  function close() {
    panel.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Apri la chat');
    button.focus();
  }
  button.addEventListener('click', () => (panel.classList.contains('open') ? close() : open()));
  window.addEventListener('message', event => {
    if (event.origin === base && frame && event.source === frame.contentWindow && event.data?.type === 'moreai-close') close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.classList.contains('open')) close();
  });
  (document.body || document.documentElement).append(host);
})();
