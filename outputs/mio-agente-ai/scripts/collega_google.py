"""Collega il programma locale al foglio scelto tramite OAuth Google."""
from pathlib import Path
from sheets_store import BASE, GoogleSheets, private_json, service

CONFIG = {
    'spreadsheet_id': '1mU-tlfESedZVPBX-HXdOi0y9VYQ67uhya7oo6RXto9M',
    'worksheet': 'Foglio1',
}


def main():
    if not (BASE / 'credentials.json').exists():
        print('Manca credentials.json: segui COLLEGAMENTO_GOOGLE.md nella stessa cartella.')
        print('Serve un client OAuth Google di tipo App desktop; non una semplice API key.')
        return 1
    print('Apro l’accesso Google, se necessario. Autorizza il tuo programma nel browser.')
    api = service(interactive=True)
    tab = "'Foglio1'!A1:E1"
    header = api.spreadsheets().values().get(
        spreadsheetId=CONFIG['spreadsheet_id'], range=tab,
    ).execute(num_retries=0).get('values', [])
    if header not in ([['Nome', 'Telefono', 'Trattamento', 'Tempistica', 'Consenso ricontatto']],
                      [['nome', 'telefono', 'trattamento', 'tempistica', 'consenso al ricontatto']]):
        raise ValueError('Le cinque intestazioni non corrispondono. Nessuna modifica effettuata.')
    private_json(BASE / 'google_sheets.json', CONFIG)
    print('Accesso verificato e foglio configurato. Ora apri Avvia.command.')
    print('La prima chat con consenso positivo verificherà anche la scrittura effettiva.')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f'Collegamento non completato ({type(exc).__name__}). Verifica API, account e accesso al foglio.')
        raise SystemExit(1)
