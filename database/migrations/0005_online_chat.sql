ALTER TABLE conversations ADD COLUMN kind TEXT NOT NULL DEFAULT 'test' CHECK(kind IN ('test','public_demo','real'));
ALTER TABLE conversations ADD COLUMN owner_user_id TEXT REFERENCES users(id);
ALTER TABLE conversations ADD COLUMN busy_token TEXT;
ALTER TABLE conversations ADD COLUMN busy_until TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN kind TEXT NOT NULL DEFAULT 'test' CHECK(kind IN ('test','public_demo','real'));
CREATE TABLE chat_turns (
 company_id TEXT NOT NULL, conversation_id TEXT NOT NULL, request_id TEXT NOT NULL,
 message_hash TEXT NOT NULL, response JSONB NOT NULL,
 PRIMARY KEY(company_id,conversation_id,request_id),
 FOREIGN KEY(company_id,conversation_id) REFERENCES conversations(company_id,id) ON DELETE CASCADE
);
CREATE TABLE chat_limits (key TEXT NOT NULL,bucket BIGINT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(key,bucket));
INSERT INTO companies(id,public_id,created_at,config) VALUES('demo','demo',NOW(),'{"name":"Servizi Linea AI","sector":"Servizi alle aziende","service_demo":true,"recipient":"supporto Linea AI","region":"IT","confirmation_email":false,"knowledge":"Linea AI è una piattaforma multi-settore per assistenti aziendali personalizzati, raccolta di contatti con consenso e dashboard separate. La migrazione online è in corso. Non presentare integrazioni non collegate come operative. Per tariffe e piani rimanda alla sezione Offerte /#offerte; gli importi sono visibili dopo accesso. Demo 7 giorni; piani Base, Plus e Advanced, prova 14 giorni, annuale con risparmio 15%. Pagamenti simulati, servizi inclusi da definire. Prenotazioni, CRM, voce e WhatsApp non ancora collegati. Non promettere invii email o tempi: mittente da configurare. Si può registrare una richiesta per il supporto con nome, email e consenso.","fields":[{"key":"nome","label":"Nome","required":true,"kind":"text"},{"key":"email","label":"Email","required":true,"kind":"email"},{"key":"interesse","label":"Richiesta per il supporto","required":true,"kind":"text"}],"agent":{"capabilities":{"can_request_phone":false},"branding":{"greeting":"Ciao! Sono l’assistente di Servizi Linea AI. Cosa vorresti sapere sulla piattaforma?"}}}'::jsonb) ON CONFLICT DO NOTHING;
INSERT INTO company_management(company_id) VALUES('demo') ON CONFLICT DO NOTHING;
