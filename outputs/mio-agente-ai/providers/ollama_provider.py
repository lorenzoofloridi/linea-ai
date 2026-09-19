"""Adattatore Ollama: configurazione centralizzata e metriche senza ragionamenti interni."""
import json,time
from contextvars import ContextVar
from pathlib import Path
from types import SimpleNamespace
from urllib.request import Request,urlopen
from contextlib import contextmanager
BASE=Path(__file__).resolve().parents[1]
_override=ContextVar('modello_test',default=None)
_metrics=ContextVar('metriche_test',default=None)

def settings():
    p=BASE/'config/modello.json'
    d=json.loads(p.read_text()) if p.exists() else {}
    if d.get('provider','ollama')!='ollama':raise ValueError('Provider non configurato')
    return d

def modello_attivo():return _override.get() or settings().get('model','qwen2.5:7b')

@contextmanager
def usa_modello(name):
    token=_override.set(name);stats=[];mt=_metrics.set(stats)
    try:yield stats
    finally:_metrics.reset(mt);_override.reset(token)

class Client:
    def __init__(self,host='http://127.0.0.1:11434',timeout=90):self.host=host.rstrip('/');self.timeout=timeout
    def chat(self,**kwargs):
        model=_override.get() or kwargs.get('model') or settings().get('model','qwen2.5:7b')
        kwargs['model']=model
        if model.startswith('qwen3:'):
            kwargs.setdefault('think',False)
        if model.startswith('gpt-oss'):
            kwargs['options']=dict(kwargs.get('options',{}))
            kwargs['options']['num_predict']=max(2048,kwargs['options'].get('num_predict',0))
        started=time.monotonic()
        request=Request(self.host+'/api/chat',data=json.dumps(dict(kwargs,stream=False,keep_alive='20m')).encode(),headers={'Content-Type':'application/json'})
        with urlopen(request,timeout=max(self.timeout,180) if model.startswith('gpt-oss') else self.timeout) as response:data=json.load(response)
        stats=_metrics.get()
        if stats is not None:stats.append({'seconds':time.monotonic()-started,**{k:data.get(k) for k in ('eval_count','eval_duration','prompt_eval_count','prompt_eval_duration','load_duration')}})
        content=data.get('message',{}).get('content')
        if not isinstance(content,str) or not content.strip():raise ValueError('Il modello non ha restituito una risposta finale valida')
        return SimpleNamespace(message=SimpleNamespace(content=content))
