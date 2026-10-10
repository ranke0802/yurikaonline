#!/usr/bin/env python3
"""Serve only this offline bundle on loopback. No external packages or network clients."""
import argparse
import hashlib
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT / 'contents-manifest.json').read_text(encoding='utf-8'))
CSP = MANIFEST['contentSecurityPolicy']
PUBLIC = set(MANIFEST['publicPaths'])

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        super().end_headers()

    def send_head(self):
        host = urlsplit('http://' + self.headers.get('Host', '')).hostname
        if host not in ('127.0.0.1', 'localhost', '::1'):
            self.send_error(403, 'Loopback host required'); return None
        request_path = unquote(urlsplit(self.path).path)
        if request_path == '/': request_path = '/index.html'
        relative = request_path.lstrip('/')
        target = (ROOT / relative).resolve()
        if not target.is_relative_to(ROOT) or relative not in PUBLIC or not target.is_file():
            self.send_error(404, 'Not included in the offline test'); return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404, 'Directory listing disabled'); return None

def verify():
    for entry in MANIFEST['files']:
        target = ROOT / entry['path']
        if not target.is_file() or target.stat().st_size != entry['bytes'] or hashlib.sha256(target.read_bytes()).hexdigest() != entry['sha256']:
            raise SystemExit('Bundle verification failed: ' + entry['path'])
    print(f"Verified {len(MANIFEST['files'])} offline bundle files", flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8183)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    verify()
    if not args.verify_only:
        print(f'Offline test: http://127.0.0.1:{args.port}/ — Ctrl+C to stop', flush=True)
        ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
