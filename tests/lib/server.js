/* ── tests/lib/server.js ───────────────────────────────────────────────────
   A static file server for the repository root, built on node:http alone.

   The pages must be served over http rather than opened as file:// URLs:
   localStorage on a file:// origin is per-file in some configurations, and the
   two-tab tests depend on both tabs sharing one origin so a write in one fires
   a `storage` event in the other.

   Binds 127.0.0.1 on an ephemeral port, so concurrent runs never collide and
   nothing is exposed off the machine.
*/
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function startServer(root = path.join(__dirname, '..', '..')) {
  const rootReal = fs.realpathSync(root);

  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch { res.writeHead(400).end('bad request'); return; }
    if (rel === '/') rel = '/index.html';

    // resolve, then refuse anything that escaped the root
    const file = path.join(rootReal, rel);
    if (!file.startsWith(rootReal + path.sep)) { res.writeHead(403).end('forbidden'); return; }

    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: ' + rel); return; }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      res.end(buf);
    });
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        origin: 'http://127.0.0.1:' + port,
        url: p => 'http://127.0.0.1:' + port + '/' + String(p).replace(/^\//, ''),
        close: () => new Promise(done => server.close(done))
      });
    });
  });
}

module.exports = { startServer };
