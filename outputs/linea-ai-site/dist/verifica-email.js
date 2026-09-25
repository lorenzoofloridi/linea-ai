"use strict";

/*
 * Il token di verifica arriva nel fragment:
 * #TOKEN
 *
 * L'eventuale intenzione Demo arriva invece
 * nella query:
 * ?plan=demo
 *
 * È importante leggerli entrambi PRIMA
 * di ripulire l'URL.
 */
const token =
  location.hash.slice(1);

const params =
  new URLSearchParams(
    location.search
  );

const planFromEmail =
  params.get('plan') === 'demo'
    ? 'demo'
    : null;

/*
 * Se il link email contiene plan=demo,
 * conserviamo anche l'intenzione nella
 * sessione corrente.
 */
if (planFromEmail === 'demo') {
  sessionStorage.setItem(
    'linea_plan_intent',
    'demo'
  );
}

/*
 * Dopo aver recuperato token e piano,
 * togliamo entrambi dall'indirizzo visibile
 * nel browser.
 */
history.replaceState(
  null,
  '',
  location.pathname
);

const button =
  document.querySelector(
    '#verify-email'
  );

const status =
  document.querySelector(
    '#verify-status'
  );

button.disabled = !token;

button.onclick = async () => {
  button.disabled = true;
  status.textContent = '';

  try {
    const response =
      await fetch(
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

    const data =
      await response.json();

    if (!response.ok) {
      throw Error(
        data.error ||
          'Verifica non disponibile.'
      );
    }

    status.textContent =
      data.message ||
      'Email verificata.';

    /*
     * Prima controlliamo l'intenzione
     * ricevuta direttamente dal link email.
     *
     * Se non c'è, manteniamo la compatibilità
     * con l'intenzione già presente nella
     * sessione del browser.
     */
    const intent =
      planFromEmail ||
      sessionStorage.getItem(
        'linea_plan_intent'
      );

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          700
        )
    );

    /*
     * DEMO
     *
     * Torniamo ad Account con ?plan=demo.
     *
     * workspace.js rileverà:
     * - email verificata;
     * - richiesta Demo.
     *
     * Quindi chiamerà /api/plan-demo
     * e porterà automaticamente
     * l'utente alla Dashboard.
     */
    if (intent === 'demo') {
      location.assign(
        '/account.html?plan=demo'
      );

      return;
    }

    /*
     * Piani a pagamento: l'attivazione avviene
     * con il team, quindi portiamo l'utente al
     * supporto con il piano già indicato.
     */
    const paidNames = {
      base: 'Piano Base',
      plus: 'Piano Plus',
      advanced: 'Piano Advanced'
    };
    const paidPlan = intent ? intent.split(':')[0] : '';

    if (paidNames[paidPlan]) {
      sessionStorage.removeItem('linea_plan_intent');
      location.assign(
        '/supporto.html?piano=' +
          encodeURIComponent(paidNames[paidPlan])
      );
      return;
    }

    /*
     * Verifica normale senza una
     * precedente richiesta di piano.
     */
    location.assign(
      '/account.html'
    );
  } catch (error) {
    status.textContent =
      error.message ||
      'Verifica non disponibile. Riprova.';

    button.disabled = false;
  }
};