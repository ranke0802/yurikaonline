#!/usr/bin/env python3
"""Loopback-only local-mode preview. No authentication or production services."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, urlencode, unquote

ROOT = Path(__file__).resolve().parents[1]

class LocalHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Content-Security-Policy', "default-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; frame-src 'none'; object-src 'none'")
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        url = urlsplit(self.path)
        parts = Path(unquote(url.path)).parts
        target = (ROOT / unquote(url.path).lstrip('/')).resolve()
        if (not target.is_relative_to(ROOT) or any(p.startswith('.') for p in parts)
                or 'node_modules' in parts or url.path == '/src/js/firebaseConfig.js'):
            self.send_error(403, 'Not served by the isolated preview')
            return None
        if url.path in ('/', '/index.html') and parse_qs(url.query).get('local') != ['1']:
            query = parse_qs(url.query)
            query['local'] = ['1']
            self.send_response(302)
            self.send_header('Location', url.path + '?' + urlencode(query, doseq=True))
            self.end_headers()
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(403, 'Directory listing disabled')
        return None

if __name__ == '__main__':
    print('Isolated preview: http://127.0.0.1:8100/?local=1', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8100), LocalHandler).serve_forever()
