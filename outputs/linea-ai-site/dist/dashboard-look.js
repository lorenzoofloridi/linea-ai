'use strict';
// Anteprima dal vivo di «Aspetto della chat».
(() => {
  const form = document.querySelector('#config-form');
  const box = document.querySelector('#look-preview');
  if (!form || !box) return;
  const T = x => (window.lineaPreferences?.t || String)(x);
  const text = document.querySelector('#look-color-text');
  const valid = v => /^#[0-9a-f]{6}$/i.test(v);
  function update() {
    const el = form.elements;
    const company = el.name.value.trim() || T('la tua azienda');
    const name = el.look_name.value.trim() || company;
    const color = valid(el.look_color.value) ? el.look_color.value : '#6D28D9';
    box.style.setProperty('--accent', color);
    box.classList.toggle('left', el.look_position.value === 'left');
    document.querySelector('#lp-name').textContent = name;
    document.querySelector('#lp-avatar').textContent = (name[0] || 'A').toUpperCase();
    document.querySelector('#lp-greeting').textContent =
      el.look_greeting.value.trim() || T('Ciao, sono l’assistente di') + ' ' + company + '. ' + T('Come posso aiutarti oggi?');
    if (document.activeElement !== text) text.value = color.toUpperCase();
    const avatar = el.look_avatar.value;
    const photo = document.querySelector('#lp-photo');
    photo.hidden = !avatar;
    if (avatar) photo.src = avatar; else photo.removeAttribute('src');
    document.querySelector('#lp-avatar').hidden = Boolean(avatar);
    const thumb = document.querySelector('#logo-thumb');
    thumb.style.backgroundImage = avatar ? 'url("' + avatar + '")' : '';
    thumb.textContent = avatar ? '' : (name[0] || 'A').toUpperCase();
    document.querySelector('#look-avatar-remove').hidden = !avatar;
  }

  // Foto o logo: ritagliata a quadrato e ridotta a 160×160 nel browser.
  const file = document.querySelector('#look-avatar-file');
  document.querySelector('#logo-pick').addEventListener('click', () => file.click());
  const status = document.querySelector('#logo-status');
  file.addEventListener('change', async () => {
    status.textContent = '';
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 8 * 1024 * 1024) {
      status.textContent = T('Scegli un’immagine PNG, JPG o WebP (massimo 8 MB).');
      return;
    }
    try {
      const bitmap = await createImageBitmap(f);
      const side = Math.min(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 160;
      canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 160, 160);
      let data = canvas.toDataURL('image/webp', 0.85);
      if (!data.startsWith('data:image/webp') || data.length > 38000) data = canvas.toDataURL('image/jpeg', 0.85);
      if (data.length > 38000) data = canvas.toDataURL('image/jpeg', 0.6);
      form.elements.look_avatar.value = data;
      update();
      status.textContent = T('Immagine pronta: premi «Salva configurazione».');
    } catch {
      status.textContent = T('Non riesco a leggere questa immagine. Prova con un altro file.');
    }
  });
  document.querySelector('#look-avatar-remove').addEventListener('click', () => {
    form.elements.look_avatar.value = '';
    update();
  });
  text.addEventListener('input', () => {
    const v = text.value.trim();
    if (valid(v)) { form.elements.look_color.value = v; update(); }
  });
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  window.moreaiLookPreview = update;
  update();
})();
