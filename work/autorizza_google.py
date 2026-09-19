import sys, json
from pathlib import Path
sys.path.insert(0,str(Path('outputs/mio-agente-ai').resolve()))
from google_auth_oauthlib.flow import InstalledAppFlow
from sheets_store import BASE, SCOPES, private_json
flow=InstalledAppFlow.from_client_secrets_file(str(BASE/'credentials.json'),SCOPES)
creds=flow.run_local_server(port=8765,open_browser=False,timeout_seconds=600,
    authorization_prompt_message='Apri: {url}',success_message='Collegamento Google autorizzato. Puoi tornare alla chat.')
private_json(BASE/'token.json',json.loads(creds.to_json()))
print('Autorizzazione salvata.')
