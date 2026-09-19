"""Punto di ingresso della piattaforma multi-azienda locale."""
from saas import store,mail,subscriptions
from saas.api import handle
store.init()
mail.start()
subscriptions.start_worker()
