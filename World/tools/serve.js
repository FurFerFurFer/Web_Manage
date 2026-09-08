'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const world = path.resolve(__dirname, '..');
const shared = new Map(['schema.js', 'calendar-core.js'].map(name => [
  '/track-core/' + name, path.resolve(world, '../scripts', name)
]));

// Only the game and two pure Track readers are exposed on this separate origin.
// No Track page, sync script, database export, or repository directory listing.
function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const route = decodeURIComponent(url.pathname);
      const allowed = route === '/' || route === '/index.html' ||
        /^\/(scripts|styles|vendor)\/[a-zA-Z0-9_./-]+$/.test(route);
      const file = shared.get(route) || (allowed ? path.resolve(world, '.' + (route === '/' ? '/index.html' : route)) : null);
      if (!file || (!shared.has(route) && !file.startsWith(world + path.sep))) {
        res.writeHead(404).end('Not found'); return;
      }
      const real = await fs.realpath(file);
      if (real !== file) { res.writeHead(403).end('Not available'); return; }
      const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.md':'text/plain'};
      const body = await fs.readFile(file);
      res.writeHead(200, {
        'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      });
      res.end(body);
    } catch { res.writeHead(404).end('Not found'); }
  });
}

function startServer(port = 8877) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
if (require.main === module) {
  const port = Number(process.argv[2] || 8877);
  startServer(port).then(server => {
    console.log('Track World demo: http://127.0.0.1:' + server.address().port);
    console.log('Synthetic data only. Press Ctrl+C to stop.');
    process.on('SIGINT', () => server.close(() => process.exit(0)));
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = {createServer, startServer};
