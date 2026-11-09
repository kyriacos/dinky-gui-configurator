#!/usr/bin/env python3
"""Serve the preview and read or write ~/.config/dinky/dinky.toml."""

import datetime
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = Path.home() / ".config" / "dinky" / "dinky.toml"
HOST = "127.0.0.1"
PORT = 8766
MAX_BYTES = 400_000


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/config":
            self.send_config()
            return
        if path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/config":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > MAX_BYTES:
            self.respond(400, {"error": "Config is empty or too large."})
            return
        try:
            text = self.rfile.read(length).decode("utf-8")
        except UnicodeDecodeError:
            self.respond(400, {"error": "Config is not UTF-8."})
            return
        if "\x00" in text or "[mode." not in text and "workspaces" not in text:
            self.respond(400, {"error": "That doesn't look like a dinky config."})
            return
        try:
            CONFIG.parent.mkdir(parents=True, exist_ok=True)
            backup = None
            if CONFIG.exists():
                stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
                backup = CONFIG.with_name(f"dinky.toml.bak-preview-{stamp}")
                backup.write_bytes(CONFIG.read_bytes())
            CONFIG.write_text(text, encoding="utf-8")
        except OSError as error:
            self.respond(500, {"error": str(error)})
            return
        self.respond(200, {"ok": True, "path": str(CONFIG), "backup": str(backup) if backup else None})

    def send_config(self):
        if not CONFIG.exists():
            self.respond(200, {"path": str(CONFIG), "missing": True, "toml": None})
            return
        try:
            text = CONFIG.read_text(encoding="utf-8")
        except OSError as error:
            self.respond(500, {"error": str(error)})
            return
        self.respond(200, {"path": str(CONFIG), "missing": False, "toml": text})

    def respond(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Dinky preview at http://{HOST}:{PORT}")
    print(f"Config file: {CONFIG}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
