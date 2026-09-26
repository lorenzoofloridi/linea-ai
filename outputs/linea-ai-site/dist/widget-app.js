'use strict';
// Chat del widget (dentro l'iframe su moreai.it). Usa le stesse API della
// chat di prova: /api/widget-session per aprire la conversazione, poi /api/chat.
(() => {
  const $ = s => document.querySelector(s);
  // Colore dell'azienda (impostato via JS: la CSP non ammette stili in linea).
  if (/^#[0-9a-f]{6}$/i.test(document.body.dataset.accent || '')) document.body.style.setProperty('--accent', document.body.dataset.accent);
  const box = $('#messages');
  if (!box) return;
  const { company, ticket, greeting } = document.body.dataset;
  let session = null, opening = null, busy = false, closed = false;

  function add(text, kind) {
    const el = document.createElement('div');
    el.className = 'msg ' + kind;
    el.textContent = text;
    box.append(el);
    box.scrollTop = box.scrollHeight;
    return el;
  }
  async function api(path, data) {
    const r = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    let d = {};
    try { d = await r.json(); } catch { throw Error('Connessione interrotta. Riprova tra poco.'); }
    if (!r.ok) throw Error(d.error || 'Servizio non disponibile. Riprova tra poco.');
    return d;
  }
  function getSession() {
    if (session) return Promise.resolve(session);
    if (!opening) opening = api('widget-session', { company, ticket }).then(d => (session = d.session)).finally(() => { opening = null; });
    return opening;
  }
  function reset() {
    session = null; closed = false; box.replaceChildren(); add(greeting, 'bot');
    $('#status').textContent = ''; $('#message').disabled = false; $('#send').disabled = false;
    $('#message').placeholder = 'Scrivi il tuo messaggio…';
  }
  async function send(text) {
    if (busy || closed) return;
    busy = true; $('#send').disabled = true; $('#message').disabled = true;
    add(text, 'user');
    const waiting = add('', 'typing');
    waiting.setAttribute('aria-label', 'L’assistente sta rispondendo');
    for (let i = 0; i < 3; i++) waiting.append(document.createElement('span'));
    try {
      const d = await api('chat', { session: await getSession(), message: text, request_id: crypto.randomUUID() });
      waiting.remove();
      add(d.reply, 'bot');
      if (d.saved) $('#status').textContent = 'Richiesta inviata all’azienda.';
      if (d.closed) { closed = true; $('#message').placeholder = 'Conversazione conclusa'; }
    } catch (e) {
      waiting.className = 'msg error';
      waiting.textContent = e.message;
    } finally {
      busy = false;
      $('#send').disabled = closed; $('#message').disabled = closed;
      if (!closed) $('#message').focus();
    }
  }
  $('#chat').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('#message').value.trim();
    if (!text) return;
    $('#message').value = '';
    send(text);
  });
  $('#restart').addEventListener('click', () => { if (!busy) reset(); });
  $('#close').addEventListener('click', () => window.parent.postMessage({ type: 'moreai-close' }, '*'));
  reset();
})();
