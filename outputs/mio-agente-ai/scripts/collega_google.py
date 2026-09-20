from runtime_config import secret_file
"""Collega il programma locale al foglio scelto tramite OAuth Google."""
from pathlib import Path
from sheets_store import BASE, GoogleSheets, private_json, service

import json,os
path=secret_file('google_sheets.json')
CONFIG=json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
CONFIG['spreadsheet_id']=os.environ.get('LINEA_GOOGLE_SHEET_ID') or CONFIG.get('spreadsheet_id','')
CONFIG['worksheet']=os.environ.get('LINEA_GOOGLE_WORKSHEET') or CONFIG.get('worksheet','Foglio1')



def main():
    if not CONFIG['spreadsheet_id']:
        print('Configura LINEA_GOOGLE_SHEET_ID prima di collegare Google.');return 1
    if not (secret_file('credentials.json')).exists():
        print('Manca credentials.json: segui COLLEGAMENTO_GOOGLE.md nella stessa cartella.')
        print('Serve un client OAuth Google di tipo App desktop; non una semplice API key.')
        return 1
    print('Apro l’accesso Google, se necessario. Autorizza il tuo programma nel browser.')
    api = service(interactive=True)
    tab = "'"+CONFIG["worksheet"].replace("'","''")+"'!A1:E1"
    header = api.spreadsheets().values().get(
        spreadsheetId=CONFIG['spreadsheet_id'], range=tab,
    ).execute(num_retries=0).get('values', [])
    if header not in ([['Nome', 'Telefono', 'Trattamento', 'Tempistica', 'Consenso ricontatto']],
                      [['nome', 'telefono', 'trattamento', 'tempistica', 'consenso al ricontatto']]):
        raise ValueError('Le cinque intestazioni non corrispondono. Nessuna modifica effettuata.')
    private_json(secret_file('google_sheets.json'), CONFIG)
    print('Accesso verificato e foglio configurato. Ora apri Avvia.command.')
    print('La prima chat con consenso positivo verificherà anche la scrittura effettiva.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f'Collegamento non completato ({type(exc).__name__}). Verifica API, account e accesso al foglio.')
        raise SystemExit(1)
