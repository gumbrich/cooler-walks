import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Local verification of this project's static files and Netlify-style headers.
// Not a substitute for testing the deployed provider's routing, TLS and CDN.
const root = path.resolve('dist');
const rules = [];
for (const line of fs.readFileSync(path.join(root, '_headers'), 'utf8').split('\n')) {
  if (line.startsWith('/'))
    rules.push({
      pattern: new RegExp(
        '^' + line.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*') + '$',
      ),
      headers: {},
    });
  else if (/^\s+\S+:/.test(line)) {
    const colon = line.indexOf(':');
    rules.at(-1).headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
}
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.geojson': 'application/geo+json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  for (const rule of rules)
    if (rule.pattern.test(pathname))
      for (const [key, value] of Object.entries(rule.headers)) res.setHeader(key, value);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    res.writeHead(405).end();
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (['/privacy', '/support'].includes(pathname)) {
    res.writeHead(301, { Location: pathname + '/' }).end();
    return;
  }
  let file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) && file !== root) {
    res.writeHead(403).end();
    return;
  }
  if (path.basename(file).startsWith('_')) {
    res.writeHead(404).end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  let status = 200;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    file = path.join(root, '404.html');
    status = 404;
  }
  res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
  res.setHeader('Content-Length', fs.statSync(file).size);
  res.writeHead(status);
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(file).pipe(res);
});
server.listen(4181, '127.0.0.1', () =>
  console.log('Release preview with headers: http://127.0.0.1:4181/'),
);
