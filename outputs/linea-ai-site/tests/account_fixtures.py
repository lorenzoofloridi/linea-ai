"""Complete real verification flow for test accounts in temporary databases."""
from unittest.mock import patch
from saas import store,email_service,mail

def verify_session(session):
 user=store.principal(session)
 with patch.object(mail,'config',return_value=None):email_service.request_verification(user)
 with store.connection() as d:
  row=d.execute("SELECT body FROM email_outbox WHERE company_id=? AND event_key LIKE 'verify:%' ORDER BY rowid DESC LIMIT 1",(user['company_id'],)).fetchone()
 email_service.verify(row['body'].split('#')[1].split('\n')[0])

 with store.connection() as d:d.execute("DELETE FROM email_outbox WHERE company_id=? AND event_key LIKE 'verify:%'",(user['company_id'],))
