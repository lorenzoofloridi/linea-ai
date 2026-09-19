from http.server import BaseHTTPRequestHandler, HTTPServer
import json

from bot_core import Conversazione


chat = Conversazione()


class ChatHandler(BaseHTTPRequestHandler):

    def aggiungi_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self.aggiungi_headers()
        self.end_headers()

    def do_POST(self):
        if self.path != "/chat":
            self.send_response(404)
            self.end_headers()
            return

        try:
            lunghezza = int(self.headers.get("Content-Length", 0))
            corpo = self.rfile.read(lunghezza)

            dati = json.loads(corpo.decode("utf-8"))
            messaggio = dati.get("message", "").strip()

            if not messaggio:
                risposta = "Scrivi un messaggio."
            else:
                risposta = chat.ricevi(messaggio)

            risultato = json.dumps(
                {"reply": risposta},
                ensure_ascii=False
            ).encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(risultato)))
            self.aggiungi_headers()
            self.end_headers()

            self.wfile.write(risultato)

        except Exception as errore:
            print("ERRORE:", errore)

            risultato = json.dumps({
                "reply": "Si è verificato un errore nel collegamento con l'assistente."
            }).encode("utf-8")

            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.aggiungi_headers()
            self.end_headers()

            self.wfile.write(risultato)


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 5000), ChatHandler)

    print("")
    print("===================================")
    print(" CHATBOT AI ATTIVO")
    print(" http://127.0.0.1:5000")
    print("===================================")
    print("")
    print("Lascia questa finestra aperta.")
    print("Per spegnere il chatbot premi Control + C.")
    print("")

    server.serve_forever()