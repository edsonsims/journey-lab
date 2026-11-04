#!/usr/bin/env python3
"""Serve the local film with byte ranges so native players can seek."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1] / 'outputs/hackathon-film-v1'


class FilmHandler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.send_file(head=True)

    def do_GET(self):
        self.send_file()

    def send_file(self, head=False):
        request_path = unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
        path = (ROOT / request_path).resolve()
        if not path.is_relative_to(ROOT.resolve()) or not path.is_file():
            self.send_error(404)
            return
        size = path.stat().st_size
        start, end = 0, size - 1
        range_header = self.headers.get('Range')
        if range_header:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', range_header.strip())
            if not match or not any(match.groups()) or size == 0:
                self.reject_range(size)
                return
            first, last = match.groups()
            if first:
                start = int(first)
                end = min(int(last), size-1) if last else size-1
            else:
                suffix = int(last)
                if suffix == 0:
                    self.reject_range(size)
                    return
                start = max(0, size-suffix)
            if start >= size or start > end:
                self.reject_range(size)
                return
        self.send_response(206 if range_header else 200)
        self.send_header('Content-Type', 'text/vtt; charset=utf-8' if path.suffix == '.vtt'
                         else mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(end-start+1))
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if range_header:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        if head:
            return
        try:
            with path.open('rb') as stream:
                stream.seek(start)
                remaining = end-start+1
                while remaining:
                    chunk = stream.read(min(1024*1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # Media players cancel a range when the user seeks elsewhere.

    def reject_range(self, size):
        self.send_response(416)
        self.send_header('Content-Range', f'bytes */{size}')
        self.send_header('Content-Length', '0')
        self.end_headers()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4328)
    parser.add_argument('--cut', choices=['v1', 'v2'], default='v1')
    args = parser.parse_args()
    ROOT = Path(__file__).resolve().parents[1] / f'outputs/hackathon-film-{args.cut}'
    server = ThreadingHTTPServer(('127.0.0.1', args.port), FilmHandler)
    print(f'Journey Lab film: http://127.0.0.1:{args.port}/', flush=True)
    server.serve_forever()
