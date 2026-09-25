'use strict';
// Area del gestore: catalogo delle aziende, approvazione/rifiuto e
// sistemazione dell'assistente e del widget di ciascuna azienda.
// Tutti i controlli di accesso sono fatti dal server (/api/admin/*).
(() => {
  const $ = s => document.querySelector(s);
  const T = x => (window.lineaPreferences?.t || String)(x);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined && text !== null) n.textContent = text; if (cls) n.className = cls; return n; };
  const when = v => { const d = new Date(typeof v === 'number' ? v * 1000 : v); return isNaN(d) ? '' : new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(d); };
  const LABELS = { pending: 'In attesa di analisi', under_review: 'Verifica in corso', verified: 'Approvata', rejected: 'Rifiutata', suspended: 'Sospesa' };
  const RESEARCH = { pending: 'in coda', researching: 'in corso', verified: 'completata e verificata', needs_review: 'completata, da controllare', failed: 'non riuscita' };
  const FIELDS = { legal_name: 'Ragione sociale', vat: 'Partita IVA', website: 'Sito ufficiale', business_email: 'Email aziendale', business_phone: 'Telefono aziendale', contact_name: 'Referente', contact_role: 'Ruolo del referente', address: 'Sede legale', city: 'Città', postal_code: 'CAP', country: 'Paese' };

  let companies = [], filter = 'review', current = null;

  async function api(path, data) {
    const r = await fetch('/api/admin/' + path, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
    if (r.status === 401) { location.replace('/login.html?next=' + encodeURIComponent('/admin.html' + location.hash)); throw Error(''); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || 'Operazione non riuscita.');
    return d;
  }

  function matches(c) {
    const q = $('#admin-search').value.trim().toLowerCase();
    if (q && ![c.name, c.legal_name, c.website, c.owner_email].some(v => String(v || '').toLowerCase().includes(q))) return false;
    if (filter === 'review') return ['pending', 'under_review'].includes(c.verification);
    if (filter === 'rejected') return ['rejected', 'suspended'].includes(c.verification);
    if (filter === 'verified') return c.verification === 'verified';
    return true;
  }

  function renderList() {
    const list = $('#company-list');
    list.replaceChildren();
    const rows = companies.filter(matches);
    if (!rows.length) list.append(el('li', T('Nessuna azienda in questo elenco.'), 'empty-state'));
    for (const c of rows) {
      const b = el('button', undefined, 'company-row');
      b.type = 'button';
      b.setAttribute('aria-current', String(c.id === current));
      b.append(
        el('strong', c.legal_name || c.name || c.owner_email || c.id),
        el('span', [c.website, c.owner_email].filter(Boolean).join(' · ')),
        el('small', T(LABELS[c.verification] || c.verification), 'badge v-' + c.verification)
      );
      b.addEventListener('click', () => { location.hash = c.id; });
      const li = el('li');
      li.append(b);
      list.append(li);
    }
  }

  async function loadList() {
    companies = (await api('companies')).companies;
    $('#admin-area').hidden = false;
    renderList();
  }

  async function openCompany(id) {
    current = id || null;
    renderList();
    $('#detail-body').hidden = true;
    $('#detail-empty').hidden = false;
    if (!id) return;
    const d = await api('company?id=' + encodeURIComponent(id));
    $('#detail-empty').hidden = true;
    $('#detail-body').hidden = false;
    $('#d-verification').textContent = T(LABELS[d.verification] || d.verification);
    $('#d-verification').className = 'section-step v-' + d.verification;
    $('#d-name').textContent = d.profile?.legal_name || d.name || d.id;
    const plan = d.plan || '';
    $('#d-meta').textContent = [T('Codice') + ' ' + d.public_id, plan && T('Piano') + ' ' + plan, d.subscription && T('Abbonamento') + ' ' + d.subscription.status].filter(Boolean).join(' · ');
    $('#d-reason').value = '';

    const dl = $('#d-profile');
    dl.replaceChildren();
    if (!d.profile) dl.append(el('dd', T('L’azienda non ha ancora inserito i suoi dati.')));
    const data = d.profile || {};
    for (const k of [...Object.keys(FIELDS).filter(x => x in data), ...Object.keys(data).filter(x => !(x in FIELDS))]) {
      const v = data[k];
      const value = el('dd');
      if (k === 'website' && /^https?:\/\//i.test(v)) { const a = el('a', v); a.href = v; a.target = '_blank'; a.rel = 'noopener noreferrer'; value.append(a); } else value.textContent = v;
      dl.append(el('dt', T(FIELDS[k] || k)), value);
    }

    const r = d.research;
    $('#d-research-state').textContent = r
      ? T('Analisi') + ' ' + T(RESEARCH[r.status] || r.status) + (r.completed_at ? ' · ' + when(r.completed_at) : '') + (r.error ? ' · ' + r.error : '')
      : T('Analisi non ancora avviata.');
    const entries = $('#d-entries');
    entries.replaceChildren(...(r?.entries || []).map(t => el('p', t)));
    const sources = $('#d-sources');
    sources.replaceChildren();
    for (const s of r?.sources || []) {
      const href = typeof s === 'string' ? s : s.url;
      if (!href || !/^https?:\/\//i.test(href)) continue;
      const a = el('a', (typeof s === 'object' && s.title) || href);
      a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      const li = el('li'); li.append(a); sources.append(li);
    }
    $('#d-copy').hidden = !(r?.entries || []).length;
    $('#d-copy').onclick = () => {
      const box = $('#d-knowledge');
      const extra = r.entries.join('\n\n');
      box.value = (box.value.trim() ? box.value.trim() + '\n\n' : '') + extra;
      box.value = box.value.slice(0, 10000);
      box.focus();
    };

    $('#d-knowledge').value = d.ai_knowledge || '';
    $('#d-origins').value = (d.widget?.origins || []).join('\n');
    $('#ai-status').textContent = '';

    $('#d-history').replaceChildren(...d.history.map(h => el('li', when(h.created_at) + ' · ' + h.actor + ' · ' + T(LABELS[h.status] || h.status) + (h.reason ? ' — ' + h.reason : ''))));
  }

  const status = $('#admin-status');
  const run = async fn => { status.textContent = ''; try { await fn(); } catch (e) { status.textContent = e.message; } };

  async function decide(value) {
    await run(async () => {
      await api('verify', { id: current, status: value, reason: $('#d-reason').value });
      await loadList();
      await openCompany(current);
      status.textContent = T(value === 'verified' ? 'Azienda approvata.' : value === 'rejected' ? 'Azienda rifiutata.' : 'Azienda sospesa.');
    });
  }
  $('#d-approve').addEventListener('click', () => decide('verified'));
  $('#d-reject').addEventListener('click', () => { if (confirm(T('Rifiutare questa azienda? Non potrà attivare un piano.'))) decide('rejected'); });
  $('#d-suspend').addEventListener('click', () => { if (confirm(T('Sospendere questa azienda? Il suo assistente smette di rispondere.'))) decide('suspended'); });
  $('#d-rerun').addEventListener('click', () => run(async () => {
    await api('research', { id: current });
    status.textContent = T('Analisi rilanciata: ricarica la scheda tra qualche minuto.');
    await openCompany(current);
  }));
  $('#ai-form').addEventListener('submit', e => {
    e.preventDefault();
    $('#ai-status').textContent = '';
    api('company-ai', { id: current, knowledge: $('#d-knowledge').value, origins: $('#d-origins').value.split(/\s+/).filter(Boolean) })
      .then(d => { $('#d-origins').value = d.origins.join('\n'); $('#ai-status').textContent = T('Salvato. L’assistente usa già le nuove informazioni.'); })
      .catch(err => { $('#ai-status').textContent = err.message; });
  });

  document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderList();
  }));
  $('#admin-search').addEventListener('input', renderList);
  addEventListener('hashchange', () => run(() => openCompany(decodeURIComponent(location.hash.slice(1)))));

  run(async () => {
    await loadList();
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) {
      // Un link dall'email apre la scheda anche se l'azienda non è nel filtro attivo.
      const c = companies.find(x => x.id === id);
      if (c && !matches(c)) { filter = 'all'; document.querySelectorAll('[data-filter]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.filter === 'all'))); }
      await openCompany(id);
    }
  });
})();
