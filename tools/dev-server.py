from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "assets" / "targets" / "creature-targets.mind"
MAX_TARGET_BYTES = 20 * 1024 * 1024


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/__save-targets":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_TARGET_BYTES:
            self.send_error(413)
            return

        payload = self.rfile.read(length)
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        TARGET.write_bytes(payload)
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8001), Handler)
    print("Serving", ROOT, "at http://127.0.0.1:8001", flush=True)
    import os

    os.chdir(ROOT)
    server.serve_forever()
