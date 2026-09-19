"""Prototipo locale: raccolta guidata di richieste e risposte con Ollama."""
import json
import os
import re
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import ollama

BASE = Path(__file__).resolve().parent
QUESTIONS = {
    'nome': 'Come ti chiami? Inserisci nome e cognome.',
    'telefono': 'A quale numero desideri essere ricontattato? Includi il prefisso internazionale, se necessario.',
    'motivo': 'Qual è il motivo generale della visita? Ad esempio controllo o igiene; evita dettagli clinici.',
    'disponibilita': 'Quali giorni o fasce orarie preferisci? Puoi scrivere “da concordare”.',
}
CONSENT = (
    'Vuoi salvare questi dati in leads.txt su questo Mac per la prova di raccolta '
    'della richiesta? Scrivi “sì” oppure “no”. Nessun dato verrà inviato allo studio.'
)


def valida(campo, valore):
    valore = valore.strip()
    if not valore or len(valore) > 300 or any(ord(c) < 32 for c in valore):
        raise ValueError('Inserisci un testo da 1 a 300 caratteri su una sola riga.')
    if campo == 'nome' and (len(valore) < 2 or not any(c.isalpha() for c in valore)):
        raise ValueError('Inserisci un nome valido.')
    if campo == 'telefono':
        if not re.fullmatch(r'\+?[0-9 ()-]+', valore):
            raise ValueError('Usa solo cifre, un eventuale + iniziale, spazi, trattini o parentesi.')
        numero = re.sub(r'[ ()-]', '', valore)
        if not 7 <= len(numero.lstrip('+')) <= 15:
            raise ValueError('Il telefono deve contenere da 7 a 15 cifre.')
        return numero
    return valore


def salva_lead(dati, percorso):
    if dati.get('consenso_privacy') is not True:
        raise ValueError('Salvataggio non consentito senza conferma esplicita.')
    record = {campo: valida(campo, dati.get(campo, '')) for campo in QUESTIONS}
    record.update({
        'id': str(uuid4()), 'data': datetime.now().astimezone().isoformat(),
        'stato': 'Nuovo', 'consenso_privacy': True,
        'testo_consenso': CONSENT, 'versione_consenso': 'demo-locale-v1',
        'ambiente': 'demo_locale',
    })
    # Un oggetto JSON per riga; il file non viene creato prima della conferma.
    fd = os.open(percorso, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(fd, 'a', encoding='utf-8') as file:
        file.write(json.dumps(record, ensure_ascii=False) + '\n')
        file.flush()
        os.fsync(file.fileno())
    return record


class Raccolta:
    def __init__(self, percorso=BASE / 'leads.txt'):
        self.percorso = percorso
        self.dati = {}
        self.chiuso = False

    def domanda(self):
        for campo, domanda in QUESTIONS.items():
            if campo not in self.dati:
                return domanda
        riepilogo = '\n'.join(f'{k.capitalize()}: {v}' for k, v in self.dati.items())
        return 'Riepilogo:\n' + riepilogo + '\n\n' + CONSENT

    def ricevi(self, testo):
        if self.chiuso:
            return 'Richiesta già conclusa. Usa /nuovo per ricominciare.'
        for campo in QUESTIONS:
            if campo not in self.dati:
                try:
                    self.dati[campo] = valida(campo, testo)
                except ValueError as exc:
                    return str(exc) + '\n' + QUESTIONS[campo]
                return self.domanda()
        scelta = testo.strip().casefold()
        if scelta in ('no', 'n'):
            self.dati.clear()
            self.chiuso = True
            return 'Dati scartati, nessuna richiesta salvata.'
        if scelta not in ('sì', 'si'):
            return 'Scrivi “sì” per salvare o “no” per scartare. Usa /nuovo per correggere i dati.'
        record = salva_lead({**self.dati, 'consenso_privacy': True}, self.percorso)
        self.dati.clear()
        self.chiuso = True
        return (
            f"Richiesta salvata localmente. Codice: {record['id']}\n"
            'Questa è una prova: nessun appuntamento è stato prenotato e nessun messaggio inviato.'
        )


def chiedi_all_ai(domanda):
    # I dati operativi non configurati non vengono affidati al modello.
    if re.search(
        r'orari|apert|chius|domenic|sabato|luned|marted|mercoled|gioved|venerd|'
        r'cost|prezz|tariff|euro|pagament|disponib|appuntament|prenot|'
        r'indirizz|dove|sede|recapit|telefon|email|nome.*(?:studio|dottor)',
        domanda, re.I,
    ):
        return (
            'Orari, prezzi, sede e disponibilità dello studio non sono ancora configurati. '
            'Per queste informazioni occorre rivolgersi a un operatore dello studio. '
            'Qui puoi soltanto preparare una richiesta di ricontatto locale di prova.'
        )
    prompt = (BASE / 'prompt.txt').read_text(encoding='utf-8')
    client = ollama.Client(host='http://127.0.0.1:11434', timeout=120)
    risposta = client.chat(model='llama3', messages=[
        {'role': 'system', 'content': prompt},
        {'role': 'user', 'content': domanda[:2000]},
    ], options={'temperature': 0.2, 'num_predict': 220})
    return risposta.message.content or 'Non ho una risposta disponibile.'


def main():
    raccolta = Raccolta()
    print('ASSISTENTE STUDIO DENTISTICO — PROVA LOCALE')
    print('Usa dati fittizi. Studio e informativa per l’uso reale non sono ancora configurati.')
    print('Nessuna prenotazione o comunicazione esterna viene effettuata.')
    print('Comandi: /domanda TESTO · /nuovo · esci')
    print('Per fare una domanda anziché compilare un campo, usa /domanda TESTO.')
    print('\nAssistente:', raccolta.domanda())
    while True:
        try:
            testo = input('\nTu: ').strip()
            if testo.casefold() in ('esci', 'quit', 'bye'):
                print('Arrivederci. I dati non confermati vengono scartati.')
                return
            if testo == '/nuovo':
                raccolta = Raccolta()
                print('Assistente:', raccolta.domanda())
            elif testo.startswith('/domanda '):
                try:
                    print('Assistente:', chiedi_all_ai(testo[9:]))
                except Exception:
                    print('Risposta AI non disponibile. Verifica che Ollama sia aperto e llama3 installato.')
                if not raccolta.chiuso:
                    print('\nPer continuare:', raccolta.domanda())
            elif testo.startswith('/'):
                print('Comandi disponibili: /domanda TESTO · /nuovo · esci')
            else:
                print('Assistente:', raccolta.ricevi(testo))
        except (KeyboardInterrupt, EOFError):
            print('\nArrivederci. I dati non confermati vengono scartati.')
            return
        except OSError as exc:
            print(f'Salvataggio non confermato: {exc}. Verifica il file prima di riprovare.')


if __name__ == '__main__':
    main()
