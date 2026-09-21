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

  const workspaceStatus = q('#workspace-status');

  const show = e => {
    if (workspaceStatus) {
      workspaceStatus.textContent =
        e?.message || 'Operazione non riuscita.';
    }
  };

  /*
   * Recupera l'eventuale piano scelto prima
   * della registrazione/login.
   */
  function getPlanIntent() {
    const params =
      new URLSearchParams(location.search);

    if (params.get('plan') === 'demo') {
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
   * Imposta correttamente il menu "Il tuo spazio".
   *
   * Email non verificata:
   * - Dashboard porta ad Account.
   * - Il menu resta utilizzabile.
   *
   * Email verificata:
   * - Dashboard torna a puntare alla Dashboard.
   */
  function configureWorkspaceMenu(verified) {
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
            ?.includes('dashboard.html')
        );

      if (dashboardLink) {
        dashboardLink.href =
          verified
            ? '/dashboard.html'
            : '/account.html';
      }

      const summary =
        menu.querySelector('summary');

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
   * - l'utente l'aveva richiesta;
   * - l'email è già verificata.
   *
   * Il backend applica comunque i controlli
   * definitivi sulla durata e sull'utilizzo unico.
   */
  async function activateRequestedDemo(
    verification
  ) {
    const intent = getPlanIntent();

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
      await api('plan-demo', {});

      sessionStorage.removeItem(
        'linea_plan_intent'
      );

      location.assign(
        '/dashboard.html'
      );

      return true;
    } catch (e) {
      /*
       * Non cancelliamo l'intenzione se
       * l'attivazione fallisce.
       */
      show(e);
      return false;
    }
  }

  const logout = q('#logout');

  if (logout) {
    logout.onclick = async () => {
      try {
        await api('logout', {});

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

  (async () => {
    const me = await api('me');

    /*
     * Recuperiamo subito lo stato di verifica.
     * Serve anche per controllare il menu
     * "Il tuo spazio".
     */
    const verification =
      await api('email-verification');

    configureWorkspaceMenu(
      verification.verified
    );

    /*
     * Se l'utente non ha verificato l'email
     * e si trova su una pagina operativa
     * dello spazio aziendale, lo riportiamo
     * direttamente alla pagina Account.
     *
     * Account resta sempre accessibile perché
     * è proprio lì che deve completare
     * la verifica.
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
        resend.disabled =
          verification.verified;

        resend.onclick = async () => {
          try {
            await api(
              'email-verification',
              {}
            );

            if (workspaceStatus) {
              workspaceStatus.textContent =
                'Messaggio di verifica preparato. Controlla la tua email per continuare.';
            }
          } catch (e) {
            show(e);
          }
        };
      }

      /*
       * Se l'utente aveva scelto la Demo
       * e ora l'email è verificata,
       * attiviamo la Demo e passiamo
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
        await api('plan-state');

      const companyReview =
        await api(
          'company-verification'
        );

      const entries = [
        [
          'Stato azienda',
          ({
            pending: 'In attesa',
            under_review: 'In revisione',
            verified: 'Verificata',
            rejected: 'Non approvata',
            suspended: 'Sospesa'
          })[companyReview.status]
        ],
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
          state.profile?.data || {}
        )
      ) {
        entries.push([
          state.fields[key] || key,
          value
        ]);
      }

      entries.push([
        'Verifica dei dati',
        ({
          pending: 'In attesa',
          verified: 'Approvata',
          rejected: 'Non approvata',
          needs_review: 'Da integrare'
        })[state.profile?.status] ||
          'Dati non ancora presentati'
      ]);

      for (const [key, value] of entries) {
        const dt =
          document.createElement('dt');

        const dd =
          document.createElement('dd');

        dt.textContent = key;
        dd.textContent = value ?? '';

        q('#account-data').append(
          dt,
          dd
        );
      }

      /*
       * Demo richiesta ma email non ancora
       * verificata.
       */
      if (
        getPlanIntent() === 'demo' &&
        !verification.verified &&
        workspaceStatus
      ) {
        workspaceStatus.textContent =
          'Per iniziare la Demo di 7 giorni verifica prima il tuo indirizzo email.';
      }
    }

    /*
     * PAGINA PORTAFOGLIO
     */
    if (q('#wallet-form')) {
      const state =
        await api('plan-state');

      q(
        '#wallet-state'
      ).textContent =
        state.subscription
          ? 'Metodo del tuo piano (simulato).'
          : 'Attiva prima un piano per associargli un metodo di pagamento.';

      for (
        const m of state.methods.filter(
          m => m.recurring
        )
      ) {
        const o =
          document.createElement('option');

        o.value = m.code;
        o.textContent = m.label;

        q('#wallet-method').append(o);
      }

      if (state.subscription) {
        q('#wallet-method').value =
          state.subscription.method_kind;
      }

      q(
        '#wallet-form button'
      ).disabled =
        !state.subscription;

      q('#wallet-form').onsubmit =
        async e => {
          e.preventDefault();

          try {
            await api(
              'plan-method',
              {
                method:
                  q(
                    '#wallet-method'
                  ).value
              }
            );

            if (workspaceStatus) {
              workspaceStatus.textContent =
                'Metodo simulato aggiornato. Nessun addebito reale.';
            }
          } catch (e) {
            show(e);
          }
        };
    }
  })().catch(show);
})();