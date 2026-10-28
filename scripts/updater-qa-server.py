"""Isolated local TLS updater fixture; never a public update service.

Root must contain tls.pem/tls.key, package.exe/package.exe.sig and mode.txt.
Only these fixed routes exist. Bind loopback; the QA build trusts this CA only.
"""
import argparse
import base64
import http.server
import json
from pathlib import Path
import socket
import ssl
import time

parser = argparse.ArgumentParser()
parser.add_argument("root", type=Path)
args = parser.parse_args()
root = args.root.resolve(strict=True)


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        mode = (root / "mode.txt").read_text().strip()
        if self.path == "/latest.json":
            if mode == "current":
                self.send_response(204)
                self.end_headers()
                return
            if mode == "invalid":
                body = b"not json"
            else:
                signature = (root / "package.exe.sig").read_text().strip()
                if mode == "badsig":
                    signature = base64.b64encode(b"invalid signature").decode()
                if mode == "unsigned":
                    signature = ""
                url = "https://localhost/package.exe"
                if mode == "http":
                    url = "http://localhost/package.exe"
                if mode == "untrusted":
                    url = "https://example.invalid/package.exe"
                body = json.dumps({
                    "version": "0.8.2" if mode == "wrongversion" else "0.8.1",
                    "notes": "Isolated QA: signed launcher update. No game data.",
                    "platforms": {
                        "linux-x86_64" if mode == "wrongtarget" else "windows-x86_64": {
                            "url": url, "signature": signature,
                        }
                    },
                }).encode()
            if mode == "slowcheck":
                time.sleep(2)
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/package.exe":
            if mode == "redirect":
                self.send_response(302)
                self.send_header("Location", "http://localhost/package.exe")
                self.end_headers()
                return
            data = (root / "package.exe").read_bytes()
            self.send_response(200)
            self.send_header("Content-Length", str(300 * 1024 * 1024 if mode == "oversized" else len(data)))
            self.end_headers()
            if mode == "oversized":
                return
            if mode == "disconnect":
                self.wfile.write(data[:8192])
                self.wfile.flush()
                self.connection.shutdown(socket.SHUT_RDWR)
                return
            if mode == "tampered":
                data = data[:-1] + bytes([data[-1] ^ 1])
            try:
                for offset in range(0, len(data), 65536):
                    self.wfile.write(data[offset:offset+65536])
                    if mode == "slow":
                        time.sleep(.1)
            except (BrokenPipeError, ConnectionResetError, ssl.SSLError):
                pass
        else:
            self.send_error(404)


server = http.server.ThreadingHTTPServer(("127.0.0.1", 443), Handler)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(root / "tls.pem", root / "tls.key")
server.socket = context.wrap_socket(server.socket, server_side=True)
print("Isolated updater HTTPS fixture ready on loopback", flush=True)
server.serve_forever()
