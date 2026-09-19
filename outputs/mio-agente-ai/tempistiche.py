"""Preferenze ancorate all'ora italiana; nessuna promessa di disponibilità."""
import re
from datetime import datetime,timedelta,time
from zoneinfo import ZoneInfo
ZONE=ZoneInfo('Europe/Rome')
def adesso():return datetime.now(ZONE)
def normalizza(testo,now=None):
    now=(now or adesso()).astimezone(ZONE);raw=testo.strip();t=raw.casefold().strip(' .!')
    if t in ('no','non lo so','non saprei','boh','non ancora','non ho idea','da concordare','non lo so dimmelo tu','non lo so, dimmelo tu'):return 'Da concordare'
    if re.fullmatch(r'(?:anche |pure |già )?(?:adesso|ora|subito)|(?:il )?prima possibile|appena possibile',t):
        return 'Appena possibile — dal '+now.strftime('%d/%m/%Y %H:%M')+' (Europe/Rome)'
    day=None;hour=None;band=''
    for label in ('mattina','pomeriggio','sera'):
        if label in t:band=label
    iso=re.search(r'\b(\d{4}-\d{2}-\d{2})\b',t)
    numeric=re.search(r'\b(\d{1,2})/(\d{1,2})(?:/(\d{4}))?\b',t)
    try:
        if iso:day=datetime.strptime(iso[1],'%Y-%m-%d').date()
        elif numeric:day=datetime(int(numeric[3] or now.year),int(numeric[2]),int(numeric[1])).date()
        elif 'dopodomani' in t:day=(now+timedelta(days=2)).date()
        elif 'domani' in t:day=(now+timedelta(days=1)).date()
        elif 'oggi' in t:day=now.date()
        else:
            delta=re.search(r'\b(?:tra|fra) (\d+) (giorni?|settimane?|ore?)\b',t)
            if delta:
                n=int(delta[1]);unit=delta[2]
                d=now+timedelta(hours=n) if unit.startswith('or') else now+timedelta(days=n*(7 if unit.startswith('settiman') else 1))
                day=d.date()
                if unit.startswith('or'):hour=d.strftime('%H:%M')
            for i,name in enumerate(('lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica')):
                if name in t or name.replace('ì','i') in t:
                    n=(i-now.weekday())%7
                    if n==0 and 'prossim' in t:n=7
                    day=(now+timedelta(days=n)).date();break
        clock=re.search(r'(?:\balle?\s+|\bore\s+|\borario\s+)(\d{1,2})(?:[:.](\d{2}))?\b',t)
        if clock:
            hh=int(clock[1]);mm=int(clock[2] or 0)
            if hh>23 or mm>59:raise ValueError()
            hour=f'{hh:02d}:{mm:02d}'
        if not day and (band or hour):day=now.date()
        if day:
            if day<now.date():return None
            if hour and datetime.combine(day,time.fromisoformat(hour),ZONE)<now:return None
            if day==now.date() and band and now.hour>={'mattina':12,'pomeriggio':18,'sera':24}[band]:return None
            return day.strftime('%d/%m/%Y')+(' alle '+hour if hour else (' — '+band if band else ''))+' (Europe/Rome)'
    except (ValueError,OverflowError):return None
    # Conserva un riferimento temporale anche quando non è possibile risolvere
    # con certezza un'espressione aperta (es. dopo le ferie); non inventa una data.
    return raw+' — indicato il '+now.strftime('%d/%m/%Y %H:%M')+' (Europe/Rome)'
