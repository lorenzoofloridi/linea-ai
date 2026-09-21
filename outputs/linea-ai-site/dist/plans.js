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

        card.append(
          node(
            'p',
            p.code === 'demo'
              ? 'ESPLORA'
              : p.available
                ? 'IL PRIMO PASSO'
                : 'IN DEFINIZIONE',
            'eyebrow'
          ),
          node('h3', p.name)
        );

        const price = node(
          'div',
          undefined,
          'pricing-amount'
        );

        if (!data.authenticated) {
          price.append(
            node(
              'span',
              'Accedi o registrati per vedere la tariffa'
            )
          );
        } else if (!p.available) {
          price.append(
            node('strong', 'A breve')
          );
        } else if (p.code === 'demo') {
          price.append(
            node('strong', '7'),
            node('span', 'giorni gratuiti')
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

        const items =
          p.code === 'demo'
            ? [
                'Accesso al tuo Spazio Aziendale',
                'Una prova per email registrata',
                'Nessun metodo di pagamento richiesto'
              ]
            : [
                'Servizi inclusi da definire',
                'Verifica dei dati aziendali',
                'Metodo compatibile con il rinnovo automatico'
              ];

        for (const item of items) {
          list.append(
            node('li', item)
          );
        }

        card.append(list);

        const button = node(
          'button',
          p.available
            ? 'Inizia subito'
            : 'In preparazione',
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
               * Piani Base / Plus / Advanced.
               */
              sessionStorage.removeItem(
                'linea_plan_intent'
              );

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
              'Prova gratuita di ' +
                p.trial_days +
                ' giorni'
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

        q('#manage-plan-link').hidden =
          !data.authenticated;

        const cta = q(
          '.header-plan-cta'
        );

        cta.href =
          data.authenticated
            ? '#offerte'
            : '#contatti';

        cta.textContent =
          data.authenticated
            ? 'Prova la Demo'
            : 'Richiedi una prova ↗';

        const account = q(
          '.header-login'
        );

        account.textContent =
          data.authenticated
            ? 'Il tuo Spazio'
            : 'Accedi';

        account.href =
          data.authenticated
            ? '/dashboard.html'
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
      ).textContent = base.name;

      q(
        '#trial-title'
      ).textContent =
        '14 giorni per provare ' +
        base.name;

      document.title =
        'Attiva ' +
        base.name +
        ' — Linea AI';

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
          'In attesa della verifica del gestore',
        verified:
          'Verifica locale approvata',
        rejected:
          'Verifica non approvata',
        needs_review:
          'Servono informazioni aggiuntive',
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

      q(
        '#subscription-panel'
      ).hidden = !sub;

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
            'Dati registrati. Il gestore deve verificarli prima dell’avvio della prova.';
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