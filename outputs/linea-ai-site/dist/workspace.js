"use strict";

(() => {
  const q = s => document.querySelector(s);

  async function api(path, body) {
    const r = await fetch(
      '/api/' + path,
      body
        ? {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          }
        : {}
    );

    if (r.status === 401) {
      location.assign('/login.html');
      throw Error('Accedi per continuare.');
    }

    const d = await r.json();

    if (!r.ok) {
      throw Error(
        d.error || 'Operazione non riuscita.'
      );
    }

    return d;
  }

  const workspaceStatus =
    q('#workspace-status');

  const show = e => {
    if (workspaceStatus) {
      workspaceStatus.textContent =
        e?.message ||
        'Operazione non riuscita.';
    }
  };

  /*
   * Recupera l'eventuale piano scelto prima
   * della registrazione/login.
   *
   * Se plan=demo è presente nell'URL,
   * conserviamo anche l'intenzione nella
   * sessione corrente.
   */
  function getPlanIntent() {
    const params =
      new URLSearchParams(
        location.search
      );

    if (
      params.get('plan') === 'demo'
    ) {
      sessionStorage.setItem(
        'linea_plan_intent',
        'demo'
      );

      return 'demo';
    }

    return sessionStorage.getItem(
      'linea_plan_intent'
    );
  }

  /*
   * Imposta correttamente il menu
   * "Il tuo spazio".
   *
   * Email non verificata:
   * - Dashboard porta ad Account.
   *
   * Email verificata:
   * - Dashboard torna alla Dashboard.
   */
  function configureWorkspaceMenu(
    verified
  ) {
    const menus =
      document.querySelectorAll(
        '.workspace-menu'
      );

    for (const menu of menus) {
      const dashboardLink =
        Array.from(
          menu.querySelectorAll('a')
        ).find(link =>
          link
            .getAttribute('href')
            ?.includes(
              'dashboard.html'
            )
        );

      for (const link of menu.querySelectorAll('nav a')) {
        if (
          link.getAttribute('href') ===
          location.pathname.split('/').pop()
        ) {
          link.setAttribute('aria-current', 'page');
        }
      }

      if (dashboardLink) {
        dashboardLink.href =
          verified
            ? '/dashboard.html'
            : '/account.html';
      }

      const summary =
        menu.querySelector(
          'summary'
        );

      if (
        summary &&
        !verified
      ) {
        summary.onclick = event => {
          event.preventDefault();

          location.assign(
            '/account.html'
          );
        };
      }
    }
  }

  /*
   * Attiva la Demo soltanto quando:
   * - l'utente aveva richiesto la Demo;
   * - l'email è verificata.
   *
   * Il backend mantiene comunque
   * il controllo definitivo sull'utilizzo
   * unico e sulla durata di 7 giorni.
   */
  async function activateRequestedDemo(
    verification
  ) {
    const intent =
      getPlanIntent();

    if (
      intent !== 'demo' ||
      !verification?.verified
    ) {
      return false;
    }

    if (workspaceStatus) {
      workspaceStatus.textContent =
        'Attivazione della Demo in corso...';
    }

    try {
      await api(
        'plan-demo',
        {}
      );

      sessionStorage.removeItem(
        'linea_plan_intent'
      );

      location.assign(
        '/dashboard.html'
      );

      return true;
    } catch (e) {
      /*
       * Se l'attivazione fallisce,
       * conserviamo l'intenzione Demo.
       */
      show(e);

      return false;
    }
  }

  /*
   * Logout.
   */
  /*
   * Consumo AI del mese (sola lettura: il limite è deciso dal backend).
   */
  async function showUsage() {
    const card = q('#usage-card');

    if (!card) {
      return;
    }

    try {
      const u = await api('ai-usage');
      const format = n => new Intl.NumberFormat('it-IT').format(n);
      const ratio = u.limit ? Math.min(1, u.used / u.limit) : 1;

      q('#usage-used').textContent = format(u.used);
      q('#usage-limit').textContent = format(u.limit || 0);
      q('#usage-bar span').style.width = Math.round(ratio * 100) + '%';
      q('#usage-bar').classList.toggle('warn', ratio >= 0.8 && ratio < 1);
      q('#usage-bar').classList.toggle('full', ratio >= 1);
      q('#usage-note').textContent =
        ratio >= 1
          ? 'Hai raggiunto il limite del mese: l’assistente riprenderà a rispondere il primo giorno del mese prossimo, oppure passando a un piano superiore.'
          : 'Il conteggio riparte il primo giorno di ogni mese. Rimangono ' + format(u.remaining) + ' messaggi.';
      card.hidden = false;
    } catch {
      card.hidden = true;
    }
  }

  const logout =
    q('#logout');

  if (logout) {
    logout.onclick =
      async () => {
        try {
          await api(
            'logout',
            {}
          );

          sessionStorage.removeItem(
            'linea_plan_intent'
          );

          location.assign(
            '/login.html'
          );
        } catch (e) {
          show(e);
        }
      };
  }

  /*
   * Inizializzazione dello spazio
   * aziendale.
   */
  (async () => {
    const me =
      await api('me');

    /*
     * Recuperiamo subito lo stato
     * di verifica dell'email.
     */
    const verification =
      await api(
        'email-verification'
      );

    configureWorkspaceMenu(
      verification.verified
    );

    /*
     * Se l'email non è verificata,
     * le pagine operative non devono
     * essere accessibili.
     *
     * L'Account resta accessibile
     * per completare la verifica.
     */
    const currentPage =
      location.pathname
        .split('/')
        .pop()
        .toLowerCase();

    const protectedWorkspacePages =
      new Set([
        'dashboard.html',
        'portafoglio.html',
        'supporto.html'
      ]);

    if (
      !verification.verified &&
      protectedWorkspacePages.has(
        currentPage
      )
    ) {
      location.replace(
        '/account.html'
      );

      return;
    }

    /*
     * PAGINA ACCOUNT
     */
    if (q('#account-data')) {
      q(
        '#email-verified-state'
      ).textContent =
        verification.verified
          ? 'Email verificata'
          : 'Email non ancora verificata';

      const resend =
        q('#resend-verification');

      if (resend) {
        resend.hidden =
          verification.verified;

        resend.disabled =
          verification.verified;

        resend.onclick =
          async () => {
            resend.disabled = true;

            try {
              /*
               * Comunichiamo al backend
               * anche l'eventuale intenzione
               * di attivare la Demo.
               *
               * Il backend potrà così
               * inserirla nel link contenuto
               * nell'email di verifica.
               */
              await api(
                'email-verification',
                {
                  plan:
                    getPlanIntent() ===
                    'demo'
                      ? 'demo'
                      : null
                }
              );

              if (
                workspaceStatus
              ) {
                workspaceStatus.textContent =
                  'Email di verifica inviata. ' +
                  'Controlla la tua casella di posta ' +
                  'e apri il messaggio “Verifica la tua email — Linea AI”. ' +
                  'Se non lo trovi, controlla anche Spam, Posta indesiderata, ' +
                  'Promozioni o altre cartelle. ' +
                  'La consegna può richiedere qualche minuto.';
              }
            } catch (e) {
              show(e);

              resend.disabled =
                false;
            }
          };
      }

      /*
       * Se l'utente aveva richiesto
       * la Demo e l'email è verificata,
       * attiviamo automaticamente
       * i 7 giorni e passiamo
       * alla Dashboard.
       */
      if (
        await activateRequestedDemo(
          verification
        )
      ) {
        return;
      }

      const state =
        await api(
          'plan-state'
        );

      const entries = [
        [
          'Email account',
          me.email
        ],
        [
          'Azienda',
          me.company.config.name
        ],
        [
          'Settore',
          me.company.config.sector
        ]
      ];

      for (
        const [key, value]
        of Object.entries(
          state.profile?.data ||
            {}
        )
      ) {
        entries.push([
          state.fields[key] ||
            key,
          value
        ]);
      }

      entries.push([
        'Analisi dell’azienda',
        ({
          pending:
            'In corso',
          verified:
            'Completata',
          rejected:
            'Non riuscita',
          needs_review:
            'Completata, da controllare'
        })[
          state.profile?.status
        ] ||
          'Completa i dati aziendali per avviarla'
      ]);

      for (
        const [key, value]
        of entries
      ) {
        const dt =
          document.createElement(
            'dt'
          );

        const dd =
          document.createElement(
            'dd'
          );

        dt.textContent = key;

        dd.textContent =
          value ?? '';

        q(
          '#account-data'
        ).append(
          dt,
          dd
        );
      }

      /*
       * Demo richiesta ma email
       * non ancora verificata.
       */
      if (
        getPlanIntent() ===
          'demo' &&
        !verification.verified &&
        workspaceStatus
      ) {
        workspaceStatus.textContent =
          'Per iniziare la Demo di 7 giorni verifica prima il tuo indirizzo email.';
      }
    }

    /*
     * PAGINA PIANO E CONSUMI
     */
    if (q('#plan-summary')) {
      const state =
        await api(
          'plan-state'
        );

      const names = {
        base: 'Piano Base',
        plus: 'Piano Plus',
        advanced: 'Piano Advanced'
      };

      const now = Date.now() / 1000;
      const sub = state.subscription;
      const dateText = x =>
        new Intl.DateTimeFormat('it-IT', { dateStyle: 'long' })
          .format(new Date(x * 1000));

      if (
        sub &&
        ['trial', 'active', 'past_due'].includes(sub.status)
      ) {
        q('#plan-summary').textContent =
          'Il tuo piano: ' + (names[sub.plan] || sub.plan) + '.';
        q('#plan-period').textContent =
          'Rinnovo o scadenza: ' + dateText(sub.period_end) + '.';
      } else if (
        state.demo &&
        state.demo.ends > now
      ) {
        q('#plan-summary').textContent =
          'Stai usando la Demo gratuita di 7 giorni.';
        q('#plan-period').textContent =
          'La Demo termina il ' + dateText(state.demo.ends) + '. I tuoi dati restano salvati anche dopo.';
      } else {
        q('#plan-summary').textContent =
          'Non hai un piano attivo. I tuoi dati restano salvati: attiva un piano per continuare a usare l’assistente.';
      }

      await showUsage();
    }

    /*
     * PAGINA SUPPORTO: richiesta di attivazione di un piano.
     */
    const planRequest = q('#plan-request');

    if (planRequest) {
      const plan =
        new URLSearchParams(location.search).get('piano');

      const names = {
        base: 'Piano Base',
        plus: 'Piano Plus',
        advanced: 'Piano Advanced'
      };

      if (names[plan]) {
        planRequest.hidden = false;
        planRequest.textContent =
          'Vuoi attivare il ' + names[plan] +
          '? Il messaggio qui sotto è già pronto: controllalo e premi «Invia la richiesta». Lo attiviamo insieme a te.';
      }
    }

    /*
     * Un solo pulsante per tutti: la richiesta parte dal sito
     * (nessun programma di posta necessario) e arriva al team
     * con l'email dell'account come indirizzo di risposta.
     */
    const supportForm = q('#support-form');

    if (supportForm) {
      const params = new URLSearchParams(location.search);
      const names = {
        base: 'Piano Base',
        plus: 'Piano Plus',
        advanced: 'Piano Advanced'
      };
      const periods = {
        monthly: 'mensile',
        annual: 'annuale'
      };
      const fields = supportForm.elements;
      let edited = false;

      function template() {
        const plan = names[fields.plan.value];
        const period = periods[fields.period.value];

        return plan
          ? 'Ciao, vorrei attivare il ' + plan +
              ' con fatturazione ' + period +
              '. Potete contattarmi per i prossimi passi?'
          : 'Ciao, avrei bisogno di aiuto per: ';
      }

      function refreshTemplate() {
        fields.period.disabled = !fields.plan.value;
        if (!edited) fields.message.value = template();
      }

      if (names[params.get('piano')]) {
        fields.plan.value = params.get('piano');
      } else if (location.pathname.endsWith('portafoglio.html')) {
        fields.plan.value = 'base';
      }

      if (periods[params.get('periodo')]) {
        fields.period.value = params.get('periodo');
      }

      refreshTemplate();

      fields.message.addEventListener('input', () => {
        edited = true;
      });
      fields.plan.addEventListener('change', refreshTemplate);
      fields.period.addEventListener('change', refreshTemplate);

      supportForm.addEventListener('submit', async e => {
        e.preventDefault();
        const button = supportForm.querySelector('[type=submit]');
        const status = q('#support-status');
        button.disabled = true;
        status.textContent = '';

        try {
          await api('support-request', {
            plan: fields.plan.value || null,
            period: fields.plan.value ? fields.period.value : null,
            message: fields.message.value
          });
          status.textContent =
            'Richiesta inviata. Ti rispondiamo all’email del tuo account, di solito entro un giorno lavorativo.';
          supportForm.querySelector('.support-row').hidden = true;
          fields.message.disabled = true;
          button.hidden = true;
        } catch (error) {
          status.textContent = error.message;
          button.disabled = false;
        }
      });
    }
  })().catch(show);
})();