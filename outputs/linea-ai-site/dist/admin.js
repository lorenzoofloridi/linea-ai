'use strict';
// Area del gestore: elenco delle aziende, verifica, accesso, assistente e
// widget, eliminazione. Tutti i controlli di accesso sono fatti dal server
// (/api/admin/*): questa pagina mostra solo ciò che il server restituisce.
(() => {
  const $ = s => document.querySelector(s);
  const T = x => (window.lineaPreferences?.t || String)(x);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined && text !== null) n.textContent = text; if (cls) n.className = cls; return n; };
  const when = v => { const d = new Date(typeof v === 'number' ? v * 1000 : v); return isNaN(d) ? '' : new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(d); };
  const day = v => { const d = new Date(typeof v === 'number' ? v * 1000 : v); return isNaN(d) ? '' : new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(d); };
  const LABELS = { pending: 'In attesa di analisi', under_review: 'Da verificare', verified: 'Approvata', rejected: 'Rifiutata', suspended: 'Sospesa' };
  const RESEARCH = { pending: 'in coda', researching: 'in corso', verified: 'completata e verificata', needs_review: 'completata, da controllare', failed: 'non riuscita' };
  const PLANS = { demo: 'Demo', base: 'Piano Base', plus: 'Piano Plus', advanced: 'Piano Advanced' };
  const SUBS = { trial: 'in prova gratuita', active: 'attivo', past_due: 'pagamento in ritardo', expired: 'scaduto', cancelled: 'disdetto' };
  const FIELDS = { legal_name: 'Ragione sociale', vat: 'Partita IVA', website: 'Sito ufficiale', business_email: 'Email aziendale', business_phone: 'Telefono aziendale', contact_name: 'Referente', contact_role: 'Ruolo del referente', address: 'Sede legale', city: 'Città', postal_code: 'CAP', country: 'Paese' };
  const ACTIONS = { view: 'Entrato nella dashboard', delete: 'Account eliminato', 'status:verified': 'Approvata / riattivata', 'status:rejected': 'Rifiutata', 'status:suspended': 'Accesso sospeso' };

  let companies = [], filter = 'review', current = null, detail = null;

  async function api(path, data) {
    const r = await fetch('/api/admin/' + path, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
    if (r.status === 401) { location.replace('/login.html?next=' + encodeURIComponent('/admin.html' + location.hash)); throw Error(''); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || 'Operazione non riuscita.');
    return d;
  }

  const planText = c => c.is_owner ? T('Gestore · illimitato') : c.plan ? T(PLANS[c.plan] || c.plan) : T('Nessun piano');

  function matches(c) {
    const q = $('#admin-search').value.trim().toLowerCase();
    if (q && ![c.name, c.legal_name, c.website, c.owner_email, c.public_id].some(v => String(v || '').toLowerCase().includes(q))) return false;
    if (filter === 'review') return ['pending', 'under_review'].includes(c.verification) && !c.is_owner;
    if (filter === 'blocked') return ['rejected', 'suspended'].includes(c.verification);
    if (filter === 'verified') return c.verification === 'verified' || c.is_owner;
    return true;
  }

  function renderStats() {
    const count = f => companies.filter(f).length;
    const items = [
      ['Aziende', count(() => true)],
      ['Da verificare', count(c => c.verification === 'under_review')],
      ['Con piano o prova', count(c => ['base', 'plus', 'advanced'].includes(c.plan) && !c.is_owner)],
      ['In Demo', count(c => c.plan === 'demo')],
      ['Sospese o rifiutate', count(c => ['rejected', 'suspended'].includes(c.verification))]
    ];
    $('#admin-stats').replaceChildren(...items.map(([k, v]) => { const d = el('div', undefined, 'admin-stat'); d.append(el('strong', String(v)), el('span', T(k))); return d; }));
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
      const badges = el('div', undefined, 'company-badges');
      badges.append(
        el('small', c.is_owner ? T('Tu') : T(LABELS[c.verification] || c.verification), 'badge v-' + (c.is_owner ? 'verified' : c.verification)),
        el('small', planText(c), 'badge plan')
      );
      b.append(el('strong', c.legal_name || c.name || c.owner_email || c.id), el('span', [c.website, c.owner_email].filter(Boolean).join(' · ')), badges);
      b.addEventListener('click', () => { location.hash = c.id; });
      const li = el('li');
      li.append(b);
      list.append(li);
    }
  }

  async function loadList() {
    companies = (await api('companies')).companies;
    $('#admin-area').hidden = false;
    renderStats();
    renderList();
  }

  function renderDetail(d) {
    detail = d;
    $('#detail-empty').hidden = true;
    $('#detail-body').hidden = false;
    const status = d.is_owner ? 'verified' : d.verification;
    $('#d-verification').textContent = d.is_owner ? T('Il tuo account · illimitato') : T(LABELS[d.verification] || d.verification);
    $('#d-verification').className = 'section-step v-' + status;
    $('#d-name').textContent = d.profile?.legal_name || d.name || d.id;

    const s = d.subscription;
    const summary = [
      ['Account', d.owner_email],
      ['Piano', d.is_owner ? T('Gestore · tutte le funzioni') : d.plan ? T(PLANS[d.plan] || d.plan) : T('Nessun piano attivo')],
      ['Abbonamento', s ? T(SUBS[s.status] || s.status) + (s.period_end ? ' · ' + T('fino al') + ' ' + day(Number(s.period_end)) : '') : '—'],
      ['Widget', ['base', 'plus', 'advanced'].includes(d.plan) ? (d.widget.origins.length ? d.widget.origins.map(o => o.replace('https://', '')).join(', ') : T('attivo, manca il sito')) : T('non incluso (serve un piano o la prova)')],
      ['Codice azienda', d.public_id]
    ];
    $('#d-summary').replaceChildren(...summary.flatMap(([k, v]) => [el('dt', T(k)), el('dd', v || '—')]));

    // Pulsanti in base allo stato.
    const blocked = ['rejected', 'suspended'].includes(d.verification);
    $('#d-approve').hidden = d.is_owner || d.verification === 'verified';
    $('#d-reject').hidden = d.is_owner || d.verification === 'rejected';
    $('#d-suspend').hidden = d.is_owner || d.verification === 'suspended';
    $('#d-reactivate').hidden = d.is_owner || !blocked;
    $('#d-view').hidden = d.is_owner;
    $('#d-danger').hidden = d.is_owner;
    $('#d-reason').value = '';
    $('#d-confirm').value = '';
    $('#d-confirm-name').textContent = d.name || d.id;
    $('#d-delete').disabled = true;

    const dl = $('#d-profile');
    dl.replaceChildren();
    const data = d.profile || {};
    if (!d.profile) dl.append(el('dd', T('L’azienda non ha ancora inserito i suoi dati.')));
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
    $('#d-entries').replaceChildren(...(r?.entries || []).map(t => el('p', t)));
    const sources = $('#d-sources');
    sources.replaceChildren();
    for (const src of r?.sources || []) {
      const href = typeof src === 'string' ? src : src.url;
      if (!href || !/^https?:\/\//i.test(href)) continue;
      const a = el('a', (typeof src === 'object' && src.title) || href);
      a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      const li = el('li'); li.append(a); sources.append(li);
    }
    $('#d-copy').hidden = !(r?.entries || []).length;
    $('#d-knowledge').value = d.ai_knowledge || '';
    $('#d-origins').value = (d.widget?.origins || []).join('\n');
    $('#ai-status').textContent = '';

    const history = [
      ...d.history.map(h => ({ at: h.created_at, text: h.actor + ' · ' + T(LABELS[h.status] || h.status) + (h.reason ? ' — ' + h.reason : '') })),
      ...(d.admin_log || []).filter(x => x.action === 'view').map(x => ({ at: x.created_at, text: x.actor + ' · ' + T(ACTIONS[x.action] || x.action) }))
    ].sort((a, b) => new Date(b.at) - new Date(a.at));
    $('#d-history').replaceChildren(...(history.length ? history.map(h => el('li', when(h.at) + ' · ' + h.text)) : [el('li', T('Nessuna azione registrata.'))]));
  }

  async function openCompany(id) {
    current = id || null;
    renderList();
    $('#detail-body').hidden = true;
    $('#detail-empty').hidden = false;
    if (!id) return;
    renderDetail(await api('company?id=' + encodeURIComponent(id)));
    if (matchMedia('(max-width: 900px)').matches) $('#company-detail').scrollIntoView({ behavior: 'smooth' });
  }

  const status = $('#admin-status');
  const run = async fn => { status.textContent = ''; try { await fn(); } catch (e) { status.textContent = e.message; } };
  const reload = async () => { await loadList(); await openCompany(current); };

  async function decide(value, message) {
    await run(async () => {
      await api('verify', { id: current, status: value, reason: $('#d-reason').value });
      await reload();
      status.textContent = T(message);
    });
  }
  $('#d-approve').addEventListener('click', () => decide('verified', 'Azienda approvata: ora può attivare un piano.'));
  $('#d-reactivate').addEventListener('click', () => decide('verified', 'Accesso riattivato.'));
  $('#d-reject').addEventListener('click', () => { if (confirm(T('Rifiutare questa azienda? Non potrà attivare un piano.'))) decide('rejected', 'Azienda rifiutata.'); });
  $('#d-suspend').addEventListener('click', () => { if (confirm(T('Sospendere l’accesso? L’azienda non potrà usare la dashboard e il suo widget si ferma.'))) decide('suspended', 'Accesso sospeso.'); });
  $('#d-view').addEventListener('click', () => run(async () => {
    const d = await api('view', { id: current });
    location.assign(d.redirect || '/dashboard.html');
  }));
  $('#d-rerun').addEventListener('click', () => run(async () => {
    await api('research', { id: current });
    status.textContent = T('Analisi rilanciata: ricarica la scheda tra qualche minuto.');
    await openCompany(current);
  }));
  $('#d-copy').addEventListener('click', () => {
    const box = $('#d-knowledge');
    const extra = (detail?.research?.entries || []).join('\n\n');
    box.value = ((box.value.trim() ? box.value.trim() + '\n\n' : '') + extra).slice(0, 10000);
    box.focus();
  });
  $('#ai-form').addEventListener('submit', e => {
    e.preventDefault();
    $('#ai-status').textContent = '';
    api('company-ai', { id: current, knowledge: $('#d-knowledge').value, origins: $('#d-origins').value.split(/\s+/).filter(Boolean) })
      .then(d => { $('#d-origins').value = d.origins.join('\n'); $('#ai-status').textContent = T('Salvato. L’assistente usa già le nuove informazioni.'); })
      .catch(err => { $('#ai-status').textContent = err.message; });
  });
  $('#d-confirm').addEventListener('input', () => {
    $('#d-delete').disabled = $('#d-confirm').value.trim() !== (detail?.name || detail?.id || '').trim();
  });
  $('#d-delete').addEventListener('click', () => run(async () => {
    if (!confirm(T('Ultima conferma: eliminare per sempre questo account e tutti i suoi dati?'))) return;
    await api('delete', { id: current, confirm_name: $('#d-confirm').value });
    location.hash = '';
    current = null;
    await loadList();
    await openCompany(null);
    status.textContent = T('Account eliminato.');
  }));

  document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderList();
  }));
  $('#admin-search').addEventListener('input', () => {
    // Durante la ricerca si cerca tra tutte le aziende.
    if ($('#admin-search').value.trim() && filter !== 'all') document.querySelector('[data-filter="all"]').click();
    renderList();
  });
  addEventListener('hashchange', () => run(() => openCompany(decodeURIComponent(location.hash.slice(1)))));

  run(async () => {
    // Se il gestore arriva da una visita, la chiude.
    await fetch('/api/admin/view-end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    await loadList();
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) {
      // Un link dall'email apre la scheda anche se l'azienda non è nel filtro attivo.
      const c = companies.find(x => x.id === id);
      if (c && !matches(c)) { filter = 'all'; document.querySelectorAll('[data-filter]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.filter === 'all'))); renderList(); }
      await openCompany(id);
    }
  });
})();
