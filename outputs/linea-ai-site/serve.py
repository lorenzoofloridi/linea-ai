"""Anteprima privata: serve solo file pubblici e inoltra le API al servizio locale."""
import json,os
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
BASE=Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(BASE/'dist'),**kw)
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Cache-Control','no-store')
        ancestors=getattr(self,'frame_ancestors',"'none'")
        self.send_header('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors "+ancestors+"; base-uri 'self'; form-action 'self'")
        for key,value in getattr(self,'extra_headers',[]):self.send_header(key,value)
        self.extra_headers=[]
        super().end_headers()
    def valid_origin(self):
        host=self.headers.get('Host','')
        return host==f'127.0.0.1:{self.server.server_port}' and self.headers.get('Origin',f'http://{host}' if self.command=='GET' else '')==f'http://{host}'
    def api(self):
        if not self.valid_origin():return self.send_error(403)
        try:
            import server_api
            code,body=server_api.handle(self)
        except ImportError:code,body=503,{'error':'La demo è in preparazione.'}
        except Exception:code,body=500,{'error':'Operazione non riuscita. Riprova tra poco.'}
        if isinstance(body,bytes):
            self.send_response(code);self.send_header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');self.send_header('Content-Disposition','attachment; filename="dati-azienda.xlsx"');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
        raw=json.dumps(body,ensure_ascii=False).encode();self.send_response(code)
        self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        if self.path.startswith('/api/'):return self.api()
        if not self.valid_origin():return self.send_error(403)
        if self.path.split('?')[0]=='/widget.html':
            from urllib.parse import urlsplit,parse_qs
            from saas import store,companies
            store.init()
            try:self.frame_ancestors=companies.installation_info(parse_qs(urlsplit(self.path).query).get('installation',[''])[0])['origin']
            except store.Missing:return self.send_error(404)
        if self.path.split('?')[0] in ('/dashboard.html','/attiva-piano.html','/account.html','/portafoglio.html','/supporto.html'):
            from saas.api import cookie
            from saas import store
            store.init()
            try:user=store.principal(cookie(self))
            except store.Unauthorized:
                self.send_response(302);self.send_header('Location','/login.html');self.end_headers();return
            if self.path.split('?')[0]=='/dashboard.html':
                from saas.subscriptions import access
                if not access(user):
                    self.send_response(302);self.send_header('Location','/#contatti');self.end_headers();return
        return super().do_GET()
    def do_POST(self):
        if not self.path.startswith('/api/'):return self.send_error(404)
        self.api()
    def log_message(self,*a):pass
if __name__=='__main__':
    os.umask(0o077)
    server=ThreadingHTTPServer(('127.0.0.1',8765),Handler)
    server.daemon_threads=True
    print('Anteprima privata: http://127.0.0.1:8765',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:server.server_close()
