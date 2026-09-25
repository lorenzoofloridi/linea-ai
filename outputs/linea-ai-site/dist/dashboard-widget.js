'use strict';
// Scheda «Widget per il tuo sito»: siti autorizzati e codice da incollare.
(() => {
  const $ = s => document.querySelector(s);
  if (!$('#widget-card')) return;
  const T = x => (window.lineaPreferences?.t || String)(x);
  const states = {
    verified: ['Analisi completata: pronto da installare', 'ok'],
    needs_review: ['Analisi da controllare in «Statistiche e fonti»', 'warn'],
    pending: ['Analisi della tua azienda in corso', ''],
    researching: ['Analisi della tua azienda in corso', ''],
    failed: ['Analisi non riuscita: controlla il sito nei dati aziendali', 'warn']
  };
  function show(d) {
    $('#widget-origins').value = (d.origins || []).join('\n');
    $('#widget-code').value = d.snippet || '';
    const [text, kind] = !d.active_plan
      ? ['Demo o piano non attivo: il widget è in pausa', 'warn']
      : !(d.origins || []).length
        ? ['Aggiungi il sito della tua azienda', 'warn']
        : states[d.research_status] || ['Completa i dati aziendali per avviare l’analisi', 'warn'];
    $('#widget-state').textContent = T(text);
    $('#widget-state').className = 'widget-state ' + kind;
  }
  async function call(data) {
    const r = await fetch('/api/widget-settings', data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
    if (r.status === 401) { location.replace('/login.html'); return null; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || 'Operazione non riuscita.');
    return d;
  }
  call().then(d => d && show(d)).catch(e => { $('#widget-state').textContent = T(e.message); });
  $('#widget-form').addEventListener('submit', async e => {
    e.preventDefault();
    const button = e.target.querySelector('button');
    button.disabled = true;
    try {
      const origins = $('#widget-origins').value.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
      const d = await call({ origins });
      if (d) { show(d); $('#widget-status').textContent = T('Siti salvati.'); }
    } catch (err) {
      $('#widget-status').textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
  $('#widget-copy').addEventListener('click', async () => {
    const code = $('#widget-code');
    try { await navigator.clipboard.writeText(code.value); } catch { code.select(); document.execCommand('copy'); }
    $('#widget-copy').textContent = T('Codice copiato');
    setTimeout(() => { $('#widget-copy').textContent = T('Copia il codice'); }, 2000);
  });
})();
