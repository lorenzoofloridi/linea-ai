"""HTTP application adapter, with explicit lazy startup for existing callers."""
from saas import lifecycle
from saas.api import handle as dispatch

def handle(request):
 lifecycle.start()
 return dispatch(request)
