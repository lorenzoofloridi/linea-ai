"""Dialogo semantico locale: il modello comprende, il programma controlla gli invii."""
import re
from pathlib import Path
import llm_locale as ollama
from comprensione import interpreta
from sheets_store import GoogleSheets
from fatti_demo import RISPOSTE

BASE = Path(__file__).resolve().parent
START = 'Ciao! 👋 Benvenuto da Clinica Demo Sorriso. Come posso aiutarti oggi?'
CONSENT = "Sei d'accordo a essere ricontattato dal personale della clinica al numero che hai indicato?"
FIELDS = ('trattamento','tempistica','nome','telefono')
QUESTIONS = {
 'trattamento': ('Su quale esigenza dentale vorresti informazioni?', 'Mi racconti in poche parole per cosa cerchi informazioni?'),
 'tempistica': ('Hai già in mente quando vorresti occupartene, oppure è ancora da decidere?', 'Quando pensavi di procedere? Va bene anche una tempistica indicativa.'),
 'nome': ('Come ti chiami, così posso associare la richiesta a te?', 'Posso chiederti il tuo nome per la richiesta?'),
 'telefono': ('Qual è il numero migliore per un eventuale ricontatto?', 'A quale numero vorresti essere ricontattato, se decidi di lasciare la richiesta?'),
}


def catalogo(testo):
    """Categorie esplicite note; richieste non riconducibili restano aperte e leggibili."""
    t=testo.casefold()
    if re.search(r'\bnon\b',t): return testo
    categories=[(r'sbiancament','Sbiancamento dentale'),
                (r'apparecchio|ortodon','Ortodonzia'),
                (r'allineator','Allineatori trasparenti'),
                (r'igiene|pulizia (?:dei )?denti','Igiene dentale'),
                (r'faccett','Faccette dentali'),
                (r'impiant|implantolog','Implantologia')]
    found=[label for pattern,label in categories if re.search(pattern,t)]
    if len(found)==1: return found[0]
    if len(found)>1: return testo
    return re.sub(r'^(?:per |vorrei |voglio |mi devo )+', '',testo,flags=re.I).strip()


def telefono_valido(value):
    return bool(re.fullmatch(r'\+?[0-9 ()-]+',value)) and 7 <= sum(c.isdigit() for c in value) <= 15


def consenso_esplicito(testo):
    t=testo.casefold().strip(' .!')
    if '?' in t or re.search(r'\b(se|forse|ignora|fingi|ipoteticamente|non)\b',t):
        return False
    return bool(re.fullmatch(
        r'(?:s[iì](?:[, ]+(?:grazie|certo|volentieri|va bene|potete (?:chiamarmi|ricontattarmi)))?|'
        r'yes|yes please|sure|of course|va bene|certo|certamente|ok|okay|d’accordo|d\x27accordo|acconsento|'
        r'(?:potete|puoi) (?:chiamarmi|ricontattarmi|telefonarmi)(?: pure)?|'
        r'(?:chiamatemi|ricontattatemi|contattatemi)(?: pure)?|autorizzo (?:il ricontatto|a chiamarmi))',t))


def sociale(testo,storia):
    """Spazio alla conversazione senza affidare al generatore dati o prenotazioni."""
    try:
        result=ollama.Client(host='http://127.0.0.1:11434',timeout=60).chat(
            model='qwen2.5:7b',messages=[{'role':'system','content':
                'COMPITO: SOLO RISPOSTA SOCIALE. Questa è una demo, non esiste personale reale. '
                'Sei un assistente virtuale, non umano, di una demo odontoiatrica. '
                'Rispondi in italiano in una o due frasi cordiali alla parte sociale del messaggio. '
                'Ascolta senza giudicare. Non inventare esperienze personali. Non fare domande: '
                'il programma ne aggiunge una. Non fornire informazioni mediche, rassicurazioni '
                'cliniche, prezzi, orari, disponibilità, né affermare azioni, salvataggi o contatti avvenuti. '
                'Non congedare il paziente, non dire buona giornata se non saluta. Non offrire supporto illimitato. '
                'Non parlare di nostri dottori, nostra clinica, consulenze, incontri o personale: sei solo una dimostrazione. Non promettere aiuto clinico. Se si chiede chi sei, sei un assistente virtuale.'},
                *storia[-4:],{'role':'user','content':testo}],
            options={'temperature':0.35,'num_predict':100})
        answer=(result.message.content or '').strip()
        if answer and not re.search(r'\d|\?|prenotat|registrat|salvat|inviat|farmac|garant|indolore|nostr[ai]|dottor|pianific|consulenz',answer,re.I):
            return answer
    except Exception:
        pass
    return 'Ti ascolto, possiamo procedere con calma.'


class Conversazione:
    def __init__(self,writer=None,parser=None,social_writer=None):
        self.writer=writer if writer is not None else GoogleSheets()
        self.parser=parser or interpreta
        self.social_writer=social_writer or sociale
        self.dati={}
        self.modalita=''
        self.storia=[{'role':'assistant','content':START}]
        self.atteso='trattamento'
        self.consenso_chiesto=False
        self.salvato=False
        self.terminata=False
        self.tool_usato=False
        self.rifiutato=False
        self.contatori={k:0 for k in FIELDS}

    def _risposta(self,testo,answer):
        self.storia += [{'role':'user','content':testo},{'role':'assistant','content':answer}]
        self.storia=self.storia[-16:]
        return answer

    def _prossima(self):
        return next((k for k in FIELDS if not self.dati.get(k)),None)

    def ricevi(self,testo):
        testo=testo.strip()
        if not testo: return 'Sono qui, dimmi pure.'
        if re.fullmatch(r'ciao|buongiorno|buonasera|salve|buondì',testo.casefold().strip(' .!')):
            return self._risposta(testo,'Ciao! Dimmi pure, ti ascolto.')
        if testo.casefold().strip(' .!') in ('non lo so','non saprei') and self.atteso in ('trattamento','modalita'):
            return self._risposta(testo,'Nessun problema, possiamo chiarire prima i tuoi dubbi. Che cosa vorresti capire meglio?')
        if len(testo)>2000: return 'Puoi dividere il messaggio in parti più brevi?'
        if self.terminata and testo.casefold().strip(' .!') in ('sì','si','ok','grazie','va bene'):
            return self._risposta(testo,'Grazie a te. Puoi farmi altre domande oppure scrivere /nuovo per iniziare una nuova richiesta.')
        if self.consenso_chiesto and not self.terminata and consenso_esplicito(testo):
            return self._risposta(testo,self.registra())
        try:
            parsed=self.parser(testo,self.dati.copy(),self.atteso,self.storia,self.consenso_chiesto)
        except Exception:
            return 'Non riesco a elaborare il messaggio in questo momento. Verifica che Ollama sia aperto e riprova: non ho avviato alcun salvataggio.'
        if not self.terminata and (parsed.rifiuto_dati or (self.consenso_chiesto and parsed.consenso=='negativo')):
            self.dati.clear(); self.terminata=True; self.rifiutato=True
            return self._risposta(testo,'Va bene, rispetto la tua scelta e non registrerò il contatto. Se hai altre domande posso comunque aiutarti.')
        if parsed.intento=='non_pertinente':
            self.dati.clear(); self.terminata=True; self.rifiutato=True
            return self._risposta(testo,'Grazie per il messaggio. Questa demo segue le richieste dei potenziali pazienti e non gestisce candidature o proposte commerciali.')
        if not self.terminata and parsed.modalita:
            self.modalita=parsed.modalita
        prima=self.dati.copy()
        errore_telefono=False
        if not self.terminata:
            for field in FIELDS:
                value=getattr(parsed,field)
                if not value or value not in testo or len(value)>300: continue
                if field=='telefono' and not telefono_valido(value):
                    errore_telefono=True; continue
                # Domande possono nominare un trattamento ma non equivalgono
                # a fornire nome/numero/tempistica: richiedi un'affermazione.
                if parsed.domanda and field in ('nome','telefono','tempistica'): continue
                self.dati[field]=catalogo(value) if field=='trattamento' else value
        cambiati=[k for k in FIELDS if self.dati.get(k)!=prima.get(k)]
        if self.consenso_chiesto and not self.terminata:
            if not cambiati and consenso_esplicito(testo):
                return self._risposta(testo,self.registra())
            if cambiati:
                self.consenso_chiesto=False  # La conferma precedente non copre una correzione.
        intent_key={'privacy':'dati'}.get(parsed.intento,parsed.intento)
        if parsed.intento=='sociale':
            apertura=self.social_writer(testo,self.storia)
        elif parsed.intento in ('servizi','prezzi','orari','sede','prenotazione','medico','privacy','identita','sconosciuto'):
            apertura=RISPOSTE.get(intent_key,RISPOSTE['sconosciuto'])
        elif 'trattamento' in cambiati:
            apertura='Ho capito, raccolgo la tua richiesta per «'+self.dati['trattamento']+'».'
        elif 'tempistica' in cambiati:
            apertura='Va bene, tengo come riferimento «'+self.dati['tempistica']+'».'
        elif 'nome' in cambiati:
            apertura='Grazie, '+self.dati['nome']+'.'
        elif parsed.modalita:
            apertura={'visita':'Posso raccogliere la richiesta di una visita; data e disponibilità dovranno essere confermate dal personale.', 'ricontatto':'Possiamo preparare una richiesta di ricontatto per chiarire i tuoi dubbi.', 'informazioni':'Certo, continuiamo qui.'}[parsed.modalita]
        elif 'telefono' in cambiati:
            apertura='Grazie, ti mostro i dati prima di procedere.'
        else:
            apertura='Non sono sicuro di aver capito: puoi spiegarmi meglio cosa intendi?'
        if parsed.emozione=='paura' and parsed.intento!='sociale':
            apertura='Capisco che possa metterti a disagio; possiamo procedere con calma. '+apertura
        if self.terminata:
            return self._risposta(testo,apertura)
        if errore_telefono:
            return self._risposta(testo,'Non riesco a leggere il numero: puoi riscriverlo completo, senza aggiungere altre informazioni?')
        if not self.modalita and self.dati.get('trattamento'):
            self.atteso='modalita'
            return self._risposta(testo,apertura+'\nPreferisci chiedere una visita oppure essere ricontattato per chiarimenti? Possiamo anche continuare con le tue domande qui.')
        if self.modalita=='informazioni':
            return self._risposta(testo,apertura+' Possiamo continuare qui senza raccogliere i tuoi recapiti. Che cosa vorresti chiarire?')
        prossimo=self._prossima()
        if prossimo:
            self.atteso=prossimo
            # In una parentesi sociale non ripetere subito lo stesso campo.
            if parsed.intento=='sociale' and not cambiati and self.contatori[prossimo]>0:
                return self._risposta(testo,apertura+' Quando te la senti, possiamo riprendere la richiesta di ricontatto.')
            count=self.contatori[prossimo]
            domanda=QUESTIONS[prossimo][count % len(QUESTIONS[prossimo])]
            if count and not cambiati and parsed.intento=='dati' and not parsed.modalita:
                domanda=QUESTIONS[prossimo][count % len(QUESTIONS[prossimo])]
            self.contatori[prossimo]+=1
            return self._risposta(testo,apertura+'\n'+domanda)
        self.atteso='consenso'; self.consenso_chiesto=True
        riepilogo='Riepilogo ('+self.modalita+'): '+ '; '.join(self.dati[k] for k in ('nome','telefono','trattamento','tempistica'))+'.'
        return self._risposta(testo,apertura+'\n'+riepilogo+'\n'+CONSENT)

    def registra(self):
        if not self.consenso_chiesto or self.tool_usato or self.rifiutato or self._prossima():
            return 'La richiesta non è pronta per essere registrata.'
        self.tool_usato=self.terminata=True
        self.consenso_chiesto=False
        try:
            payload=self.dati.copy()
            if self.modalita=='visita':
                payload['trattamento'] += ' — richiesta di visita'
            self.writer.add_to_sheet(payload,consent=True)
        except Exception:
            return 'Non sono riuscito a verificare la registrazione. Controlla il foglio prima di riprovare: non effettuerò un secondo invio in questa conversazione.'
        self.salvato=True
        return ('Grazie, '+self.dati['nome']+'. Ho registrato la tua richiesta per il personale della clinica. '
                'Hai altre domande? Sono qui; puoi anche scrivere esci per chiudere.')


def main():
    print('CLINICA DEMO SORRISO — dialogo semantico, revisione 4 — clinica dimostrativa.')
    print('Comandi: /nuovo per ricominciare · esci per chiudere. Il modello elabora ogni messaggio sul Mac.')
    chat=Conversazione()
    print('\nAssistente:',START)
    while True:
        try:
            text=input('\nTu: ').strip()
            if text.casefold() in ('esci','quit','bye'): print('Arrivederci!'); return
            if text=='/nuovo': chat=Conversazione(); print('\nAssistente:',START); continue
            print('Assistente:',chat.ricevi(text),flush=True)
        except (EOFError,KeyboardInterrupt): print('\nArrivederci!'); return

if __name__=='__main__': main()
