from runtime_config import secret_file
"""Tool Add to sheet: scrive cinque celle e verifica la ricevuta di Google."""
import json
import os
from pathlib import Path

BASE = Path(__file__).resolve().parent
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
HEADERS = ['nome', 'telefono', 'trattamento', 'tempistica', 'consenso al ricontatto']


class SheetsError(Exception):
    pass


def private_json(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
    Path(path).chmod(0o600)


def service(interactive=False):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google.oauth2.service_account import Credentials as ServiceCredentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    import google_auth_httplib2
    import httplib2

    credential_file = secret_file('credentials.json')
    token_file = secret_file('token.json')
    credentials = None
    if credential_file.exists():
        metadata = json.loads(credential_file.read_text())
        if metadata.get('type') == 'service_account':
            credentials = ServiceCredentials.from_service_account_file(str(credential_file), scopes=SCOPES)
    if credentials is None:
        if token_file.exists():
            credentials = Credentials.from_authorized_user_file(str(token_file), SCOPES)
        if credentials and credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
            private_json(token_file, json.loads(credentials.to_json()))
        if not credentials or not credentials.valid:
            if not interactive or not credential_file.exists():
                raise SheetsError('Accesso Google non configurato. Apri Collega-Google-Sheets.command.')
            flow = InstalledAppFlow.from_client_secrets_file(str(credential_file), SCOPES)
            credentials = flow.run_local_server(port=0, timeout_seconds=180)
            private_json(token_file, json.loads(credentials.to_json()))
    http = google_auth_httplib2.AuthorizedHttp(credentials, http=httplib2.Http(timeout=30))
    return build('sheets', 'v4', http=http, cache_discovery=False)


class GoogleSheets:
    def __init__(self):
        self.config_file = secret_file('google_sheets.json')

    def configuration(self):
        if not self.config_file.exists():
            raise SheetsError('Foglio non configurato. Apri Collega-Google-Sheets.command.')
        config = json.loads(self.config_file.read_text())
        if not config.get('spreadsheet_id') or not config.get('worksheet'):
            raise SheetsError('Configurazione del foglio incompleta.')
        return config

    def add_to_sheet(self, lead, consent=False):
        if consent is not True:
            raise SheetsError('Manca il consenso esplicito al ricontatto.')
        fields = ['nome', 'telefono', 'trattamento', 'tempistica']
        if any(not isinstance(lead.get(k), str) or not lead[k].strip() for k in fields):
            raise SheetsError('I dati del contatto sono incompleti.')
        config = self.configuration()
        from sheets_http import SheetsHTTP
        http=SheetsHTTP(BASE)
        token=http.token()
        tab = "'" + config['worksheet'].replace("'", "''") + "'"
        header=http.values(config,tab+'!A1:E1',token)
        if header.get('values') not in ([HEADERS], [['Nome', 'Telefono', 'Trattamento', 'Tempistica', 'Consenso ricontatto']]):
            raise SheetsError('Le intestazioni del foglio non corrispondono alle cinque colonne richieste.')
        row = [lead[k] for k in fields] + ['sì']
        # RAW conserva il telefono e impedisce l'esecuzione di formule nei dati utente.
        # Nessun retry automatico: una risposta persa non deve creare una seconda riga.
        result=http.values(config,tab+'!A:E',token,rows=[row])
        update = result.get('updates', {})
        if update.get('updatedRows') != 1 or update.get('updatedData', {}).get('values') != [row]:
            raise SheetsError('Ricevuta Google non verificata; controllare il foglio prima di riprovare.')
        return update['updatedRange']

    def update_request(self,row_range,previous,updated):
        """Aggiorna solo la richiesta della riga verificata, senza creare nuovi lead."""
        import re
        from urllib.parse import quote,urlencode
        from sheets_http import SheetsHTTP
        match=re.fullmatch(r"(.+)!A([0-9]+):E[0-9]+",row_range or '')
        if not match:raise SheetsError('Riferimento riga non disponibile.')
        config=self.configuration();http=SheetsHTTP(BASE);token=http.token()
        expected=[previous[k] for k in ('nome','telefono','trattamento','tempistica')]+['sì']
        if http.values(config,row_range,token).get('values')!=[expected]:
            raise SheetsError('La riga è cambiata: aggiornamento sospeso.')
        cell=match[1]+'!C'+match[2]
        url='https://sheets.googleapis.com/v4/spreadsheets/'+quote(config['spreadsheet_id'],safe='')+'/values/'+quote(cell,safe='')+'?'+urlencode({'valueInputOption':'RAW','includeValuesInResponse':'true'})
        result=http.request(url,{'values':[[updated['trattamento']]]},token=token,method='PUT')
        if result.get('updatedData',{}).get('values')!=[[updated['trattamento']]]:
            raise SheetsError('Aggiornamento non verificato.')
        return row_range
