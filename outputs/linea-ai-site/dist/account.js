"use strict";

const form = document.querySelector('#account-form');
const status = document.querySelector('#account-status');

const mode = document.body.dataset.mode;

/*
 * Recupera l'eventuale piano scelto prima
 * di arrivare alla registrazione/login.
 */
function readPlanIntent() {
  const params = new URLSearchParams(location.search);
  const plan = params.get('plan');
  const period =
    params.get('period') === 'annual'
      ? 'annual'
      : 'monthly';

  if (plan === 'demo') {
    sessionStorage.setItem(
      'linea_plan_intent',
      'demo'
    );

    return 'demo';
  }

  if (
    ['base', 'plus', 'advanced'].includes(plan)
  ) {
    const intent = plan + ':' + period;

    sessionStorage.setItem(
      'linea_plan_intent',
      intent
    );

    return intent;
  }

  return sessionStorage.getItem(
    'linea_plan_intent'
  );
}

const planIntent = readPlanIntent();

/*
 * Se l'utente arriva dalla Demo e poi sceglie
 * "Hai già un account? Accedi", manteniamo
 * l'intenzione anche passando al login.
 */
const loginLink = document.querySelector(
  '.auth-switch a'
);

if (loginLink && planIntent) {
  if (planIntent === 'demo') {
    loginLink.href = '/login.html?plan=demo';
  } else {
    const [plan, period] =
      planIntent.split(':');

    loginLink.href =
      '/login.html?plan=' +
      encodeURIComponent(plan) +
      '&period=' +
      encodeURIComponent(period || 'monthly');
  }
}

/*
 * Mostra/nasconde la password.
 */
const passwordToggle =
  document.querySelector('.password-toggle');

if (passwordToggle) {
  passwordToggle.addEventListener(
    'click',
    e => {
      const button = e.currentTarget;
      const input = form.elements.password;

      const visible =
        input.type === 'password';

      input.type =
        visible ? 'text' : 'password';

      button.setAttribute(
        'aria-pressed',
        String(visible)
      );

      button.setAttribute(
        'aria-label',
        visible
          ? 'Nascondi password'
          : 'Mostra password'
      );

      const slash =
        button.querySelector('.eye-slash');

      if (slash) {
        slash.style.display =
          visible ? 'none' : '';
      }
    }
  );
}

/*
 * Decide dove andare dopo registrazione/login.
 *
 * IMPORTANTE:
 * la Demo NON viene attivata qui.
 * Prima deve essere verificata l'email.
 */
function destinationAfterAuthentication(
  response
) {
  const intent =
    sessionStorage.getItem(
      'linea_plan_intent'
    );

  if (intent === 'demo') {
    /*
     * account.html gestisce la verifica email.
     * Manteniamo ?plan=demo così il percorso
     * non viene perso.
     */
    return '/account.html?plan=demo';
  }

  if (intent) {
    const [plan] = intent.split(':');
    const names = {
      base: 'Piano Base',
      plus: 'Piano Plus',
      advanced: 'Piano Advanced'
    };

    /*
     * Piani a pagamento: i prezzi sono visibili
     * solo dopo il login, quindi riportiamo
     * l'utente alla sezione Offerte.
     */
    if (names[plan] && response.redirect !== '/account.html') {
      sessionStorage.removeItem('linea_plan_intent');
      return '/#offerte';
    }
  }

  return response.redirect || '/dashboard.html';
}

form.addEventListener(
  'submit',
  async e => {
    e.preventDefault();

    const button =
      form.querySelector('[type=submit]');

    button.disabled = true;

    status.textContent = '';
    status.classList.remove(
      'login-success'
    );

    const data =
      Object.fromEntries(
        new FormData(form)
      );

    for (
      const k of [
        'terms',
        'privacy',
        'marketing',
        'remember'
      ]
    ) {
      data[k] = data[k] === 'on';
    }

    try {
      if (
        mode === 'registrati' &&
        data.password !==
          data.password_confirm
      ) {
        throw Error(
          'Le password non coincidono.'
        );
      }

      const endpoint =
        mode === 'registrati'
          ? 'register'
          : 'login';

      const r = await fetch(
        '/api/' + endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify(data)
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw Error(
          d.error ||
            'Accesso non disponibile.'
        );
      }

      if (mode === 'login') {
        status.classList.add(
          'login-success'
        );

        const check =
          document.createElement('span');

        check.className =
          'login-check';

        check.setAttribute(
          'aria-hidden',
          'true'
        );

        check.textContent = '✓';

        status.replaceChildren(
          check,
          document.createTextNode(
            'Accesso riuscito'
          )
        );

        button.textContent =
          'Accesso riuscito';

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              1200
            )
        );
      }

      location.assign(
        destinationAfterAuthentication(d)
      );
    } catch (err) {
      status.textContent =
        err.message ||
        'Accesso non disponibile.';

      button.disabled = false;
    }
  }
);