'use strict';
// Effetti grafici del sito: intestazione "vetro" allo scorrimento e leggera
// inclinazione 3D delle card al movimento del mouse. Nessun dato, nessuna API.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const shell = document.querySelector('.header-shell');
  if (shell) {
    const sync = () => shell.classList.toggle('scrolled', window.scrollY > 12);
    sync();
    window.addEventListener('scroll', sync, { passive: true });
  }

  // Solo con mouse o trackpad: su touch l'inclinazione non serve.
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  if (!fine.matches || reduce.matches) return;
  const max = 5;
  document.querySelectorAll('[data-tilt]').forEach(card => {
    let frame = 0;
    card.addEventListener('pointermove', event => {
      const r = card.getBoundingClientRect();
      const x = (event.clientX - r.left) / r.width - 0.5;
      const y = (event.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        card.style.setProperty('--rx', (-y * max).toFixed(2) + 'deg');
        card.style.setProperty('--ry', (x * max).toFixed(2) + 'deg');
        card.style.setProperty('--mx', ((x + 0.5) * 100).toFixed(1) + '%');
        card.style.setProperty('--my', ((y + 0.5) * 100).toFixed(1) + '%');
      });
      card.classList.add('tilting');
    });
    card.addEventListener('pointerleave', () => {
      cancelAnimationFrame(frame);
      card.classList.remove('tilting');
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  });
})();
