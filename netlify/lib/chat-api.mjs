import {randomBytes,createHash} from 'node:crypto';
import {interpret,ready} from './online-ai.mjs';
import {initialState,advance} from './chat-state.mjs';
import {effectivePlan,reserveMessage,releaseMessage,recordTokens,usageSummary,QuotaError} from './ai-quota.mjs';
import {companyOverview,addCompanyNote,deleteConversation,exportLeadsCsv,exportLeadsXlsx} from './company-data.mjs';
import {notifyHomeFeedback} from './feedback-notify.mjs';
import {conversationConfig} from './widget.mjs';

const token=()=>randomBytes(32).toString('base64url');
const hash=s=>createHash('sha256').update(s).digest('hex');
const fail=(status,message)=>{const e=new Error(message);e.httpStatus=status;throw e;};
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const greeting=c=>c.agent?.branding?.greeting||`Ciao, sono l’assistente di ${c.name}. Come posso aiutarti oggi?`;
const validate=(b,k,max=2000)=>{if(typeof b[k]!=='string'||!b[k].trim()||b[k].length>max)fail(400,'Controlla i dati inseriti.');return b[k].trim();};

async function limit(db,key,maximum,windowSeconds,message='Il limite temporaneo della demo è stato raggiunto. Riprova più tardi.'){
 const bucket=Math.floor(Date.now()/1000/windowSeconds);
 const r=await db.pool.query(
  `INSERT INTO chat_limits(key,bucket,count)
   VALUES($1,$2,1)
   ON CONFLICT(key,bucket)
   DO UPDATE SET count=chat_limits.count+1
   RETURNING count`,
  [key,bucket]
 );

 if(r.rows[0].count>maximum){
  fail(429,message);
 }
}

export async function chatApi(
 request,
 db,
 auth,
 {model=interpret,modelReady=ready,context={}}={}
){
 const url=new URL(request.url);
 const path=url.pathname;
 const method=request.method;

 const publicPaths=[
  '/api/public',
  '/api/session',
  '/api/chat',
  '/api/feedback',
  '/api/trial'
 ];

 const privatePath=
  [
   '/api/leads',
   '/api/conversations',
   '/api/config',
   '/api/email-status',
   '/api/ai-usage',
   '/api/company-overview',
   '/api/company-review',
   '/api/data-delete',
   '/api/data-export.csv',
   '/api/data-export.xlsx'
  ].includes(path)||
  /^\/api\/(leads|conversations)\/[^/]+$/.test(path);

 if(!publicPaths.includes(path)&&!privatePath){
  return null;
 }

 let body={};

 if(method==='POST'){
  if(
   !(request.headers.get('content-type')||'')
    .startsWith('application/json')
  ){
   fail(400,'Richiesta non valida.');
  }

  const raw=await request.text();

  if(raw.length>32000){
   fail(413,'Richiesta troppo grande.');
  }

  try{
   body=JSON.parse(raw);
  }catch{
   fail(400,'Richiesta non valida.');
  }

  if(
   !body||
   typeof body!=='object'||
   Array.isArray(body)
  ){
   fail(400,'Richiesta non valida.');
  }
 }

 if(method!=='POST'&&!privatePath){
  fail(405,'Metodo non disponibile.');
 }

 const user=await auth(db,request);

 const allowed=async cid=>{
  const r=await db.pool.query(
   'SELECT status FROM company_verification WHERE company_id=$1',
   [cid]
  );

  if(
   ['suspended','rejected'].includes(
    r.rows[0]?.status
   )
  ){
   fail(
    403,
    'Accesso aziendale non disponibile.'
   );
  }
 };

 /*
  * Consente l'uso operativo dello Spazio Aziendale
  * soltanto durante una Demo attiva oppure con un
  * piano Base, Plus o Advanced attivo.
  *
  * Non elimina account, configurazione, conversazioni
  * o lead quando la Demo scade.
  */
 const requireActivePlan=async cid=>{
  // Stessa regola usata per le quote AI (netlify/lib/ai-quota.mjs).
  if(!(await effectivePlan(db,cid))){
   fail(
    402,
    'La Demo è terminata. Attiva un piano per continuare a utilizzare lo Spazio Aziendale.'
   );
  }
 };

 if(privatePath){
  if(!user){
   fail(
    401,
    'Accedi al tuo account per continuare.'
   );
  }

  // Visita del gestore: solo configurazione e statistiche aggregate,
  // mai richieste, conversazioni, note o esportazioni dei clienti.
  if(user.viewer&&!['/api/config','/api/company-overview','/api/ai-usage','/api/email-status'].includes(path)){
   fail(403,'Durante la visita del gestore questa sezione non è disponibile: i dati dei clienti restano riservati all’azienda.');
  }

  if(!user.viewer){
   await allowed(user.company_id);
  }

  // Esportare o cancellare i propri dati resta possibile anche senza piano attivo.
  // Il gestore può sistemare la configurazione anche se il piano è scaduto.
  if(!user.viewer&&!['/api/data-export.csv','/api/data-export.xlsx','/api/data-delete'].includes(path)){
   await requireActivePlan(user.company_id);
  }

  const cid=user.company_id;

  if(
   path==='/api/ai-usage'&&
   method==='GET'
  ){
   return json(await usageSummary(db,cid));
  }

  if(path==='/api/company-overview'&&method==='GET'){
   const overview=await companyOverview(db,cid);
   if(user.viewer){
    // Commenti e note possono contenere dati dei clienti.
    overview.feedback=[];
    overview.reviews=[];
    overview.viewer=true;
   }
   return json(overview);
  }

  if(path==='/api/company-review'&&method==='POST'){
   return json(await addCompanyNote(db,cid,body),201);
  }

  if(path==='/api/data-delete'&&method==='POST'){
   return json(await deleteConversation(db,cid,body));
  }

  if(path==='/api/data-export.xlsx'&&method==='GET'){
   return new Response(await exportLeadsXlsx(db,cid),{
    headers:{
     'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'Content-Disposition':'attachment; filename="richieste-moreai.xlsx"',
     'Cache-Control':'no-store'
    }
   });
  }

  if(path==='/api/data-export.csv'&&method==='GET'){
   return new Response(await exportLeadsCsv(db,cid),{
    headers:{
     'Content-Type':'text/csv; charset=utf-8',
     'Content-Disposition':'attachment; filename="richieste-moreai.csv"',
     'Cache-Control':'no-store'
    }
   });
  }

  if(
   path==='/api/email-status'&&
   method==='GET'
  ){
   return json({
    configured:false,
    counts:{}
   });
  }

  if(
   path==='/api/config'&&
   method==='POST'
  ){
   for(
    const key of [
     'name',
     'sector',
     'recipient',
     'region'
    ]
   ){
    validate(body,key,120);
   }

   if(
    typeof body.knowledge!=='string'||
    body.knowledge.length>10000
   ){
    fail(
     400,
     'Controlla le informazioni aziendali.'
    );
   }

   if(
    !Array.isArray(body.fields)||
    body.fields.length<1||
    body.fields.length>18
   ){
    fail(400,'Controlla i campi.');
   }

   const keys=new Set();

   for(const f of body.fields){
    if(
     !f||
     !/^([a-z][a-z0-9_]{0,39})$/.test(f.key)||
     ['constructor','prototype','__proto__'].includes(f.key)||
     keys.has(f.key)||
     typeof f.label!=='string'||
     !f.label.trim()||
     f.label.length>100||
     !['text','phone','email'].includes(f.kind)
    ){
     fail(400,'Controlla i campi.');
    }

    keys.add(f.key);
   }

   const existing=(
    await db.pool.query(
     'SELECT config FROM companies WHERE id=$1',
     [cid]
    )
   ).rows[0].config;

   const config={
    ...existing,
    ...Object.fromEntries(
     [
      'name',
      'sector',
      'recipient',
      'knowledge',
      'region'
     ].map(
      k=>[k,body[k].trim()]
     )
    ),
    confirmation_email:
     body.confirmation_email===true,
    fields:body.fields.map(
     f=>({
      key:f.key,
      label:f.label,
      kind:f.kind,
      required:f.required===true
     })
    )
   };

   await db.pool.query(
    'UPDATE companies SET config=$1::jsonb WHERE id=$2',
    [
     JSON.stringify(config),
     cid
    ]
   );

   await db.pool.query(
    `UPDATE company_management
        SET config_version=config_version+1
      WHERE company_id=$1`,
    [cid]
   );

   return json({config});
  }

  if(
   path==='/api/leads'&&
   method==='GET'
  ){
   return json({
    leads:(
     await db.pool.query(
      `SELECT *
         FROM leads
        WHERE company_id=$1
        ORDER BY created_at DESC
        LIMIT 200`,
      [cid]
     )
    ).rows
   });
  }

  if(
   path==='/api/conversations'&&
   method==='GET'
  ){
   return json({
    conversations:(
     await db.pool.query(
      `SELECT
         id,
         created_at,
         updated_at,
         kind
       FROM conversations
       WHERE company_id=$1
       ORDER BY created_at DESC
       LIMIT 200`,
      [cid]
     )
    ).rows
   });
  }

  const match=
   path.match(
    /^\/api\/(leads|conversations)\/([^/]+)$/
   );

  if(match){
   const id=
    decodeURIComponent(match[2]);

   const row=(
    await db.pool.query(
     `SELECT *
        FROM ${match[1]}
       WHERE company_id=$1
         AND id=$2`,
     [cid,id]
    )
   ).rows[0];

   if(!row){
    fail(
     404,
     'Risorsa non disponibile.'
    );
   }

   if(
    method==='POST'&&
    match[1]==='leads'
   ){
    if(
     ![
      'Nuova',
      'Da contattare',
      'In lavorazione',
      'Completata'
     ].includes(body.status)
    ){
     fail(
      400,
      'Stato non valido.'
     );
    }

    await db.pool.query(
     `UPDATE leads
         SET status=$1,
             updated_at=NOW()
       WHERE company_id=$2
         AND id=$3`,
     [
      body.status,
      cid,
      id
     ]
    );

    return json({ok:true});
   }

   if(method==='GET'){
    const messages=(
     await db.pool.query(
      `SELECT
         role,
         content,
         created_at
       FROM messages
       WHERE company_id=$1
         AND conversation_id=$2
       ORDER BY seq`,
      [
       cid,
       match[1]==='leads'
        ? row.conversation_id
        : id
      ]
     )
    ).rows;

    return json(
     match[1]==='leads'
      ? {...row,messages}
      : {messages}
    );
   }
  }

  fail(
   405,
   'Metodo non disponibile.'
  );
 }

 if(
  path==='/api/public'||
  path==='/api/session'
 ){
  const publicId=
   body.company||'demo';

  if(
   typeof publicId!=='string'||
   publicId.length>100
  ){
   fail(
    400,
    'Azienda non valida.'
   );
  }

  const company=(
   await db.pool.query(
    `SELECT id,config
       FROM companies
      WHERE public_id=$1`,
    [publicId]
   )
  ).rows[0];

  if(!company){
   fail(
    404,
    'Assistente non disponibile.'
   );
  }

  /*
   * La chat pubblica MoreAI ("demo") resta separata.
   * La chat di prova di una singola azienda richiede
   * invece l'account proprietario e una Demo/piano attivo.
   */
  if(
   publicId!=='demo'&&
   (
    !user||
    user.company_id!==company.id
   )
  ){
   fail(
    404,
    'Assistente non disponibile.'
   );
  }

  await allowed(company.id);

  if(publicId!=='demo'){
   await requireActivePlan(company.id);
  }

  // Chat di prova: stessa configurazione del widget, comprese le
  // informazioni verificate trovate sul web.
  const cfg=publicId==='demo'
   ?company.config
   :await conversationConfig(db,company);

  if(path==='/api/public'){
   return json({
    name:cfg.name,
    greeting:greeting(cfg)
   });
  }

  await limit(
   db,
   'sessions:'+
    hash(context.ip||'unknown'),
   20,
   3600
  );

  const access=token();
  const id=token();

  await db.pool.query(
   `INSERT INTO conversations(
      id,
      company_id,
      access_hash,
      state,
      config,
      created_at,
      updated_at,
      expires,
      kind,
      owner_user_id
    )
    VALUES(
      $1,$2,$3,$4::jsonb,$5::jsonb,
      NOW(),NOW(),$6,$7,$8
    )`,
   [
    id,
    company.id,
    hash(access),
    JSON.stringify(
     initialState()
    ),
    JSON.stringify(cfg),
    Date.now()/1000+86400,
    publicId==='demo'
     ? 'public_demo'
     : 'test',
    publicId==='demo'
     ? null
     : user.id
   ]
  );

  return json(
   {
    session:access,
    name:cfg.name,
    greeting:greeting(cfg)
   },
   201
  );
 }

 if(path==='/api/trial'){
  const id=
   validate(
    body,
    'request_id',
    80
   );

  const data=
   Object.fromEntries(
    [
     ['name',100],
     ['company',150],
     ['email',200],
     ['message',1500]
    ].map(
     ([key,max])=>[
      key,
      validate(
       body,
       key,
       max
      )
     ]
    )
   );

  if(
   body.consent!==true||
   !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    data.email
   )
  ){
   fail(
    400,
    'Controlla email e consenso.'
   );
  }

  await limit(
   db,
   'trial:'+
    hash(context.ip||'unknown'),
   10,
   3600
  );

  await db.pool.query(
   `INSERT INTO trial_requests(
      id,
      company_id,
      data,
      consent_version
    )
    VALUES(
      $1,
      'demo',
      $2::jsonb,
      'trial-2026-09'
    )
    ON CONFLICT(id)
    DO NOTHING`,
   [
    id,
    JSON.stringify(data)
   ]
  );

  const old=(
   await db.pool.query(
    `SELECT data
       FROM trial_requests
      WHERE id=$1`,
    [id]
   )
  ).rows[0].data;

  if(
   Object.keys(data).some(
    k=>old[k]!==data[k]
   )
  ){
   fail(
    409,
    'Richiesta già utilizzata. Ricarica la pagina.'
   );
  }

  return json(
   {
    saved:true,
    email_status:
     'not_configured'
   },
   201
  );
 }

 const access=
  validate(
   body,
   'session',
   100
  );

 const conversation=(
  await db.pool.query(
   `SELECT *
      FROM conversations
     WHERE access_hash=$1
       AND expires>$2`,
   [
    hash(access),
    Date.now()/1000
   ]
  )
 ).rows[0];

 if(!conversation){
  fail(
   404,
   'Conversazione non disponibile.'
  );
 }

 if(
  conversation.owner_user_id&&
  (
   !user||
   user.id!==
    conversation.owner_user_id||
   user.company_id!==
    conversation.company_id
  )
 ){
  fail(
   404,
   'Conversazione non disponibile.'
  );
 }

 await allowed(
  conversation.company_id
 );

 /*
  * Le conversazioni di prova dell'azienda vengono
  * bloccate alla scadenza della Demo/piano.
  * La chat pubblica MoreAI resta disponibile.
  */
 if(conversation.owner_user_id||conversation.kind==='real'){
  await requireActivePlan(
   conversation.company_id
  );
 }

 // Il widget sul sito dell'azienda funziona solo con Base, Plus o Advanced
 // (anche durante i 14 giorni di prova): con la sola Demo si ferma.
 if(conversation.kind==='real'&&!['base','plus','advanced'].includes(await effectivePlan(db,conversation.company_id))){
  fail(402,'La chat non è disponibile al momento.');
 }

 if(path==='/api/feedback'){
  if(
   !Number.isInteger(body.rating)||
   body.rating<1||
   body.rating>5||
   typeof body.comment!=='string'||
   body.comment.length>1000
  ){
   fail(
    400,
    'Controlla la valutazione.'
   );
  }

  const saved=await db.pool.query(
   `INSERT INTO feedback(
      company_id,
      conversation_id,
      rating,
      comment
    )
    VALUES($1,$2,$3,$4)
    ON CONFLICT(
      company_id,
      conversation_id
    )
    DO NOTHING`,
   [
    conversation.company_id,
    conversation.id,
    body.rating,
    body.comment
   ]
  );

  // Chat della home e chat di prova della dashboard: avvisa il gestore
  // di MoreAI via email. I feedback dei visitatori sui siti delle aziende
  // restano solo nella loro dashboard. Un errore di invio non blocca il salvataggio.
  if(
   saved.rowCount&&
   (conversation.kind==='public_demo'||conversation.kind==='test')
  ){
   const companyName=conversation.kind==='test'
    ?(await db.pool.query(
      "SELECT config->>'name' AS name FROM companies WHERE id=$1",
      [conversation.company_id]
     )).rows[0]?.name
    :'';
   await notifyHomeFeedback(db,{
    companyId:conversation.company_id,
    conversationId:conversation.id,
    rating:body.rating,
    comment:body.comment,
    source:conversation.kind==='test'?'test':'home',
    companyName
   });
  }

  return json(
   {saved:true},
   201
  );
 }

 const message=
  validate(
   body,
   'message'
  );

 const requestId=
  body.request_id||token();

 if(
  typeof requestId!=='string'||
  requestId.length>100
 ){
  fail(
   400,
   'Richiesta non valida.'
  );
 }

 const cached=(
  await db.pool.query(
   `SELECT
      message_hash,
      response
    FROM chat_turns
    WHERE company_id=$1
      AND conversation_id=$2
      AND request_id=$3`,
   [
    conversation.company_id,
    conversation.id,
    requestId
   ]
  )
 ).rows[0];

 if(cached){
  if(
   cached.message_hash!==
    hash(message)
  ){
   fail(
    409,
    'Richiesta già utilizzata.'
   );
  }

  return json(
   cached.response
  );
 }

 if(conversation.state.closed){
  return json({
   reply:
    'Conversazione conclusa. Puoi iniziarne una nuova.',
   saved:
    conversation.state.saved,
   closed:true,
   consent_pending:false
  });
 }

 if(!modelReady()){
  fail(
   503,
   'L’assistente è momentaneamente non disponibile. Riprova tra qualche secondo.'
  );
 }

 if(
  conversation.state.count>=40
 ){
  fail(
   429,
   'Inizia una nuova conversazione.'
  );
 }

 const lock=token();

 const acquired=
  await db.pool.query(
   `UPDATE conversations
       SET busy_token=$1,
           busy_until=NOW()+INTERVAL '45 seconds'
     WHERE company_id=$2
       AND id=$3
       AND (
        busy_until IS NULL
        OR busy_until<NOW()
       )
     RETURNING id`,
   [
    lock,
    conversation.company_id,
    conversation.id
   ]
  );

 if(!acquired.rowCount){
  fail(
   409,
   'Una risposta è già in preparazione. Attendi qualche secondo.'
  );
 }

 try{
  // Tetto globale giornaliero: protezione dei costi su tutta la piattaforma.
  await limit(
   db,
   'ai-total',
   Number(
    process.env.LINEA_AI_DAILY_LIMIT||
    100
   ),
   86400,
   'L’assistente è momentaneamente non disponibile. Riprova più tardi.'
  );

  // Anti-raffica per azienda: evita che un abuso esaurisca la quota in pochi secondi.
  await limit(
   db,
   'ai-burst:'+
    conversation.company_id,
   Number(process.env.LINEA_AI_COMPANY_PER_MINUTE||30),
   60,
   'Troppi messaggi in poco tempo. Riprova tra qualche secondo.'
  );

  const current=(
   await db.pool.query(
    `SELECT *
       FROM conversations
      WHERE company_id=$1
        AND id=$2`,
    [
     conversation.company_id,
     conversation.id
    ]
   )
  ).rows[0];

  const history=(
   await db.pool.query(
    `SELECT role,content
       FROM messages
      WHERE company_id=$1
        AND conversation_id=$2
      ORDER BY seq DESC
      LIMIT 12`,
    [
     current.company_id,
     current.id
    ]
   )
  ).rows.reverse();

  /*
   * Quota mensile dell'azienda: riservata PRIMA della chiamata al modello.
   * Piano, limite e periodo sono calcolati solo dal database.
   */
  let quota;

  try{
   quota=
    await reserveMessage(
     db,
     current.company_id
    );
  }catch(e){
   if(e instanceof QuotaError){
    fail(
     e.code==='NO_ACTIVE_PLAN'?402:429,
     e.code==='NO_ACTIVE_PLAN'
      ? 'La Demo è terminata. Attiva un piano per continuare a utilizzare lo Spazio Aziendale.'
      : 'È stato raggiunto il limite mensile di messaggi previsto dal piano.'
    );
   }

   throw e;
  }

  let result;

  try{
   result=
    await model(
     current.config,
     current.state,
     history,
     message
    );
  }catch(e){
   // Nessuna risposta generata: il messaggio non viene conteggiato.
   // Nel log solo il codice normalizzato, mai contenuti o credenziali.
   console.error(
    'MoreAI model error:',
    typeof e?.code==='string'?e.code:(e?.name||'unknown')
   );

   await releaseMessage(
    db,
    current.company_id,
    quota.period
   );

   if(!e.httpStatus){
    fail(
     503,
     'L’assistente è momentaneamente non disponibile. Riprova tra qualche secondo.'
    );
   }

   throw e;
  }

  await recordTokens(
   db,
   current.company_id,
   quota.period,
   result.usage
  ).catch(()=>{});

  const turn=
   advance(
    current.config,
    current.state,
    message,
    result
   );

  const client=
   await db.pool.connect();

  try{
   await client.query(
    'BEGIN'
   );

   const guard=
    await client.query(
     `SELECT id
        FROM conversations
       WHERE company_id=$1
         AND id=$2
         AND busy_token=$3
         AND busy_until>NOW()
       FOR UPDATE`,
     [
      current.company_id,
      current.id,
      lock
     ]
    );

   if(!guard.rowCount){
    fail(
     409,
     'La richiesta è scaduta. Riprova.'
    );
   }

   const seq=
    current.state.count*2;

   await client.query(
    `INSERT INTO messages(
       company_id,
       conversation_id,
       seq,
       role,
       content,
       created_at
     )
     VALUES(
       $1,$2,$3,'user',$4,NOW()
     ),
     (
       $1,$2,$5,'assistant',$6,NOW()
     )`,
    [
     current.company_id,
     current.id,
     seq,
     message,
     seq+1,
     turn.reply
    ]
   );

   if(turn.save){
    await client.query(
     `INSERT INTO leads(
        id,
        company_id,
        conversation_id,
        data,
        status,
        summary,
        consent,
        created_at,
        updated_at,
        kind
      )
      VALUES(
        $1,$2,$3,$4::jsonb,
        'Nuova',$5,$6,
        NOW(),NOW(),$7
      )
      ON CONFLICT(
        company_id,
        conversation_id
      )
      DO NOTHING`,
     [
      token(),
      current.company_id,
      current.id,
      JSON.stringify(
       turn.state.data
      ),
      Object.entries(
       turn.state.data
      ).map(
       ([k,v])=>`${k}: ${v}`
      ).join('\n'),
      turn.state.consent,
      current.kind
     ]
    );
   }

   // Correzione del cliente dopo il salvataggio: aggiorna la stessa richiesta.
   if(turn.update){
    await client.query(
     `UPDATE leads
         SET data=$1::jsonb,
             summary=$2,
             updated_at=NOW()
       WHERE company_id=$3
         AND conversation_id=$4`,
     [
      JSON.stringify(turn.state.data),
      Object.entries(turn.state.data).map(([k,v])=>`${k}: ${v}`).join('\n'),
      current.company_id,
      current.id
     ]
    );
   }

   await client.query(
    `UPDATE conversations
        SET state=$1::jsonb,
            updated_at=NOW(),
            busy_token=NULL,
            busy_until=NULL
      WHERE company_id=$2
        AND id=$3`,
    [
     JSON.stringify(
      turn.state
     ),
     current.company_id,
     current.id
    ]
   );

   const response={
    reply:turn.reply,
    saved:turn.state.saved,
    closed:turn.state.closed,
    consent_pending:
     turn.state.pending
   };

   await client.query(
    `INSERT INTO chat_turns(
       company_id,
       conversation_id,
       request_id,
       message_hash,
       response
     )
     VALUES(
       $1,$2,$3,$4,$5::jsonb
     )`,
    [
     current.company_id,
     current.id,
     requestId,
     hash(message),
     JSON.stringify(response)
    ]
   );

   await client.query(
    'COMMIT'
   );

   return json(response);
  }catch(e){
   await client.query(
    'ROLLBACK'
   );

   throw e;
  }finally{
   client.release();
  }
 }finally{
  await db.pool.query(
   `UPDATE conversations
       SET busy_token=NULL,
           busy_until=NULL
     WHERE company_id=$1
       AND id=$2
       AND busy_token=$3`,
   [
    conversation.company_id,
    conversation.id,
    lock
   ]
  );
 }
}