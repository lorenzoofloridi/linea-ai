'use strict';
// Attivazione del piano in 4 passaggi: dati aziendali e analisi, metodo di
// pagamento, prova gratuita di 14 giorni, pagamento (simulato).
(() => {
  const $ = s => document.querySelector(s);
  const T = x => (window.lineaPreferences?.t || String)(x);
  const params = new URLSearchParams(location.search);
  let plan = ['base', 'plus', 'advanced'].includes(params.get('plan') || params.get('piano')) ? (params.get('plan') || params.get('piano')) : 'base';
  let period = (params.get('period') || params.get('periodo')) === 'annual' ? 'annual' : 'monthly';
  let catalog = null, state = null, offer = null, method = null, poll = null;

  const money = cents => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  const date = seconds => new Intl.DateTimeFormat('it-IT', { dateStyle: 'long' }).format(new Date(seconds * 1000));
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };

  async function api(path, data) {
    const r = await fetch('/api/' + path, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
    if (r.status === 401) { location.replace('/login.html?next=' + encodeURIComponent(location.pathname + location.search)); throw Error(''); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || 'Operazione non riuscita.');
    return d;
  }

  const selected = () => catalog.plans.find(p => p.code === plan);
  const price = p => (period === 'monthly' ? p.monthly_cents : p.annual_cents);

  function renderPlans() {
    const box = $('#plan-options');
    box.replaceChildren();
    for (const p of catalog.plans.filter(p => ['base', 'plus', 'advanced'].includes(p.code) && p.available)) {
      const b = el('button', undefined, 'plan-option');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(p.code === plan));
      b.append(el('small', T('14 giorni di prova'), 'trial-badge'), el('strong', p.name), el('span', money(price(p)) + (period === 'monthly' ? ' ' + T('al mese') : ' ' + T('all’anno'))));
      b.addEventListener('click', () => { plan = p.code; renderAll(); });
      box.append(b);
    }
    document.querySelectorAll('[data-period]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.period === period)));
    const p = selected();
    $('#checkout-title').textContent = T('Attiva il') + ' ' + p.name + '.';
    $('#plan-price').textContent = period === 'monthly'
      ? money(p.monthly_cents) + ' ' + T('al mese') + ' · ' + new Intl.NumberFormat('it-IT').format(p.messages) + ' ' + T('messaggi AI al mese')
      : money(p.annual_cents) + ' ' + T('all’anno') + ' (' + money(p.annual_monthly_cents) + ' ' + T('al mese') + ') · ' + T('risparmi il') + ' ' + catalog.discount + '%';
  }

  function renderFields() {
    const box = $('#company-fields');
    if (box.children.length) return;
    for (const [key, label] of Object.entries(state.fields)) {
      const wrap = el('label', T(label));
      const input = el('input');
      input.name = key;
      input.required = true;
      input.maxLength = 250;
      input.value = state.profile?.data?.[key] || (key === 'country' ? 'IT' : '');
      if (key === 'business_email') input.type = 'email';
      if (key === 'website') { input.type = 'url'; input.placeholder = 'https://www.tuaazienda.it'; }
      wrap.append(input);
      box.append(wrap);
    }
  }

  function renderAnalysis() {
    const research = state.research?.status;
    const v = offer.verification;
    const box = $('#analysis-box');
    let title = '', text = '', kind = '';
    if (!state.profile) { box.hidden = true; return; }
    if (v === 'rejected' || v === 'suspended') {
      title = 'Verifica non approvata'; text = 'Non possiamo attivare un piano per questa azienda. Per informazioni scrivici dalla pagina Supporto.'; kind = 'bad';
    } else if (offer.approved) {
      title = 'Azienda verificata'; text = 'Abbiamo trovato la tua azienda e preparato il tuo assistente con le informazioni raccolte. Puoi proseguire.'; kind = 'ok';
    } else if (['pending', 'researching'].includes(research)) {
      title = 'Analisi in corso'; text = 'L’AI sta cercando la tua azienda sul web. Puoi restare su questa pagina: si aggiorna da sola.'; kind = 'busy';
    } else {
      title = 'Verifica in corso'; text = 'Non siamo riusciti a confermare in automatico tutti i dati: il nostro team sta controllando. L’esito comparirà su questa pagina, di solito entro 1 giorno lavorativo.'; kind = 'wait';
    }
    box.hidden = false;
    box.className = 'analysis-box ' + kind;
    $('#analysis-title').textContent = T(title);
    $('#analysis-text').textContent = T(text);
  }

  function renderMethods() {
    const box = $('#methods');
    if (box.children.length) return;
    for (const m of state.methods) {
      const b = el('button', undefined, 'method');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.disabled = !m.recurring;
      b.dataset.code = m.code;
      b.append(el('strong', T(m.label)));
      if (!m.recurring) b.append(el('small', T('Non adatto ai rinnovi automatici')));
      b.addEventListener('click', () => {
        method = m.code;
        box.querySelectorAll('.method').forEach(x => x.setAttribute('aria-checked', String(x === b)));
        renderAll();
      });
      box.append(b);
    }
  }

  function renderPay() {
    const p = selected();
    const trial = offer.trial_available && $('#trial-check').checked;
    const amount = price(p);
    const now = Date.now() / 1000;
    const first = trial ? now + offer.trial_days * 86400 : now;
    const rows = [
      ['Piano', p.name + ' · ' + T(period === 'monthly' ? 'Mensile' : 'Annuale')],
      ['Metodo', T(state.methods.find(m => m.code === method)?.label || '')],
      ['Oggi paghi', money(trial ? 0 : amount)],
      [trial ? 'Primo addebito' : 'Prossimo rinnovo', date(trial ? first : first + (period === 'monthly' ? 30 : 365) * 86400) + ' · ' + money(amount)]
    ];
    $('#pay-summary').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', T(k)), el('dd', v)]));
    $('#pay-button').textContent = trial ? T('Inizia la prova gratuita') : T('Paga') + ' ' + money(amount);
    $('#pay-button').disabled = !$('#pay-confirm').checked;
  }

  function renderSubscription() {
    const s = state.subscription;
    const active = s && ['trial', 'active', 'past_due'].includes(s.status) && Number(s.period_end) > Date.now() / 1000;
    $('#subscription-card').hidden = !active;
    if (!active) return false;
    const p = catalog.plans.find(x => x.code === s.plan);
    $('#sub-title').textContent = (p?.name || '') + ' · ' + T(s.status === 'trial' ? 'Prova gratuita in corso' : 'Piano attivo');
    $('#sub-detail').textContent = s.cancel_at_end
      ? T('Rinnovo disdetto: il piano resta attivo fino al') + ' ' + date(s.period_end) + '.'
      : T(s.status === 'trial' ? 'Primo addebito il' : 'Prossimo rinnovo il') + ' ' + date(s.period_end) + ' · ' + money(s.amount_cents) + '.';
    $('#cancel-plan').disabled = !!s.cancel_at_end;
    return true;
  }

  function renderAll() {
    renderPlans();
    renderFields();
    renderAnalysis();
    const subscribed = renderSubscription();
    const blocked = ['rejected', 'suspended'].includes(offer.verification);
    const ready = offer.approved && !subscribed && !blocked;
    $('#plan-choice').hidden = subscribed;
    $('#step-method').hidden = !ready;
    if (ready) renderMethods();
    $('#step-trial').hidden = !ready || !method;
    $('#trial-used').hidden = offer.trial_available;
    $('#trial-check').closest('label').hidden = !offer.trial_available;
    $('#step-pay').hidden = !ready || !method;
    if (ready && method) renderPay();
    // Aggiornamento automatico mentre l'analisi o la verifica sono in corso.
    const waiting = state.profile && !offer.approved && !blocked;
    clearTimeout(poll);
    if (waiting) poll = setTimeout(() => load().catch(() => {}), ['pending', 'researching'].includes(state.research?.status) ? 6000 : 30000);
  }

  async function load() {
    [catalog, state, offer] = await Promise.all([api('plans'), api('plan-state'), api('plan-offer')]);
    if (!catalog.authenticated) { location.replace('/login.html'); return; }
    if (state.subscription && !params.get('plan') && !params.get('piano')) plan = state.subscription.plan || plan;
    renderAll();
  }

  const status = $('#checkout-status');
  const run = async fn => { status.textContent = ''; try { await fn(); } catch (e) { status.textContent = e.message; } };

  document.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => { period = b.dataset.period; renderAll(); }));
  $('#trial-check').addEventListener('change', renderPay);
  $('#pay-confirm').addEventListener('change', renderPay);

  $('#company-form').addEventListener('submit', e => {
    e.preventDefault();
    const button = $('#analyze-button');
    button.disabled = true;
    run(async () => {
      try {
        await api('plan-profile', Object.fromEntries(new FormData(e.target)));
        await load();
        $('#analysis-box').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } finally {
        button.disabled = false;
      }
    });
  });

  $('#pay-button').addEventListener('click', () => {
    const button = $('#pay-button');
    button.disabled = true;
    $('#pay-status').textContent = '';
    run(async () => {
      try {
        const d = await api('plan-checkout', {
          plan, period, method,
          trial: offer.trial_available && $('#trial-check').checked,
          confirm: $('#pay-confirm').checked
        });
        await load();
        status.textContent = T(d.status === 'trial'
          ? 'Prova gratuita attivata. Nessun addebito reale: i pagamenti sono in modalità di prova.'
          : 'Piano attivato. Nessun addebito reale: i pagamenti sono in modalità di prova.');
        $('#subscription-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {
        $('#pay-status').textContent = err.message;
        button.disabled = false;
      }
    });
  });

  $('#cancel-plan').addEventListener('click', () => run(async () => {
    if (!confirm(T('Vuoi disdire il rinnovo? Il piano resta attivo fino alla scadenza.'))) return;
    await api('plan-cancel', {});
    await load();
    $('#cancel-status').textContent = T('Rinnovo disdetto.');
  }));

  // Se la pagina torna attiva, ricarica lo stato.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state) load().catch(() => {}); });
  run(load);
})();
