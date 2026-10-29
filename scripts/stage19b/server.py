"""Fictional data only, fixed loopback HTTP. No CMS process or proxy."""
import hashlib, io, json, pathlib, random, time, zipfile
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
ROOT = pathlib.Path('C:/PORT/.local/stage19b')
OUT = pathlib.Path('C:/PORT/.local/evidence/stage19b')
ROOT.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_STORED) as z:
    z.writestr('README.txt', 'Fictional PORT QA fixture. No game content. Do not execute.\n')
    z.writestr('fiction/sample.bin', random.Random(19).randbytes(512 * 1024))
# Keep the exact fixture bytes across resumed sessions (ZIP timestamps otherwise vary).
DATA = (ROOT / 'fixture.zip').read_bytes() if (ROOT / 'fixture.zip').exists() else buf.getvalue()
SHA = hashlib.sha256(DATA).hexdigest()
(ROOT / 'fixture.zip').write_bytes(DATA)
(OUT / 'fixture.json').write_text(json.dumps({'size':len(DATA), 'sha256':SHA, 'files':['README.txt','fiction/sample.bin']}, indent=2))
if not (ROOT / 'scenario.json').exists(): (ROOT / 'scenario.json').write_text('{"mode":"slow"}')
PROJECT = {'id':'port-fixture', 'name':'PORT Fictional Download QA', 'gameIds':['fiction'], 'kind':'recompilation', 'lifecycle':'active', 'sourcePlatforms':['Xbox 360'], 'targetPlatforms':['windows'], 'summary':'Synthetic ZIP for local reliability tests only.'}
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        with (OUT / 'http.log').open('a', encoding='utf-8') as f: f.write(f'{time.time()} {fmt % args}\n')
    def do_GET(self):
        mode = json.loads((ROOT / 'scenario.json').read_text()).get('mode', 'success')
        path = self.path.split('?')[0]
        build = {'id':'fixture-build', 'projectId':'port-fixture', 'version':'1.0-test', 'os':'windows', 'arch':'x64', 'channel':'stable', 'availability':'available', 'review':'approved', 'url':'https://github.com/port-fixture/fiction/releases/download/v1/fixture.zip', 'size':len(DATA), 'sha256':'0'*64 if mode == 'bad-hash' else SHA}
        if path == '/v2/projects': body = {'schemaVersion':2, 'items':[PROJECT], 'total':1, 'nextCursor':None}
        elif path == '/v2/games': body = {'schemaVersion':2,'items':[{'id':'fiction','title':'Fictional QA'}], 'nextCursor':None}
        elif path == '/v2/projects/port-fixture/builds': body = {'schemaVersion':2,'projectId':'port-fixture','channel':'all','builds':[build]}
        elif path == '/v2/projects/port-fixture': body = {'schemaVersion':2,'project':PROJECT,'games':[{'id':'fiction','title':'Fictional QA'}],'builds':[build]}
        elif path == '/port-fixture/fiction/releases/download/v1/fixture.zip':
            if mode == 'http-error': self.send_error(503); return
            self.send_response(200); self.send_header('Content-Type','application/zip'); self.send_header('Content-Length',str(len(DATA))); self.end_headers()
            try:
                for pos in range(0,len(DATA),8192):
                    self.wfile.write(DATA[pos:pos+8192]); self.wfile.flush()
                    if mode == 'drop' and pos >= 32768: self.close_connection = True; return
                    if mode in ('slow','drop'): time.sleep(0.15)
            except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError): pass
            return
        else: self.send_error(404); return
        raw=json.dumps(body).encode()
        self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
ThreadingHTTPServer(('127.0.0.1',19219),Handler).serve_forever()
