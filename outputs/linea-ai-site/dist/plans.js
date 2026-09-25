'use strict';

(() => {
  const q = s => document.querySelector(s);

  const node = (tag, text, cls) => {
    const n = document.createElement(tag);

    if (text !== undefined) {
      n.textContent = text;
    }

    if (cls) {
      n.className = cls;
    }

    return n;
  };

  const money = c =>
    new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: c % 100 ? 2 : 0
    }).format(c / 100);

  async function api(path, data) {
    const r = await fetch(
      '/api/' + path,
      data === undefined
        ? {}
        : {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
          }
    );

    const d = await r.json();

    if (r.status === 401) {
      location.assign('/login.html');
      throw Error('Accedi per continuare.');
    }

    if (!r.ok) {
      throw Error(
        d.error || 'Operazione non riuscita.'
      );
    }

    return d;
  }

  const date = x =>
    new Intl.DateTimeFormat('it-IT', {
      dateStyle: 'long',
      timeStyle: 'short'
    }).format(new Date(x * 1000));

  /*
   * Conserva il piano scelto prima della registrazione.
   * In questo modo la registrazione non perde
   * l'intenzione dell'utente.
   */
  function savePlanIntent(plan, billingPeriod) {
    if (plan === 'demo') {
      sessionStorage.setItem(
        'linea_plan_intent',
        'demo'
      );

      return;
    }

    sessionStorage.setItem(
      'linea_plan_intent',
      plan + ':' + billingPeriod
    );
  }

  /*
   * Porta l'utente alla registrazione mantenendo
   * anche l'intenzione nell'URL.
   */
  function goToRegistration(plan, billingPeriod) {
    savePlanIntent(plan, billingPeriod);

    if (plan === 'demo') {
      location.assign(
        '/registrati.html?plan=demo'
      );

      return;
    }

    location.assign(
      '/registrati.html?plan=' +
        encodeURIComponent(plan) +
        '&period=' +
        encodeURIComponent(billingPeriod)
    );
  }

  /*
   * Richiesta di attivazione di un piano a pagamento:
   * precompila il modulo contatti (o apre il supporto se l'utente è già registrato).
   */
  function contactForPlan(planName, billingPeriod, planCode) {
    const periodLabel = billingPeriod === 'annual' ? 'annuale' : 'mensile';
    const message = q('#contact-message');
    const section = q('#contact-form-section');

    if (message && section && !section.hidden) {
      if (!message.value.trim()) {
        message.value =
          'Vorrei attivare il ' + planName + ' con fatturazione ' + periodLabel + '.';
      }
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      q('#contact-name')?.focus({ preventScroll: true });
      return;
    }

    location.assign(
      '/portafoglio.html?piano=' + encodeURIComponent(planCode || '') +
        '&periodo=' + encodeURIComponent(billingPeriod === 'annual' ? 'annual' : 'monthly')
    );
  }

  if (q('#plans-area')) {
    let period = 'monthly';
    let data = null;

    function render() {
      const grid = q('#plan-cards');

      grid.replaceChildren();

      for (const p of data.plans) {
        /*
         * La Demo 7 giorni compare esclusivamente
         * nella visualizzazione mensile.
         */
        if (
          p.code === 'demo' &&
          period === 'annual'
        ) {
          continue;
        }

        const card = node(
          'article',
          undefined,
          'pricing-card' +
            (p.code === 'base'
              ? ' base-card'
              : '')
        );

        if (p.code !== 'demo' && p.available) {
          card.append(
            node('span', '14 giorni di prova', 'trial-badge')
          );
        }

        card.append(
          node(
            'p',
            p.code === 'demo'
              ? 'PER INIZIARE'
              : p.code === 'base'
                ? 'CONSIGLIATO'
                : p.code === 'plus'
                  ? 'PER CHI CRESCE'
                  : 'PER VOLUMI ALTI',
            'eyebrow'
          ),
          node('h3', p.name)
        );

        const price = node(
          'div',
          undefined,
          'pricing-amount'
        );

        if (!p.available) {
          price.append(
            node('strong', 'A breve')
          );
        } else if (p.code === 'demo') {
          price.append(
            node('strong', '7'),
            node('span', 'giorni gratuiti')
          );
        } else if (!data.authenticated) {
          /*
           * I prezzi sono visibili solo dopo il login:
           * il server non li invia agli ospiti.
           */
          price.append(
            node(
              'span',
              'Accedi o registrati per vedere la tariffa',
              'price-login'
            )
          );
        } else {
          price.append(
            node(
              'strong',
              money(
                period === 'monthly'
                  ? p.monthly_cents
                  : p.annual_cents
              )
            ),
            node(
              'span',
              period === 'monthly'
                ? 'al mese'
                : 'all’anno'
            )
          );
        }

        card.append(price);

        if (
          data.authenticated &&
          p.code !== 'demo' &&
          period === 'annual'
        ) {
          card.append(
            node(
              'p',
              money(p.annual_monthly_cents) +
                ' al mese · risparmi il ' +
                data.discount +
                '%',
              'annual-note'
            )
          );
        }

        const list = node('ul');

        const messages =
          new Intl.NumberFormat('it-IT').format(p.messages || 0);

        const items =
          p.code === 'demo'
            ? [
                messages + ' messaggi AI inclusi',
                'Assistente, chat di prova e dashboard',
                'Nessuna carta richiesta'
              ]
            : [
                messages + ' messaggi AI al mese' +
                  (p.code === 'advanced' ? ' (uso corretto)' : ''),
                'Assistente con le informazioni della tua azienda',
                'Dashboard con richieste, conversazioni e statistiche'
              ];

        for (const item of items) {
          list.append(
            node('li', item)
          );
        }

        card.append(list);

        const button = node(
          'button',
          !p.available
            ? 'In preparazione'
            : p.code === 'demo'
              ? 'Prova gratis'
              : data.authenticated
                ? 'Attiva piano'
                : 'Scopri la tariffa',
          'button ' +
            (p.code === 'base'
              ? 'blue'
              : 'dark')
        );

        button.disabled = !p.available;

        button.addEventListener(
          'click',
          async () => {
            button.disabled = true;

            try {
              /*
               * Utente non autenticato:
               * ricordiamo quale piano ha scelto
               * prima di mandarlo alla registrazione.
               */
              if (!data.authenticated) {
                goToRegistration(
                  p.code,
                  period
                );

                return;
              }

              /*
               * Demo:
               * il backend verifica autenticazione,
               * email verificata e precedente utilizzo.
               */
              if (p.code === 'demo') {
                savePlanIntent(
                  'demo',
                  period
                );

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

                return;
              }

              /*
               * Piani Base / Plus / Advanced:
               * si passa ai dati aziendali e al pagamento.
               */
              location.assign(
                '/attiva-piano.html?plan=' +
                  encodeURIComponent(p.code) +
                  '&period=' +
                  encodeURIComponent(period)
              );
            } catch (e) {
              q('#plans-status').textContent =
                e.message;

              button.disabled = false;
            }
          }
        );

        card.append(button);

        if (p.code !== 'demo') {
          card.append(
            node(
              'small',
              'Carta richiesta, primo addebito al 15° giorno. Disdici quando vuoi.'
            )
          );
        } else if (
          p.code === 'demo' &&
          data.demo
        ) {
          card.append(
            node(
              'small',
              'Disponibile fino al ' +
                date(data.demo.ends)
            )
          );
        }

        grid.append(card);
      }

      q('#demo-expired').hidden =
        !data.demo ||
        data.demo.ends * 1000 >
          Date.now();
    }

    async function refresh() {
      try {
        data = await api('plans');

        q('#contact-form-section').hidden =
          data.authenticated;

        q('#plans-area').hidden = false;


        const cta = q(
          '.header-plan-cta'
        );

        cta.href =
          data.authenticated
            ? '/dashboard.html'
            : '/registrati.html?plan=demo';

        cta.textContent =
          data.authenticated
            ? 'Vai alla dashboard'
            : 'Prova gratis';

        const account = q(
          '.header-login'
        );

        account.textContent =
          data.authenticated
            ? 'Il tuo Spazio'
            : 'Accedi';

        /*
         * Lo Spazio deve restare raggiungibile
         * anche quando la Demo o il piano
         * non sono più attivi.
         *
         * Account è la porta di ingresso
         * persistente dell'utente.
         * La Dashboard mantiene invece
         * i propri controlli sul piano attivo.
         */
        account.href =
          data.authenticated
            ? '/account.html'
            : '/login.html';

        render();
      } catch (e) {
        q('#plans-status').textContent =
          e.message;
      }
    }

    q('#billing-selector').addEventListener(
      'click',
      e => {
        const b = e.target.closest(
          '[data-billing]'
        );

        if (!b) {
          return;
        }

        period = b.dataset.billing;

        document
          .querySelectorAll(
            '[data-billing]'
          )
          .forEach(x =>
            x.setAttribute(
              'aria-pressed',
              String(x === b)
            )
          );

        if (data) {
          render();
        }
      }
    );

    refresh();

    window.addEventListener(
      'pageshow',
      e => {
        if (e.persisted) {
          refresh();
        }
      }
    );

    setInterval(() => {
      if (
        !document.hidden &&
        data?.authenticated
      ) {
        refresh();
      }
    }, 60000);
  }

  if (q('#activation-form')) {
    const form = q(
      '#activation-form'
    );

    let state;

    let selectedPlan =
      new URLSearchParams(
        location.search
      ).get('plan') || 'base';

    let period =
      new URLSearchParams(
        location.search
      ).get('period') === 'annual'
        ? 'annual'
        : 'monthly';

    const status = q(
      '#activation-status'
    );

    async function refresh() {
      state = await api(
        'plan-state'
      );

      const catalog =
        await api('plans');

      const base =
        catalog.plans.find(
          p =>
            p.code ===
              (
                state.subscription
                  ?.plan ||
                selectedPlan
              ) &&
            p.code !== 'demo'
        ) ||
        catalog.plans.find(
          p => p.code === 'base'
        );

      selectedPlan = base.code;

      q(
        '#selected-plan-name'
      ).textContent = 'DATI AZIENDALI';

      q(
        '#trial-title'
      ).textContent =
        '14 giorni per provare ' +
        base.name;

      document.title =
        'Dati aziendali — MoreAI';

      q('#base-quote').textContent =
        money(
          period === 'monthly'
            ? base.monthly_cents
            : base.annual_cents
        ) +
        (
          period === 'monthly'
            ? ' al mese'
            : ' all’anno — ' +
              money(
                base.annual_monthly_cents
              ) +
              ' al mese'
        );

      q(
        '#billing-period'
      ).value = period;

      const labels = {
        pending:
          'Analisi della tua azienda in corso',
        verified:
          'Dati verificati',
        rejected:
          'Verifica non approvata',
        needs_review:
          'Analisi completata: controlla i dati inseriti',
        under_review:
          'Azienda in revisione',
        suspended:
          'Azienda sospesa'
      };

      q(
        '#verification-status'
      ).textContent =
        state.profile
          ? labels[
              state.company_status ||
                state.profile.status
            ]
          : 'Completa i dati aziendali';

      q('#begin-base').disabled =
        state.profile?.status !==
          'verified' ||
        !!state.subscription;

      q(
        '#refresh-verification'
      ).hidden =
        ![
          'pending',
          'needs_review'
        ].includes(
          state.profile?.status
        );

      const sub =
        state.subscription;

      // I pagamenti online non sono ancora attivi: il riepilogo resta nascosto.
      q(
        '#subscription-panel'
      ).hidden = true;

      if (sub) {
        q(
          '#subscription-state'
        ).textContent = {
          trial:
            'Prova gratuita in corso',
          active:
            'Piano attivo in simulazione',
          past_due:
            'Pagamento simulato non riuscito',
          cancelled:
            'Piano disdetto',
          expired:
            'Piano scaduto'
        }[sub.status];

        q(
          '#subscription-date'
        ).textContent =
          (
            sub.cancel_at_end
              ? 'Termine del piano: '
              : 'Prossima scadenza: '
          ) +
          date(sub.period_end);

        q(
          '#cancel-plan'
        ).disabled =
          !!sub.cancel_at_end ||
          [
            'cancelled',
            'expired'
          ].includes(
            sub.status
          );

        q(
          '#cancel-note'
        ).textContent =
          sub.cancel_at_end
            ? 'Rinnovo disattivato. Nessun addebito simulato successivo alla scadenza.'
            : '';

        q(
          '#payment-history'
        ).replaceChildren(
          ...state.events
            .filter(
              e =>
                e.action ===
                'payment'
            )
            .map(e =>
              node(
                'p',
                date(e.created) +
                  ' · ' +
                  (
                    e.outcome ===
                    'mock_success'
                      ? 'Addebito simulato riuscito'
                      : 'Addebito simulato non riuscito'
                  ) +
                  ' · ' +
                  money(
                    e.amount_cents
                  )
              )
            )
        );
      }
    }

    async function action(fn) {
      status.textContent = '';

      try {
        await fn();
      } catch (e) {
        status.textContent =
          e.message;
      }
    }

    action(async () => {
      state = await api(
        'plan-state'
      );

      for (
        const [key, label]
        of Object.entries(
          state.fields
        )
      ) {
        const wrapper =
          node('label', label);

        const input =
          node('input');

        input.name = key;
        input.required = true;
        input.maxLength = 250;

        input.value =
          state.profile
            ?.data[key] ||
          (
            key === 'country'
              ? 'IT'
              : ''
          );

        if (
          key ===
          'business_email'
        ) {
          input.type = 'email';
        }

        if (
          key === 'website'
        ) {
          input.type = 'url';
        }

        wrapper.append(input);

        q(
          '#business-fields'
        ).append(wrapper);
      }

      for (
        const m of state.methods
      ) {
        const option = node(
          'option',
          m.label +
            (
              m.recurring
                ? ' — simulazione ricorrente'
                : ' — non ricorrente'
            )
        );

        option.value = m.code;

        q(
          '#payment-method'
        ).append(option);
      }

      await refresh();
    });

    form.addEventListener(
      'submit',
      e => {
        e.preventDefault();

        action(async () => {
          await api(
            'plan-profile',
            Object.fromEntries(
              new FormData(form)
            )
          );

          await refresh();

          status.textContent =
            'Dati salvati. Stiamo leggendo il sito e le informazioni pubbliche della tua azienda: ci vuole qualche minuto.';
        });
      }
    );

    q(
      '#refresh-verification'
    ).addEventListener(
      'click',
      () => action(refresh)
    );

    q(
      '#billing-period'
    ).addEventListener(
      'change',
      e => {
        period =
          e.target.value;

        action(refresh);
      }
    );

    q(
      '#payment-method'
    ).addEventListener(
      'change',
      e => {
        q(
          '#manual-payment-note'
        ).hidden =
          e.target.value !==
          'bank_transfer';
      }
    );

    q(
      '#begin-base'
    ).addEventListener(
      'click',
      () =>
        action(async () => {
          await api(
            'plan-base',
            {
              plan:
                selectedPlan,
              period,
              method:
                q(
                  '#payment-method'
                ).value,
              confirm:
                q(
                  '#renewal-confirm'
                ).checked
            }
          );

          await refresh();

          status.textContent =
            'Prova di 14 giorni avviata. Nessun pagamento reale.';
        })
    );

    q(
      '#cancel-plan'
    ).addEventListener(
      'click',
      () =>
        action(async () => {
          await api(
            'plan-cancel',
            {}
          );

          await refresh();
        })
    );
  }
})();