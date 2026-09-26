'use strict';
// Uscita dalla visita del gestore alla dashboard di un'azienda.
(() => {
  const button = document.querySelector('#viewer-exit');
  if (!button) return;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const me = await fetch('/api/me').then(r => r.json()).catch(() => ({}));
      await fetch('/api/admin/view-end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      location.assign('/admin.html' + (me?.company?.id ? '#' + encodeURIComponent(me.company.id) : ''));
    } catch {
      button.disabled = false;
    }
  });
})();
