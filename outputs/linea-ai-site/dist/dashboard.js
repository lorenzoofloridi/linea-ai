'use strict';

const $ = s => document.querySelector(s);

let company;
let selectedConversation;
let selectedLead;
let fields = [];

const states = [
  'Nuova',
  'Da contattare',
  'In lavorazione',
  'Completata'
];

async function request(path, data) {
  const r = await fetch(
    '/api/' + path,
    data
      ? {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        }
      : {}
  );

  let d = {};

  try {
    d = await r.json();
  } catch {
    d = {};
  }

  if (r.status === 401) {
    location.replace('/login.html');
    throw Error('Sessione scaduta.');
  }

  /*
   * Un 402 significa che l'account è autenticato
   * ma non dispone di un piano/Demo operativo.
   *
   * La verifica dell'email viene controllata
   * separatamente prima di inizializzare
   * la Dashboard.
   */
  if (r.status === 402) {
    location.replace('/#offerte');

    throw Error(
      d.error ||
      'Attiva un piano per continuare.'
    );
  }

  if (!r.ok) {
    throw Error(
      d.error ||
      'Operazione non riuscita.'
    );
  }

  return d;
}

const node = (tag, text, className) => {
  const n = document.createElement(tag);

  if (text !== undefined) {
    n.textContent = text;
  }

  if (className) {
    n.className = className;
  }

  return n;
};

function date(s) {
  return new Intl.DateTimeFormat(
    'it-IT',
    {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Europe/Rome'
    }
  ).format(new Date(s));
}

function showMessages(messages) {
  $('#detail-messages').replaceChildren();

  for (const m of messages) {
    const div = node(
      'div',
      undefined,
      'dialog-message'
    );

    div.append(
      node(
        'strong',
        m.role === 'user'
          ? 'Cliente'
          : 'Assistente'
      ),
      node('p', m.content)
    );

    $('#detail-messages').append(div);
  }
}

async function openLead(id) {
  try {
    const d = await request(
      'leads/' +
      encodeURIComponent(id)
    );

    selectedConversation =
      d.conversation_id;

    selectedLead = id;

    $('#detail-title').textContent =
      d.data.nome || 'Richiesta';

    $('#detail-summary').textContent =
      d.summary +
      '\nConsenso al contatto: sì' +
      '\nRicevuta: ' +
      date(d.created_at) +
      '\nStato: ' +
      d.status;

    showMessages(d.messages);

    $('#lead-detail').showModal();
  } catch (e) {
    $('#dash-status').textContent =
      e.message;
  }
}

async function refresh() {
  const d = await request('leads');

  $('#lead-rows').replaceChildren();

  $('#no-leads').hidden =
    d.leads.length > 0;

  for (const l of d.leads) {
    const row = node('tr');

    for (const value of [
      (
        l.kind === 'test'
          ? 'TEST · '
          : l.kind === 'public_demo'
            ? 'DEMO · '
            : ''
      ) +
        (l.data.nome || '—'),

      l.data.telefono || '—',

      l.data.interesse || '—',

      date(l.created_at)
    ]) {
      row.append(
        node('td', value)
      );
    }

    const cell = node('td');

    const select = node(
      'select',
      undefined,
      'status-select'
    );

    select.setAttribute(
      'aria-label',
      'Stato della richiesta di ' +
        (l.data.nome || 'cliente')
    );

    for (const status of states) {
      const option =
        node('option', status);

      option.value = status;

      select.append(option);
    }

    select.value = l.status;

    select.addEventListener(
      'change',
      async () => {
        select.disabled = true;

        try {
          await request(
            'leads/' +
              encodeURIComponent(
                l.id
              ),
            {
              status:
                select.value
            }
          );

          l.status =
            select.value;

          $('#dash-status').textContent =
            'Stato aggiornato.';
        } catch (e) {
          select.value =
            l.status;

          $('#dash-status').textContent =
            e.message;
        } finally {
          select.disabled = false;
        }
      }
    );

    cell.append(select);
    row.append(cell);

    const action = node('td');

    const button =
      node('button', 'Apri');

    button.addEventListener(
      'click',
      () => openLead(l.id)
    );

    action.append(button);
    row.append(action);

    $('#lead-rows').append(row);
  }
}

async function conversations() {
  const d =
    await request('conversations');

  $('#conversation-list')
    .replaceChildren();

  if (!d.conversations.length) {
    $('#conversation-list').append(
      node(
        'p',
        'Nessuna conversazione presente.',
        'empty-state'
      )
    );
  }

  for (const c of d.conversations) {
    const b = node(
      'button',
      (
        c.kind === 'test'
          ? 'TEST · '
          : ''
      ) +
        'Conversazione del ' +
        date(c.created_at),
      'button small dark'
    );

    b.addEventListener(
      'click',
      async () => {
        try {
          const r =
            await request(
              'conversations/' +
                encodeURIComponent(
                  c.id
                )
            );

          selectedConversation =
            c.id;

          selectedLead = null;

          $('#detail-title')
            .textContent =
            'Conversazione';

          $('#detail-summary')
            .textContent =
            'Iniziata il ' +
            date(c.created_at);

          showMessages(
            r.messages
          );

          $('#lead-detail')
            .showModal();
        } catch (e) {
          $('#dash-status')
            .textContent =
            e.message;
        }
      }
    );

    const p = node('p');

    p.append(b);

    $('#conversation-list')
      .append(p);
  }
}

function renderFields() {
  const root =
    $('#field-rows');

  root.replaceChildren();

  fields.forEach(
    (f, index) => {
      const row = node(
        'div',
        undefined,
        'field-row'
      );

      const label =
        node(
          'label',
          'Informazione'
        );

      const input =
        node('input');

      input.value =
        f.label;

      input.maxLength = 100;
      input.required = true;

      input.addEventListener(
        'input',
        () => {
          f.label =
            input.value;
        }
      );

      label.append(input);

      const typelabel =
        node(
          'label',
          'Formato'
        );

      const select =
        node('select');

      for (
        const [v, t] of [
          ['text', 'Testo'],
          ['phone', 'Telefono'],
          ['email', 'Email']
        ]
      ) {
        const o =
          node('option', t);

        o.value = v;

        select.append(o);
      }

      select.value =
        f.kind;

      select.disabled =
        [
          'nome',
          'telefono',
          'interesse'
        ].includes(f.key);

      select.addEventListener(
        'change',
        () => {
          f.kind =
            select.value;
        }
      );

      typelabel.append(select);

      const required =
        node(
          'label',
          undefined,
          'required-label'
        );

      const check =
        node('input');

      check.type =
        'checkbox';

      check.checked =
        f.required;

      check.disabled =
        [
          'nome',
          'telefono',
          'interesse'
        ].includes(f.key);

      check.addEventListener(
        'change',
        () => {
          f.required =
            check.checked;
        }
      );

      required.append(
        check,
        document.createTextNode(
          'Obbligatorio'
        )
      );

      const del =
        node(
          'button',
          'Rimuovi'
        );

      del.type =
        'button';

      del.disabled =
        [
          'nome',
          'telefono',
          'interesse'
        ].includes(f.key);

      del.addEventListener(
        'click',
        () => {
          fields.splice(
            index,
            1
          );

          renderFields();
        }
      );

      row.append(
        label,
        typelabel,
        required,
        del
      );

      root.append(row);
    }
  );
}

$('#add-field')
  .addEventListener(
    'click',
    () => {
      if (fields.length >= 18) {
        $('#config-status')
          .textContent =
          'Puoi configurare al massimo 18 campi.';

        return;
      }

      fields.push({
        key:
          'campo_' +
          crypto
            .randomUUID()
            .replaceAll('-', '')
            .slice(0, 12),

        label:
          'Nuova informazione',

        kind: 'text',

        required: false
      });

      renderFields();
    }
  );

$('#sector-template')
  .addEventListener(
    'change',
    e => {
      const presets = {
        immobiliare: [
          ['zona', 'Zona'],
          ['budget', 'Budget'],
          [
            'immobile',
            'Tipologia di immobile'
          ],
          [
            'operazione',
            'Acquisto o affitto'
          ],
          [
            'caratteristiche',
            'Caratteristiche richieste'
          ]
        ],

        auto: [
          [
            'auto',
            'Auto di interesse'
          ],
          ['budget', 'Budget'],
          [
            'condizione',
            'Nuovo o usato'
          ],
          [
            'finanziamento',
            'Interesse per finanziamento'
          ],
          [
            'permuta',
            'Eventuale permuta'
          ]
        ],

        estetica: [
          [
            'trattamento',
            'Trattamento di interesse'
          ],
          [
            'informazioni',
            'Informazioni richieste'
          ]
        ]
      };

      for (
        const [key, label]
        of presets[
          e.target.value
        ] || []
      ) {
        if (
          !fields.some(
            f => f.key === key
          ) &&
          fields.length < 18
        ) {
          fields.push({
            key,
            label,
            kind: 'text',
            required: false
          });
        }
      }

      renderFields();

      e.target.value = '';
    }
  );

$('#config-form')
  .addEventListener(
    'submit',
    async e => {
      e.preventDefault();

      const button =
        e.target.querySelector(
          '[type=submit]'
        );

      button.disabled = true;

      const form =
        new FormData(
          e.target
        );

      const cfg =
        Object.fromEntries(
          form
        );

      cfg.confirmation_email =
        form.get(
          'confirmation_email'
        ) === 'on';

      cfg.fields = fields;

      try {
        await request(
          'config',
          cfg
        );

        $('#company-title')
          .textContent =
          cfg.name;

        $('#config-status')
          .textContent =
          'Configurazione salvata. Inizia una nuova conversazione per provarla.';
      } catch (err) {
        $('#config-status')
          .textContent =
          err.message;
      } finally {
        button.disabled = false;
      }
    }
  );

for (
  const b of
  document.querySelectorAll(
    '[data-tab]'
  )
) {
  b.addEventListener(
    'click',
    async () => {
      for (
        const x of
        document.querySelectorAll(
          '[data-tab]'
        )
      ) {
        const active =
          x === b;

        x.setAttribute(
          'aria-selected',
          String(active)
        );

        $(
          '#tab-' +
          x.dataset.tab
        ).hidden =
          !active;
      }

      if (
        b.dataset.tab ===
        'company'
      ) {
        try {
          await overview();
        } catch (e) {
          $('#dash-status')
            .textContent =
            e.message;
        }
      }

      if (
        b.dataset.tab ===
        'conversations'
      ) {
        try {
          await conversations();
        } catch (e) {
          $('#dash-status')
            .textContent =
            e.message;
        }
      }
    }
  );
}

$('#close-detail')
  .addEventListener(
    'click',
    () =>
      $('#lead-detail')
        .close()
  );

$('#refresh')
  .addEventListener(
    'click',
    () =>
      refresh().catch(
        e => {
          $('#dash-status')
            .textContent =
            e.message;
        }
      )
  );

$('#logout')
  .addEventListener(
    'click',
    async () => {
      await request(
        'logout',
        {}
      );

      sessionStorage.removeItem(
        'linea_plan_intent'
      );

      location.assign(
        '/login.html'
      );
    }
  );

/*
 * Inizializzazione Dashboard.
 *
 * Ordine importante:
 *
 * 1. Controlliamo la sessione.
 * 2. Controlliamo l'email.
 * 3. Solo dopo iniziamo a chiamare
 *    le API operative della Dashboard.
 *
 * In questo modo un account non verificato
 * non entra più nel ciclo:
 * Dashboard -> Offerte -> Dashboard.
 */
(async () => {
  try {
    const me =
      await request('me');

    /*
     * Questa informazione arriva già da /api/me.
     * Non serve fare una seconda richiesta
     * soltanto per sapere se l'email è verificata.
     */
    if (!me.email_verified) {
      location.replace(
        '/account.html'
      );

      return;
    }

    company = me.company;

    $('#company-title')
      .textContent =
      company.config.name;

    $('#account-email')
      .textContent =
      me.email;

    // La chat di prova è in fondo a questa pagina (dashboard-chat.js).

    const form =
      $('#config-form');

    for (
      const k of [
        'name',
        'sector',
        'recipient',
        'knowledge',
        'region'
      ]
    ) {
      form.elements[k].value =
        company.config[k];
    }

    form.elements
      .confirmation_email
      .checked =
      company.config
        .confirmation_email;

    fields =
      structuredClone(
        company.config.fields
      );

    renderFields();

    /*
     * Controllo del piano.
     *
     * La Demo può usare lo Spazio Aziendale
     * ma non può usare la sezione Installazioni.
     *
     * Base / Plus / Advanced attivi
     * possono mostrare Installazioni.
     */
    try {
      const plan =
        await request(
          'plan-state'
        );

      const subscription =
        plan.subscription;

      const paidPlanActive =
        Boolean(subscription) &&
        [
          'base',
          'plus',
          'advanced'
        ].includes(
          subscription.plan
        ) &&
        (
          (
            [
              'trial',
              'active'
            ].includes(
              subscription.status
            ) &&
            Number(
              subscription.period_end
            ) >
              Date.now() / 1000
          ) ||
          (
            subscription.status ===
              'past_due' &&
            Number(
              subscription
                .grace_until || 0
            ) >
              Date.now() / 1000
          )
        );

      const installationSection =
        $('#installation-section');

      if (installationSection) {
        installationSection.hidden =
          !paidPlanActive;
      }
    } catch {
      const installationSection =
        $('#installation-section');

      if (installationSection) {
        installationSection.hidden =
          true;
      }
    }

    /*
     * Da questo punto partono le API
     * operative. Se non esiste Demo/piano
     * attivo, il backend può rispondere 402
     * e l'utente verificato viene mandato
     * alle offerte.
     */
    await refresh();

    const mail =
      await request(
        'email-status'
      );

    const labels = {
      not_configured:
        'Mittente da configurare',

      pending:
        'In attesa',

      sending:
        'Invio in corso',

      sent:
        'Accettate dal servizio email',

      uncertain:
        'Esito da verificare'
    };

    $('#email-state')
      .textContent =
      (
        mail.configured
          ? 'Servizio mittente configurato. '
          : 'Invio reale non attivo: manca il servizio mittente. '
      ) +
      Object
        .entries(
          mail.counts
        )
        .map(
          ([k, v]) =>
            (labels[k] || k) +
            ': ' +
            v
        )
        .join(' · ');
  } catch (e) {
    $('#dash-status')
      .textContent =
      e.message;
  }
})();

$('#export-data')
  .addEventListener(
    'click',
    async () => {
      try {
        const r =
          await fetch(
            '/api/data-export.csv'
          );

        if (r.status === 401) {
          location.replace(
            '/login.html'
          );

          return;
        }

        if (r.status === 402) {
          location.replace(
            '/portafoglio.html'
          );

          return;
        }

        if (!r.ok) {
          throw Error(
            'Esportazione non disponibile. Verifica l’accesso e riprova.'
          );
        }

        const url =
          URL.createObjectURL(
            await r.blob()
          );

        const a =
          node('a');

        a.href = url;

        a.download =
          'richieste-moreai.csv';

        a.click();

        setTimeout(
          () =>
            URL.revokeObjectURL(
              url
            ),
          1000
        );
      } catch (e) {
        $('#dash-status')
          .textContent =
          e.message;
      }
    }
  );

$('#delete-data')
  .addEventListener(
    'click',
    async () => {
      if (
        !selectedConversation ||
        !confirm(
          'Eliminare definitivamente questa conversazione, la richiesta e il feedback associati?'
        )
      ) {
        return;
      }

      try {
        await request(
          'data-delete',
          {
            conversation:
              selectedConversation,

            confirm: true
          }
        );

        $('#lead-detail')
          .close();

        await refresh();

        await conversations();

        $('#dash-status')
          .textContent =
          'Dati della conversazione eliminati.';
      } catch (e) {
        $('#dash-status')
          .textContent =
          e.message;
      }
    }
  );

async function overview() {
  const d =
    await request(
      'company-overview'
    );

  $('#verification')
    .textContent =
    ({
      pending: 'Stiamo analizzando il sito e le informazioni pubbliche della tua azienda.',
      researching: 'Stiamo analizzando il sito e le informazioni pubbliche della tua azienda.',
      verified: 'Analisi della tua azienda completata.',
      needs_review: 'Analisi completata: alcune informazioni vanno controllate.',
      failed: 'Non siamo riusciti ad analizzare il sito. Controlla l’indirizzo nei dati aziendali e riprova.'
    })[d.research_status] ||
    'Completa i dati aziendali dalla pagina Account per avviare l’analisi automatica del tuo sito.';

  const s =
    d.statistics;

  $('#statistics')
    .textContent =
    s.conversations +
    ' conversazioni · ' +
    s.leads +
    ' richieste · ' +
    (
      s.lead_percentage === null
        ? 'Nessuna percentuale disponibile'
        : s.lead_percentage +
          '% delle conversazioni ha prodotto una richiesta'
    ) +
    ' · Valutazione media visitatori: ' +
    (
      s.feedback_average === null ||
      s.feedback_average === undefined
        ? 'nessuna'
        : s.feedback_average +
          '/5 su ' +
          s.feedback_count +
          ' feedback' +
          (
            s.feedback_month_average === null ||
            s.feedback_month_average === undefined
              ? ''
              : ' (questo mese ' +
                s.feedback_month_average +
                '/5)'
          )
    );

  for (
    const id of [
      'knowledge-list',
      'installation-list',
      'visitor-feedback',
      'team-feedback'
    ]
  ) {
    $('#' + id)
      .replaceChildren();
  }

  for (const k of d.knowledge) {
    const box =
      node('article');

    box.append(
      node(
        'strong',
        ({
          public:
            'Fonte pubblica',

          private:
            'Informazione fornita dall’azienda',

          rule:
            'Regola aziendale'
        })[k.kind]
      ),

      node(
        'p',
        k.content
      ),

      node(
        'small',
        'Fonte: ' +
          k.source +
          (
            k.ai_allowed
              ? ' · Usata dall’assistente'
              : ''
          )
      )
    );

    $('#knowledge-list')
      .append(box);
  }

  const installationSection =
    $('#installation-section');

  if (
    installationSection &&
    !installationSection.hidden
  ) {
    for (
      const i of d.installations
    ) {
      $('#installation-list')
        .append(
          node(
            'p',
            i.origin +
              ' — ' +
              (
                i.enabled
                  ? 'Abilitata'
                  : 'Disattivata'
              )
          )
        );
    }
  }

  if (!d.feedback.length) {
    $('#visitor-feedback').append(
      node(
        'p',
        'Nessun feedback ricevuto finora.',
        'empty-state'
      )
    );
  }

  for (const f of d.feedback) {
    $('#visitor-feedback')
      .append(
        node(
          'p',
          '★'.repeat(f.rating) +
            '☆'.repeat(5 - f.rating) +
            ' ' +
            f.rating +
            '/5 · ' +
            date(f.created_at) +
            ' — ' +
            (f.comment.trim() || 'nessun commento')
        )
      );
  }

  for (const f of d.reviews) {
    $('#team-feedback')
      .append(
        node(
          'p',
          f.comment +
            ' — ' +
            date(
              f.updated_at
            )
        )
      );
  }
}

$('#team-review')
  .addEventListener(
    'submit',
    async e => {
      e.preventDefault();

      if (
        !selectedConversation
      ) {
        return;
      }

      try {
        await request(
          'company-review',
          {
            conversation:
              selectedConversation,

            comment:
              new FormData(
                e.target
              ).get(
                'comment'
              )
          }
        );

        $('#review-status')
          .textContent =
          'Feedback salvato per la tua azienda.';

        e.target.reset();
      } catch (err) {
        $('#review-status')
          .textContent =
          err.message;
      }
    }
  );

/*
 * Consumo AI del mese (sola lettura: il limite è deciso dal backend).
 */
(async () => {
  const card = document.querySelector('#usage-card');

  if (!card) {
    return;
  }

  try {
    const r = await fetch('/api/ai-usage');

    if (!r.ok) {
      return;
    }

    const u = await r.json();
    const format = n => new Intl.NumberFormat('it-IT').format(n);
    const ratio = u.limit ? Math.min(1, u.used / u.limit) : 1;
    const bar = document.querySelector('#usage-bar');

    document.querySelector('#usage-used').textContent = format(u.used);
    document.querySelector('#usage-limit').textContent = format(u.limit || 0);
    bar.querySelector('span').style.width = Math.round(ratio * 100) + '%';
    bar.classList.toggle('warn', ratio >= 0.8 && ratio < 1);
    bar.classList.toggle('full', ratio >= 1);
    document.querySelector('#usage-note').textContent =
      ratio >= 1
        ? 'Hai raggiunto il limite del mese: l’assistente riprenderà il primo giorno del mese prossimo, oppure passando a un piano superiore.'
        : 'Ogni risposta dell’assistente, anche nella chat di prova, conta come un messaggio. Il conteggio riparte il primo giorno di ogni mese.';
    card.hidden = false;
  } catch {
    card.hidden = true;
  }
})();
