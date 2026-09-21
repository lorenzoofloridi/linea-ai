"use strict";

const token = location.hash.slice(1);

history.replaceState(
  null,
  '',
  location.pathname
);

const button =
  document.querySelector('#verify-email');

const status =
  document.querySelector('#verify-status');

button.disabled = !token;

button.onclick = async () => {
  button.disabled = true;
  status.textContent = '';

  try {
    const response = await fetch(
      '/api/email-verify',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json'
        },
        body: JSON.stringify({
          token
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw Error(
        data.error ||
          'Verifica non disponibile.'
      );
    }

    status.textContent =
      data.message || 'Email verificata.';

    /*
     * Se l'utente aveva scelto la Demo prima
     * della registrazione, torniamo alla pagina
     * Account mantenendo esplicitamente
     * l'intenzione.
     *
     * workspace.js vedrà che l'email è verificata,
     * attiverà /api/plan-demo e porterà poi
     * l'utente alla Dashboard.
     */
    const intent =
      sessionStorage.getItem(
        'linea_plan_intent'
      );

    await new Promise(
      resolve =>
        setTimeout(resolve, 700)
    );

    if (intent === 'demo') {
      location.assign(
        '/account.html?plan=demo'
      );

      return;
    }

    /*
     * Se era stato scelto un piano a pagamento,
     * torniamo al relativo percorso.
     */
    if (intent) {
      const [plan, period] =
        intent.split(':');

      if (
        ['base', 'plus', 'advanced'].includes(
          plan
        )
      ) {
        sessionStorage.removeItem(
          'linea_plan_intent'
        );

        location.assign(
          '/attiva-piano.html?plan=' +
            encodeURIComponent(plan) +
            '&period=' +
            encodeURIComponent(
              period || 'monthly'
            )
        );

        return;
      }
    }

    /*
     * Verifica normale, senza un piano
     * precedentemente richiesto.
     */
    location.assign('/account.html');
  } catch (error) {
    status.textContent =
      error.message ||
      'Verifica non disponibile. Riprova.';

    button.disabled = false;
  }
};