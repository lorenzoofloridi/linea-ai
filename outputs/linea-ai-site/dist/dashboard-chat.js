'use strict';
/*
 * Chat di prova nella dashboard.
 * Usa la stessa API della chat pubblica (/api/session, /api/chat,
 * /api/feedback): il server riconosce l'azienda dalla sessione di
 * login, quindi la prova usa solo dati e configurazione di questa
 * azienda e non può aprire quelle di altre.
 */
(() => {
  const $ = s => document.querySelector(s);
  const box = $('#test-chat-messages');
  if (!box) return;

  let publicId = null;
  let companyName = 'la tua azienda';
  let greeting = 'Ciao, come posso aiutarti oggi?';
  let session = null;
  let sessionPromise = null;
  let busy = false;
  let customGreeting = '';
  // Saluto predefinito nella lingua scelta; quello personalizzato resta com'è.
  const T = x => (window.lineaPreferences?.t || String)(x);
  const defaultGreeting = () =>
    T('Ciao, sono l’assistente di') + ' ' + companyName + '. ' + T('Come posso aiutarti oggi?');
  window.addEventListener('linea-language', () => {
    if (customGreeting || busy || box.children.length > 1 || !publicId) return;
    greeting = defaultGreeting();
    box.firstChild && (box.firstChild.textContent = greeting);
  });

  async function api(path, data) {
    const r = await fetch('/api/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    let d;
    try {
      d = await r.json();
    } catch {
      throw Error('Connessione interrotta. Riprova tra poco.');
    }
    if (r.status === 402) {
      throw Error(d.error || 'La Demo è terminata. Attiva un piano per continuare.');
    }
    if (!r.ok) throw Error(d.error || 'Operazione non riuscita.');
    return d;
  }

  function add(text, kind) {
    const el = document.createElement('div');
    el.className = 'message ' + kind;
    el.textContent = text;
    box.append(el);
    box.scrollTop = box.scrollHeight;
    return el;
  }

  async function getSession() {
    if (session) return session;
    if (!publicId) throw Error('Caricamento dell’azienda in corso, riprova tra un attimo.');
    if (!sessionPromise) {
      sessionPromise = api('session', { company: publicId })
        .then(d => {
          session = d.session;
          if (d.greeting && d.greeting !== greeting) {
            greeting = d.greeting;
            if (box.children.length === 1) box.firstChild.textContent = greeting;
          }
          return session;
        })
        .finally(() => { sessionPromise = null; });
    }
    return sessionPromise;
  }

  function setBusy(value) {
    busy = value;
    $('#test-chat-send').disabled = value;
    $('#test-chat-input').disabled = value;
    $('#test-chat-reset').disabled = value;
  }

  function reset() {
    session = null;
    sessionPromise = null;
    box.replaceChildren();
    add(greeting, 'bot');
    $('#test-chat-feedback').hidden = true;
    $('#test-chat-feedback-form').reset();
    $('#test-chat-feedback-result').textContent = '';
    $('#test-chat-feedback-form button').disabled = false;
    $('#test-chat-note').textContent = 'Conversazione di prova';
    $('#test-chat-input').placeholder = 'Scrivi il tuo messaggio…';
  }

  async function send(text) {
    if (busy || !text.trim()) return;
    setBusy(true);
    add(text, 'user');
    const waiting = add('', 'waiting');
    waiting.setAttribute('aria-label', 'L’assistente sta rispondendo');
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.className = 'typing-dot';
      dot.setAttribute('aria-hidden', 'true');
      waiting.append(dot);
    }
    try {
      const d = await api('chat', {
        session: await getSession(),
        message: text,
        request_id: crypto.randomUUID()
      });
      waiting.remove();
      add(d.reply, 'bot');
      if (d.closed) $('#test-chat-input').placeholder = 'Conversazione conclusa: premi ↻ per iniziarne una nuova';
      if (d.saved) {
        $('#test-chat-note').textContent = 'Richiesta registrata: la trovi in «Richieste»';
        $('#test-chat-feedback').hidden = false;
        if (typeof refresh === 'function') refresh().catch(() => {});
      }
    } catch (e) {
      waiting.className = 'message error';
      waiting.textContent = e.message;
    } finally {
      setBusy(false);
      $('#test-chat-input').focus({ preventScroll: true });
    }
  }

  // L'azienda viene dalla sessione di login, non da parametri dell'URL.
  fetch('/api/me')
    .then(r => (r.ok ? r.json() : null))
    .then(me => {
      if (!me?.company) return;
      publicId = me.company.public_id;
      companyName = me.company.config?.name || companyName;
      $('#test-chat-name').textContent = companyName;
      customGreeting = me.company.config?.agent?.branding?.greeting || '';
      greeting = customGreeting || defaultGreeting();
      if (!busy && box.children.length <= 1) reset();
    })
    .catch(() => {});

  // «Prova la tua AI» scorre qui senza aprire un'altra pagina.
  $('#company-chat')?.addEventListener('click', e => {
    e.preventDefault();
    $('#prova-ai').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('#test-chat-input').focus({ preventScroll: true }), 450);
  });

  $('#test-chat-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#test-chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    send(text);
  });

  $('#test-chat-reset').addEventListener('click', () => {
    if (busy) return;
    if (box.children.length > 1 && !confirm((window.lineaPreferences?.t||String)('Iniziare una nuova conversazione di prova?'))) return;
    reset();
    $('#test-chat-input').focus();
  });

  $('#test-chat-end').addEventListener('click', () => {
    // Apre sempre il riquadro (non lo richiude se è già aperto).
    const panel = $('#test-chat-feedback');
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    panel.querySelector('input[name=rating]')?.focus({ preventScroll: true });
  });

  $('#test-chat-feedback-form').addEventListener('submit', async e => {
    e.preventDefault();
    const button = e.target.querySelector('button');
    const result = $('#test-chat-feedback-result');
    button.disabled = true;
    try {
      await api('feedback', {
        session: await getSession(),
        rating: Number(new FormData(e.target).get('rating')),
        comment: $('#test-chat-feedback-text').value
      });
      result.textContent = 'Grazie, il feedback è salvato: lo trovi in «Statistiche e fonti». Per lasciarne un altro, inizia una nuova conversazione con ↻.';
      // Aggiorna subito statistiche e feedback della dashboard.
      if (typeof overview === 'function') overview().catch(() => {});
    } catch (err) {
      result.textContent = err.message;
      button.disabled = false;
    }
  });

  reset();
})();
