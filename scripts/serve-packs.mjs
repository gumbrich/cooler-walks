import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Local testing only. Production packs belong on an HTTPS static host with CORS.
const catalog = JSON.parse(fs.readFileSync('public/packs/catalog.json', 'utf8'));
const allowed = new Set(catalog.map((area) => `/packs/${area.file}`));
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  response.setHeader('Access-Control-Allow-Origin', '*'); // public, credential-free data
  if (!['GET', 'HEAD'].includes(request.method) || !allowed.has(url.pathname)) {
    response.writeHead(404);
    response.end();
    return;
  }
  const file = path.join('public', url.pathname);
  response.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': fs.statSync(file).size,
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  if (request.method === 'HEAD') response.end();
  else fs.createReadStream(file).pipe(response);
});
server.listen(4180, '127.0.0.1', () =>
  console.log('Local area downloads: http://localhost:4180/packs/'),
);
