from runtime_config import LOGS
"""Dialogo libero guidato dal modello; dati e scritture controllati dal programma."""
import re
import os,json
from datetime import datetime,timezone
from pathlib import Path
from comprensione import interpreta, interpreta_seguito, Messaggio
from sheets_store import GoogleSheets
from fatti_demo import RISPOSTE
from tempistiche import normalizza,adesso
from core.lead_outbox import LeadOutbox
from dialogo import rispondi, verifica_consenso, Risposta

BASE = Path(__file__).resolve().parent
START = 'Ciao! 👋 Benvenuto da Clinica Demo Sorriso. Come posso aiutarti oggi?'
CONSENT = "Sei d'accordo a essere contattato dal personale della clinica al numero che hai indicato?"
FIELDS = ('trattamento','tempistica','nome','telefono')


def pulisci_trattamento(testo):
    # Solo rumore tipografico periferico: nessuna correzione dei recapiti.
    return re.sub(r'[+*=~]+(?=\s|$)', '', testo).strip()


def catalogo(testo):
    testo=pulisci_trattamento(testo)
    t=testo.casefold()
    if re.search(r'\bnon\b',t): return testo
    categories=[(r'sbiancament','Sbiancamento dentale'),(r'apparecchio|ortodon','Ortodonzia'),
        (r'allineator','Allineatori trasparenti'),(r'igiene|pulizia (?:dei )?denti','Igiene dentale'),
        (r'faccett','Faccette dentali'),(r'impiant|implantolog','Implantologia')]
    found=[label for pattern,label in categories if re.search(pattern,t)]
    if len(found)==1:return found[0]
    if len(found)>1:return testo
    return re.sub(r'^(?:per |vorrei |voglio |mi devo )+','',testo,flags=re.I).strip()


def telefono_valido(value):
    return bool(re.fullmatch(r'\+?[0-9 ()-]+',value)) and 7<=sum(c.isdigit() for c in value)<=15


def consenso_esplicito(testo):
    t=testo.casefold().strip(' .!')
    return t in ('sì','si','yes','yes please','sure','of course','certo','certamente','va bene',
        'ok','okay',"d'accordo",'d’accordo',"sono d'accordo",'sono d’accordo','nessun problema',
        'acconsento','potete ricontattarmi','potete chiamarmi','sì grazie','si grazie','volentieri')


class Conversazione:
    def __init__(self,writer=None,parser=None,responder=None,choice_checker=None,consent_checker=None):
        config_path=BASE/'config/azienda_demo.json'
        self.config=json.loads(config_path.read_text()) if config_path.exists() else {'timing_meaning':'contatto'}
        self.outbox=LeadOutbox() if writer is None else None
        self.delivery_id=None;self.evidenza_consenso='';self.origine='terminale'
        self.writer=writer if writer is not None else GoogleSheets()
        self.parser=parser or interpreta
        self.responder=responder or rispondi
        self.consent_checker=consent_checker or verifica_consenso
        self.originali={};self.dati={};self.modalita=''
        self.salvato_dati=None;self.riga=None;self.note=[];self.proposta_nota='';self.aggiornamento_incerto=False
        self.storia=[{'role':'assistant','content':START}]
        self.atteso='';self.consenso_chiesto=False
        self.salvato=False;self.terminata=False;self.tool_usato=False;self.rifiutato=False

    def _risposta(self,testo,answer):
        self.storia += [{'role':'user','content':testo},{'role':'assistant','content':str(answer)}]
        self.storia=self.storia[-32:]
        return str(answer)

    def _prossima(self):
        # Usata esclusivamente per verificare la completezza, non per ordinare domande.
        return next((k for k in FIELDS if not self.dati.get(k)),None)

    def ricevi(self,testo):
        testo=testo.strip()
        if not testo:return 'Sono qui, dimmi pure.'
        if len(testo)>2000:return 'Puoi dividere il messaggio in parti più brevi?'
        pending=self.consenso_chiesto and not self.terminata
        if pending and consenso_esplicito(testo):
            self.evidenza_consenso=testo
            return self._risposta(testo,self.registra())
        try:
            time_value=normalizza(testo) if self.atteso=='tempistica' and '?' not in testo else None
            if self.salvato and self.parser is interpreta:
                parsed=interpreta_seguito(testo,self.storia,self.salvato_dati,self.proposta_nota)
            elif time_value and ' — indicato il ' not in time_value:
                parsed=Messaggio.model_validate_json('{"intento":"dati"}');parsed.tempistica=testo
            elif self.atteso=='telefono' and telefono_valido(testo):
                parsed=Messaggio.model_validate_json('{"intento":"dati"}');parsed.telefono=testo
            else:parsed=self.parser(testo,self.dati.copy(),self.atteso,self.storia,pending,self.config.get('timing_meaning','contatto'))
        except Exception:
            return self._risposta(testo,'Non riesco a elaborare il messaggio in questo momento. Riprova tra poco: non ho avviato alcun salvataggio.')
        if self.salvato:
            if parsed.atto=='riepilogo':return self._risposta(testo,self.riepilogo_salvato())
            if self.proposta_nota and parsed.atto=='rifiuta':self.proposta_nota=''
            if self.proposta_nota and parsed.atto=='accetta':
                return self._risposta(testo,self.aggiungi_nota(self.proposta_nota))
            if parsed.nota and len(parsed.nota)<=300:
                self.proposta_nota=parsed.nota
                if parsed.atto=='aggiunta':return self._risposta(testo,self.aggiungi_nota(parsed.nota))
                return self._risposta(testo,'Non ho informazioni verificate su questo punto. Vuoi che aggiunga alla richiesta per la segreteria: «'+parsed.nota+'»?')
        # La negazione è relativa alla domanda corrente, mai un rifiuto globale implicito.
        refusal=parsed.rifiuto_dati and not parsed.domanda
        if pending and parsed.consenso=='negativo' and not parsed.domanda:refusal=True
        if self.atteso=='tempistica' and parsed.tempistica:refusal=False
        if refusal:self.rifiutato=True;self.consenso_chiesto=False
        if parsed.modalita and not self.terminata:
            self.modalita=parsed.modalita
            if self.modalita in ('visita','ricontatto') and not refusal:self.rifiutato=False
        before=self.dati.copy();invalid_phone=False
        if not self.terminata and not self.rifiutato and parsed.intento!='non_pertinente':
            for field in FIELDS:
                value=getattr(parsed,field)
                if not value or value not in testo or len(value)>300:continue
                if field=='telefono' and not telefono_valido(value):invalid_phone=True;continue
                # Il parser estrae solo affermazioni, anche accanto a una domanda.
                self.originali[field]=pulisci_trattamento(value) if field=='trattamento' else value
                self.dati[field]=catalogo(value) if field=='trattamento' else value
                if field=='tempistica':
                    resolved=normalizza(value)
                    if resolved is None:
                        self.dati.pop(field,None)
                    else:self.dati[field]=resolved
                if field=='tempistica' and self.atteso=='tempistica' and value.casefold().strip(' .!') in (
                    'no','non lo so','non saprei','boh','non ancora','ancora no','non ho idea',
                    'è da decidere','da decidere','non ho ancora deciso','non lo so dimmelo tu','non lo so, dimmelo tu'):
                    self.dati[field]='Da concordare'
        changed=[k for k in FIELDS if self.dati.get(k)!=before.get(k)]
        if changed:self.consenso_chiesto=False
        if pending and not changed and not refusal and not parsed.domanda:
            try:confirmed=self.consent_checker(testo,self.storia[-1]['content'])
            except Exception:confirmed=False
            if confirmed:
                self.evidenza_consenso=testo
                return self._risposta(testo,self.registra())
        if pending:self.consenso_chiesto=False
        # Una digressione interrompe il consenso pendente: un sì futuro non conferma
        # accidentalmente un'altra domanda. La richiesta verrà ripresentata nel contesto.
        if pending and parsed.domanda:self.consenso_chiesto=False
        missing=[k for k in FIELDS if not self.dati.get(k)]
        can_collect=not(self.terminata or self.rifiutato or self.modalita=='informazioni' or parsed.intento=='non_pertinente')
        state={'timing_meaning':self.config.get('timing_meaning','contatto'),'dati':self.dati.copy(),'originali':self.originali.copy(),'modalita':self.modalita,
            'salvato':self.salvato,'registrazione_tentata':self.tool_usato,'rifiutato':self.rifiutato,
            'campi_mancanti':missing,'raccolta_consentita':can_collect,
            'puo_chiedere_consenso':can_collect and not missing and parsed.consenso not in ('incerto','negativo'),
            'ultima_domanda':self.atteso,'nuovi_dati':changed,'domanda_del_paziente':parsed.domanda,
            'atto':parsed.atto,'proposta_nota':self.proposta_nota,'dati_registrati':self.salvato_dati,'note_registrate':self.note,'aggiornamento_incerto':self.aggiornamento_incerto,'ora_corrente':adesso().isoformat(),'intento':parsed.intento,'emozione':parsed.emozione,'numero_non_valido':invalid_phone}
        fallback='Sono qui per aiutarti con la tua richiesta.'
        if parsed.domanda:fallback=RISPOSTE.get({'privacy':'dati'}.get(parsed.intento,parsed.intento),'Questa informazione potrà essere chiarita dal personale della clinica.')
        if parsed.atto in ('ringrazia','saluta'):fallback='Grazie a te, buona giornata.'
        elif parsed.atto=='accetta':fallback='Va bene, resto a disposizione.'
        if self.salvato and self.proposta_nota:fallback='Non ho informazioni verificate su questo punto. Vuoi che aggiunga alla tua richiesta la domanda «'+self.proposta_nota+'»?'
        if refusal:fallback='Nessun problema, non registrerò il contatto. Possiamo continuare qui con le tue domande.'
        if invalid_phone:fallback='Non riesco a leggere il numero. Puoi riscriverlo completo?'
        if state['puo_chiedere_consenso'] and not parsed.domanda and parsed.emozione=='neutra':
            fallback=Risposta('Ti riassumo la richiesta prima di proseguire.',richiedi_consenso=True)
        if state['puo_chiedere_consenso'] and not parsed.domanda and parsed.emozione=='neutra':
            answer=fallback
        else:
            try:answer=self.responder(testo,self.storia,state,fallback)
            except Exception:answer=fallback
        field=getattr(answer,'campo_richiesto','')
        self.atteso=field if can_collect and field in missing else ''
        if getattr(answer,'richiedi_consenso',False) and state['puo_chiedere_consenso']:
            self.atteso='consenso';self.consenso_chiesto=True
            data=self.payload()
            summary='\n'.join(('Nome: '+data['nome'],'Telefono: '+data['telefono'],'Trattamento: '+data['trattamento'],('Preferenza per il contatto: ' if self.config.get('timing_meaning')=='contatto' else 'Tempistica del servizio: ')+data['tempistica']))
            return self._risposta(testo,str(answer)+'\n'+summary+'\n'+CONSENT)
        # Solo la domanda effettivamente mostrata può essere il referente di un sì.
        if pending and not self.consenso_chiesto:self.atteso=''
        return self._risposta(testo,answer)

    def payload(self):
        data=self.dati.copy()
        if data.get('trattamento')=='Ortodonzia':data['trattamento']='Ortodonzia — interesse per apparecchio ortodontico'
        if self.modalita=='visita':data['trattamento']+=' — richiesta di visita'
        return data

    def riepilogo_salvato(self):
        d=self.salvato_dati
        if not d:return 'Non ho una registrazione confermata da riepilogare.'
        return '\n'.join(('Per la segreteria risultano registrati:', 'Nome: '+d['nome'],
            'Telefono: '+d['telefono'],'Trattamento e richieste: '+d['trattamento'],
            'Preferenza per il contatto: '+d['tempistica'],'Consenso al contatto: sì'))

    def aggiungi_nota(self,nota):
        if nota in self.note:
            self.proposta_nota='';return 'Questa informazione è già inclusa nella tua richiesta.'
        if self.aggiornamento_incerto:return 'Non posso confermare l’aggiunta in questo momento. Puoi chiedere questa informazione direttamente al personale.'
        updated=self.salvato_dati.copy();updated['trattamento']+=' — Informazione aggiuntiva: '+nota
        try:self.writer.update_request(self.riga,self.salvato_dati,updated)
        except Exception:
            self.aggiornamento_incerto=True;self.proposta_nota=''
            return 'Al momento non riesco a confermare l’aggiunta alla richiesta. Puoi chiedere questa informazione direttamente al personale.'
        self.salvato_dati=updated;self.note.append(nota);self.proposta_nota=''
        return 'Ho aggiunto alla richiesta per la segreteria: '+nota+'. Posso aiutarti con altro?'

    def registra(self):
        if not self.consenso_chiesto or self.tool_usato or self.rifiutato or self._prossima():
            return 'La richiesta non è pronta per essere registrata.'
        self.tool_usato=self.terminata=True;self.consenso_chiesto=False
        try:
            if self.outbox:
                self.delivery_id=self.outbox.prepare(self.config.get('company_id','clinica-demo-sorriso'),self.origine,self.payload(),self.evidenza_consenso)
                self.outbox.mark(self.delivery_id,'delivering')
            self.riga=self.writer.add_to_sheet(self.payload(),consent=True)
            if self.outbox:self.outbox.mark(self.delivery_id,'confirmed',self.riga)
        except Exception as error:
            if self.outbox and self.delivery_id:
                try:self.outbox.mark(self.delivery_id,'uncertain',error_type=type(error).__name__)
                except Exception:pass
            # Diagnostica riservata, senza nome, telefono, token o contenuto HTTP.
            try:
                (LOGS).mkdir(mode=0o700,exist_ok=True)
                fd=os.open(LOGS/'diagnostica.log',os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600)
                with os.fdopen(fd,'a') as log:
                    log.write(json.dumps({'ora':datetime.now(timezone.utc).isoformat(),'evento':'salvataggio_non_confermato','tipo':type(error).__name__,'http':getattr(error,'code',None)})+'\n')
            except Exception:pass
            return 'Al momento non riesco a confermare la registrazione della tua richiesta. Mi dispiace per l’inconveniente; puoi contattare direttamente il personale della clinica.'
        self.salvato=True;self.salvato_dati=self.payload().copy()
        return 'Grazie, '+self.dati['nome']+'. Ho registrato la tua richiesta per il personale della clinica. Se hai altre domande, sono qui.'


def main():
    chat=Conversazione();print('\nAssistente:',START)
    while True:
        try:
            text=input('\nTu: ').strip()
            if text.casefold() in ('esci','quit','bye'):print('Arrivederci!');return
            if text=='/nuovo':chat=Conversazione();print('\nAssistente:',START);continue
            print('Un momento…',flush=True)
            print('Assistente:',chat.ricevi(text),flush=True)
        except (EOFError,KeyboardInterrupt):print('\nArrivederci!');return

if __name__=='__main__':main()
