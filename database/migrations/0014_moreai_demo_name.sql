-- Nuovo nome MoreAI anche nella chat della home (azienda "demo"):
-- nome, referente, conoscenza e saluto non devono più dire "Linea AI".
-- Il saluto perde anche il punto esclamativo.
UPDATE companies
   SET config = replace(
                  replace(config::text, 'Linea AI', 'MoreAI'),
                  'Ciao! Sono l’assistente di', 'Ciao, sono l’assistente di'
                )::jsonb
 WHERE id = 'demo';
