#!/usr/bin/env python3
"""
Servidor local de desarrollo para Strumio.

Ventaja frente a `python -m http.server`: envía Cache-Control: no-store,
así el navegador nunca sirve JS/CSS antiguos (causa habitual de "no veo
los cambios" o "la app se queda en blanco").

Uso:
    python serve.py
    → http://127.0.0.1:9999/index.html
"""
import http.server
import os
import socketserver

PORT = 9999
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Silencioso: evita llenar la consola con cada petición.
        pass


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    os.chdir(ROOT)
    with ReusableTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Strumio en http://127.0.0.1:{PORT}/index.html  (Ctrl+C para parar)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido.")
