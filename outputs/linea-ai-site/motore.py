"""Nuove conversazioni usano una fotografia aggiornata dei file condivisi dell'AI."""
import hashlib
import importlib.util
import sys
import threading
from pathlib import Path
BASE=Path(__file__).resolve().parent.parent/'mio-agente-ai'
MODULES=('tempistiche','llm_locale','fatti_demo','comprensione','dialogo','bot_core')
LOCK=threading.Lock()
_cached=None
_signature=None

def nuova_conversazione():
    global _cached,_signature
    with LOCK:
        sources={name:(BASE/(name+'.py')).read_bytes() for name in MODULES}
        signature=hashlib.sha256(b''.join(sources.values())).hexdigest()
        if signature!=_signature:
            previous={name:sys.modules.get(name) for name in MODULES}
            try:
                for name,source in sources.items():
                    spec=importlib.util.spec_from_file_location(name,BASE/(name+'.py'))
                    module=importlib.util.module_from_spec(spec)
                    sys.modules[name]=module
                    exec(compile(source,str(BASE/(name+'.py')),'exec'),module.__dict__)
                factory=sys.modules['bot_core'].Conversazione
            finally:
                for name,module in previous.items():
                    if module is None:sys.modules.pop(name,None)
                    else:sys.modules[name]=module
            _cached=factory;_signature=signature
        chat=_cached();chat.origine='webchat';return chat
