"""Single local application lifecycle; imports do not start workers or touch DB."""
import threading
from runtime_config import WORKERS,require_local_runtime
from . import store,mail,subscriptions
_lock=threading.Lock();_stop=None;_threads=[];_started=False

def start():
 global _stop,_threads,_started
 require_local_runtime()
 with _lock:
  if _started:return
  store.init();_stop=threading.Event()
  if WORKERS:_threads=[mail.start(_stop),subscriptions.start_worker(_stop)]
  _started=True

def stop():
 global _started,_threads,_stop
 with _lock:
  if _stop:_stop.set()
  for thread in _threads:thread.join(timeout=25)
  # Do not allow a second set of workers if an external delivery is still stopping.
  if any(thread.is_alive() for thread in _threads):return
  _threads=[];_stop=None;_started=False
