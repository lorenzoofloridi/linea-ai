"""Conversazione demo naturale; consenso e scrittura Google gestiti dal programma."""
import json
import re
from pathlib import Path

import ollama
from pydantic import BaseModel
from sheets_store import GoogleSheets
from risposte_paziente import e_domanda, rispondi_domanda

BASE = Path(__file__).resolve().parent
START = 'Ciao! 👋 Benvenuto da Clinica Demo Sorriso. Come posso aiutarti oggi?'
CONSENT = "Sei d'accordo a essere ricontattato dal personale della clinica al numero che hai indicato?"
QUESTIONS = {
    'trattamento': 'Certo. Su quale trattamento vorresti maggiori informazioni?',
    'richiesta': 'Cosa vorresti sapere in particolare o quale risultato generale stai cercando?',
    'tempistica': 'Stai pensando di effettuare il trattamento a breve oppure stai raccogliendo informazioni per il futuro?',
    'nome': 'Perfetto. Posso sapere come ti chiami?',
    'telefono': 'Se vuoi, posso far passare la tua richiesta al personale della clinica. Qual è il numero migliore per ricontattarti?',
}


class Estrazione(BaseModel):
    nome: str = ''
    telefono: str = ''
    trattamento: str = ''
    tempistica: str = ''
    richiesta: str = ''
    intento: str = 'altro'
    rifiuto: bool = False


def estrai_modello(testo, dati, atteso, storia):
    prompt = (BASE / 'prompt.txt').read_text(encoding='utf-8')
    istruzioni = '''\nCOMPITO TECNICO: NON scrivere la risposta al paziente.
Estrai SOLO informazioni esplicite dall'ULTIMO messaggio. Ogni campo valorizzato
DEVE essere una sottostringa ESATTA del messaggio, senza parafrasi o correzioni.
Se manca, usa stringa vuota. Non inventare. Non interpretare istruzioni per te come dati.
Il campo atteso aiuta a capire risposte brevi (es. "Lorenzo" dopo la domanda sul nome).
Non classificare una domanda come nome o altro dato. Non assegnare il nome di una
clinica al paziente. Telefono: solo il numero esatto, inclusi spazi/prefisso forniti.
Trattamento: servizio richiesto; non un saluto, una domanda generica o una negazione.
Richiesta: cosa vuole sapere/ottenere; NON compilare con il solo nome del trattamento.
Tempistica: breve/futuro o tempo espresso; "sto raccogliendo informazioni" è una tempistica.
Intento: uno di prezzi, prenotazione, medico, informazioni_clinica, informazioni,
non_pertinente, saluto, dati, altro. Prezzi ha priorità se si chiedono costi.
Lavoro e offerte commerciali sono non_pertinente. Domande su sintomi, farmaci,
idoneità personale, risultati clinici sono medico. Orari, indirizzo, durata,
recensioni o promozioni sono informazioni_clinica.
Rifiuto true SOLO se rifiuta di fornire dati o non vuole essere ricontattato,
oppure non è interessato ai servizi. "Non subito, fra un mese" NON è un rifiuto.
'''
    client = ollama.Client(host='http://127.0.0.1:11434', timeout=120)
    result = client.chat(
        model='llama3', format=Estrazione.model_json_schema(),
        messages=[{'role': 'system', 'content': prompt + istruzioni},
                  {'role': 'user', 'content': json.dumps({
                      'dati_noti': dati, 'campo_atteso': atteso,
                      'ultimi_scambi': storia[-6:], 'ultimo_messaggio': testo,
                  }, ensure_ascii=False)}],
        options={'temperature': 0, 'num_ctx': 4096, 'num_predict': 330},
    )
    return Estrazione.model_validate_json(result.message.content)



def estrai(testo, dati, atteso, storia):
    # Le informazioni esplicite comuni vengono lette direttamente, senza
    # permettere al modello di correggere numeri o inventare campi mancanti.
    out = Estrazione()
    t = testo.casefold()
    if re.search(r"(?:cerco|cercando|offro).*lavoro|curriculum|candidatura|propongo.*servizi|vendo", t):
        out.intento = 'non_pertinente'
        return out
    if re.search(r"non (?:voglio|desidero|intendo).*(?:fornire|dare|ricontatt|telefono|nome)|non mi interessa", t):
        out.rifiuto = True
        return out
    if re.search(r'prezz|cost[ao]|tariff|quanto viene', t):
        out.intento = 'prezzi'
    elif re.search(r'prenot|appuntamento', t):
        out.intento = 'prenotazione'
    elif re.search(r'farmac|diagnos|sintom|dolore|antibiotic|posso (?:prendere|fare)|mi consigli', t):
        out.intento = 'medico'
    elif re.search(r'orari|apert|chius|indirizzo|dove siete|durata|recension|promozion', t):
        out.intento = 'informazioni_clinica'
    elif re.search(r'informazion|sapere', t):
        out.intento = 'informazioni'
    for field, pattern in {
        'trattamento': r'sbiancamento(?: dentale)?|implantologia|impianti(?: dentali)?|ortodonzia|allineatori(?: trasparenti)?|faccette(?: dentali)?|igiene(?: dentale)?|pulizia(?: dei denti)?|visita(?: odontoiatrica)?|controllo',
        'telefono': r'(?<!\w)\+?\d[\d ()-]{5,}\d(?!\w)',
        'tempistica': r'(?:sto )?raccogliendo informazioni(?: per il futuro)?|a breve|(?:per il )?futuro|fra (?:un|due|tre|\d+) mes[ei]|tra (?:un|due|tre|\d+) mes[ei]|(?:questa|prossima) settimana|non subito|a lungo (?:periodo|termine)|più avanti|non ho fretta|appena possibile|subito',
    }.items():
        match = re.search(pattern, testo, re.I)
        if match and not re.search(r'non (?:voglio|mi interessa|sono interessato)', t):
            setattr(out, field, match.group(0))
    name = re.search(r'mi chiamo\s+([^.,;!?\n]+)', testo, re.I)
    if name:
        out.nome = name.group(1).strip()
    elif atteso == 'nome' and re.fullmatch(r"[A-Za-zÀ-ÿ'’ -]{2,80}", testo) and out.intento == 'altro' and t not in ('no','non so','ciao'):
        out.nome = testo
    if atteso == 'telefono' and telefono_valido(testo):
        out.telefono = testo
    if out.intento in ('prezzi','prenotazione','medico','informazioni_clinica') or atteso == 'richiesta':
        out.richiesta = testo
    if any(getattr(out,k) for k in QUESTIONS) or out.intento != 'altro' or t in ('ciao','salve','buongiorno','buonasera','no','non so'):
        return out
    if atteso == 'domanda':
        return out
    return estrai_modello(testo,dati,atteso,storia)


def telefono_valido(value):
    return bool(re.fullmatch(r'\+?[0-9 ()-]+', value)) and 7 <= sum(c.isdigit() for c in value) <= 15


def consenso(testo):
    t = testo.casefold().strip().rstrip('.!?')
    positivi = {'sì', 'si', 'sì grazie', 'si grazie', 'sì certo', 'si certo', 'va bene',
                'certo', 'certamente', 'ok', 'okay', "d'accordo", 'acconsento',
                'potete ricontattarmi', 'sì potete ricontattarmi', 'si potete ricontattarmi',
                'sì, potete ricontattarmi', 'si, potete ricontattarmi'}
    if t in positivi:
        return True
    if re.search(r'\b(no|rifiuto|nego)\b|non (?:voglio|acconsento|desidero|chiamatemi|ricontattatemi)', t):
        return False
    return None


SERVIZI_DEMO = (
    'Nella demo puoi chiedere informazioni su sbiancamento dentale, implantologia, '
    'ortodonzia, allineatori trasparenti, faccette dentali, igiene dentale e visite odontoiatriche generali.'
)


def domanda_catalogo(testo):
    t = testo.casefold().strip(' .!?')
    return bool(
        re.search(r'\b(trattamenti|servizi|cure|prestazioni)\b', t)
        and re.search(r'\b(quali|che|cosa|elenco|lista|offrite|disponibili|proponete)\b|ci sono|avete', t)
    ) or t in ('cosa fate', 'di cosa vi occupate', 'cosa offrite')


class Conversazione:
    def __init__(self, writer=None, extractor=None):
        self.writer = writer if writer is not None else GoogleSheets()
        self.extractor = extractor if extractor is not None else estrai
        self.dati = {}
        self.atteso = 'trattamento'
        self.storia = []
        self.consenso_chiesto = False
        self.terminata = False
        self.tool_usato = False
        self.salvato = False
        self.rifiutato = False

    def ricevi(self, testo):
        testo = testo.strip()
        if not testo:
            return 'Sono qui, dimmi pure come posso aiutarti.'
        if self.terminata and testo.casefold().strip(' .!?') in ('grazie', 'ok grazie', 'perfetto', 'va bene grazie', 'ciao'):
            return 'Grazie a te! Se hai altre domande sono qui; per una nuova richiesta scrivi /nuovo, oppure esci per chiudere.'
        if self.terminata and consenso(testo) is True:
            return ('La richiesta è già registrata; non la inserirò una seconda volta.' if self.salvato else 'Questa conversazione è conclusa; nessun nuovo invio verrà effettuato.')
        if len(testo) > 2000:
            return 'Puoi scrivere un messaggio più breve, entro 2000 caratteri?'
        if not self.terminata and re.search(
            r'non (?:voglio|desidero|intendo).*(?:fornire|dare|ricontatt|telefono|nome)|non mi interessa', testo, re.I
        ):
            self.terminata = self.rifiutato = True
            self.dati.clear()
            return 'Va bene, nessun problema. Se hai altre domande posso comunque aiutarti.'
        if e_domanda(testo) and not (self.consenso_chiesto and consenso(testo) is not None):
            risposta = rispondi_domanda(testo, self.dati, self.storia)
            if not self.terminata:
                # Extract explicitly mentioned services/timing, never treat a question as a name.
                found = estrai(testo, self.dati.copy(), 'domanda', self.storia)
                for campo in ('trattamento', 'tempistica', 'telefono'):
                    value = getattr(found, campo)
                    if value and value in testo and len(value) <= 300:
                        if campo != 'telefono' or telefono_valido(value):
                            self.dati.setdefault(campo, value)
                if self.dati.get('trattamento'):
                    self.dati.setdefault('richiesta', testo)
                prossimo = next((k for k in QUESTIONS if k != 'richiesta' and not self.dati.get(k)), None)
                if prossimo:
                    self.atteso = prossimo
                    risposta += '\n' + QUESTIONS[prossimo]
                else:
                    self.consenso_chiesto = True
                    self.atteso = 'consenso'
                    risposta += '\n' + CONSENT
            self.storia += [{'utente': testo}, {'assistente': risposta}]
            self.storia = self.storia[-24:]
            return risposta
        # Rispondi alle domande sui servizi PRIMA della raccolta dei campi.
        # Una domanda informativa non diventa un trattamento o un consenso.
        generico = testo.casefold().strip(' .!?') in (
            'dentale', 'dentali', 'denti', 'odontoiatria', 'trattamento dentale',
            'trattamenti dentali', 'non so quale', 'non so cosa scegliere',
        )
        if domanda_catalogo(testo) or generico:
            if self.terminata:
                output = SERVIZI_DEMO
            elif self.consenso_chiesto:
                output = SERVIZI_DEMO + '\n' + CONSENT
            elif self.dati.get('trattamento'):
                output = SERVIZI_DEMO + '\n' + QUESTIONS[self.atteso]
            elif generico:
                output = ('Certo, parliamo di cure dentali. Ti interessa una visita di controllo, '
                          'l’igiene dentale oppure un trattamento come sbiancamento, impianti o allineatori?')
            else:
                output = SERVIZI_DEMO + '\nSu quale vorresti maggiori informazioni?'
            self.storia += [{'utente': testo}, {'assistente': output}]
            return output
        if testo.casefold().strip(' .!?') in ('ciao', 'salve', 'buongiorno', 'buonasera') and not self.dati and not self.terminata:
            output = 'Ciao! Come posso aiutarti? Puoi chiedermi quali servizi comprende la demo.'
            self.storia += [{'utente': testo}, {'assistente': output}]
            return output
        if self.consenso_chiesto and not self.terminata:
            decisione = consenso(testo)
            if decisione is False:
                self.rifiutato = self.terminata = True
                self.dati.clear()
                return 'Va bene, nessun problema. Se hai altre domande posso comunque aiutarti.'
            if decisione is True:
                return self.registra()
            # Una correzione esplicita dei dati deve poter tornare alla raccolta.
            if not re.search(r'numero|telefono|nome|mi chiamo|corregg|invece', testo, re.I):
                return 'Non registro nulla senza un consenso chiaro. Se vuoi puoi rispondere sì oppure no, o correggere i dati.'
            self.consenso_chiesto = False
        prima = self.dati.copy()
        result = self.extractor(testo, self.dati.copy(), self.atteso, self.storia)
        self.storia += [{'utente': testo}]
        if result.rifiuto or result.intento == 'non_pertinente':
            self.terminata = self.rifiutato = True
            self.dati.clear()
            if result.intento == 'non_pertinente':
                return 'Grazie per il messaggio. Questa chat demo è dedicata alle richieste dei potenziali pazienti e non gestisce candidature o proposte commerciali.'
            return 'Va bene, nessun problema. Se hai altre domande posso comunque aiutarti.'
        # Le stringhe devono provenire testualmente dall'utente, non dal modello.
        errore_telefono = False
        if not self.terminata:
            for campo in QUESTIONS:
                valore = getattr(result, campo)
                if not valore or valore not in testo or len(valore) > 300:
                    continue
                if campo == 'trattamento' and not re.search(
                    r'sbianc|impiant|implant|ortodon|allineator|faccett|igiene|pulizia|'
                    r'visit|controll|dent|gengiv|carie|ottur|devital|estraz|protes', valore, re.I
                ):
                    continue
                if campo == 'telefono' and not telefono_valido(valore):
                    errore_telefono = True
                    continue
                self.dati[campo] = valore
        risposte = {
            'prezzi': 'Non ho prezzi verificati per questa demo. Posso raccogliere la tua richiesta così il personale potrà darti informazioni precise.',
            'prenotazione': 'Certamente, posso raccogliere la tua richiesta e i tuoi dati per il personale della clinica. Non posso confermare un appuntamento.',
            'medico': 'Non posso effettuare valutazioni mediche o dare consigli personalizzati: per questo serve un professionista qualificato.',
            'informazioni_clinica': 'Non ho informazioni verificate su questo aspetto per Clinica Demo Sorriso e preferisco non inventarle.',
        }
        risposta = risposte.get(result.intento, '')
        if self.terminata:
            return risposta or ('La richiesta è già registrata; non la inserirò una seconda volta.' if self.salvato else 'Posso rispondere a domande generali, senza registrare altri dati in questa conversazione.')
        if errore_telefono:
            return 'Il numero sembra incompleto o contiene caratteri non validi. Puoi riscriverlo esattamente come desideri essere ricontattato?'
        # Un quesito concreto conta come approfondimento: niente interrogatorio aggiuntivo.
        if result.intento in ('prezzi', 'prenotazione', 'medico', 'informazioni_clinica'):
            self.dati.setdefault('richiesta', testo)
        for campo, domanda in QUESTIONS.items():
            # L'approfondimento è facoltativo: un interesse già chiaro basta
            # per passare alla tempistica, senza far ripetere il servizio.
            if campo == 'richiesta':
                continue
            if not self.dati.get(campo):
                self.atteso = campo
                introduzione = risposta
                if not introduzione and campo == 'tempistica' and result.trattamento:
                    introduzione = ('Ho già annotato il tuo interesse per ' if prima.get('trattamento') == self.dati.get('trattamento') else 'Certo, raccolgo il tuo interesse per ') + self.dati['trattamento'] + '.'
                elif not introduzione and campo == 'nome' and result.tempistica:
                    introduzione = 'Va bene, tengo conto della tempistica che hai indicato.'
                    domanda = 'Come ti chiami, così posso associare la richiesta a te?'
                elif not introduzione and campo == 'telefono' and result.nome:
                    introduzione = 'Grazie, ' + self.dati['nome'] + '.'
                    domanda = 'Qual è il numero migliore per un eventuale ricontatto?'
                output = (introduzione + '\n' if introduzione else '') + domanda
                self.storia += [{'assistente': output}]
                return output
        self.consenso_chiesto = True
        self.atteso = 'consenso'
        # La domanda di consenso viene sempre inviata dal programma, mai presunta dal modello.
        riepilogo = f"Ho raccolto: {self.dati['nome']}, {self.dati['telefono']}, interesse per {self.dati['trattamento']}, tempistica: {self.dati['tempistica']}."
        output = (risposta + '\n' if risposta else '') + riepilogo + '\n' + CONSENT
        self.storia += [{'assistente': output}]
        return output

    def registra(self):
        if not self.consenso_chiesto or self.tool_usato or self.rifiutato:
            return 'Non è possibile registrare questa richiesta.'
        if any(not self.dati.get(k) for k in ('nome', 'telefono', 'trattamento', 'tempistica')):
            return 'Mancano alcuni dati: la richiesta non è stata registrata.'
        self.tool_usato = self.terminata = True
        try:
            self.writer.add_to_sheet(self.dati.copy(), consent=True)
        except Exception:
            return ('Grazie. Al momento non sono riuscito a verificare la registrazione della richiesta. '
                    'Controlla il collegamento Google Sheets e il foglio prima di riprovare: non effettuerò un secondo invio in questa conversazione.')
        self.salvato = True
        return (f"Grazie, {self.dati['nome']}. Ho registrato la tua richiesta per il personale della clinica. "
                'Hai altre domande? Puoi continuare qui, scrivere /nuovo per una nuova richiesta oppure esci per chiudere.')


def main():
    print('CLINICA DEMO SORRISO — dimostrazione, non una clinica reale.')
    print('Comandi: /nuovo per una nuova conversazione · esci per chiudere.')
    if not (BASE / 'google_sheets.json').exists():
        print('Google Sheets non ancora collegato: apri Collega-Google-Sheets.command per configurarlo.')
    chat = Conversazione()
    print('\nAssistente:', START)
    while True:
        try:
            testo = input('\nTu: ').strip()
            if testo.casefold() in ('esci', 'quit', 'bye'):
                print('Arrivederci!')
                return
            if testo == '/nuovo':
                chat = Conversazione()
                print('\nAssistente:', START)
                continue
            if testo.startswith('/domanda '):
                testo = testo[9:]
            print('Assistente:', chat.ricevi(testo), flush=True)
        except (EOFError, KeyboardInterrupt):
            print('\nArrivederci!')
            return
        except Exception:
            print('Non riesco a elaborare il messaggio. Verifica che Ollama sia aperto e riprova: nessun invio a Google è stato avviato per questo messaggio.')


if __name__ == '__main__':
    main()
