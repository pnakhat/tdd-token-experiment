#!/usr/bin/env node
// Serves the generated report plus the raw data behind it.
//
//   node app/server.mjs [--port 4173]
//
// The report at app/public/index.html is fully self-contained — you can also just
// open it in a browser. The server exists so the underlying JSON is inspectable
// alongside it, which is the point of publishing a replication rather than a claim.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'app', 'public');

const portFlag = process.argv.indexOf('--port');
const PORT = portFlag !== -1 ? Number(process.argv[portFlag + 1]) : 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': TYPES['.json'],
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = url.pathname;

  if (route === '/api/summary') {
    const summary = readJson(path.join(ROOT, 'results', 'summary.json'));
    if (!summary) {
      return sendJson(res, 404, { error: 'No summary yet. Run: node harness/report.mjs' });
    }
    return sendJson(res, 200, summary);
  }

  if (route === '/api/trials') {
    const dir = path.join(ROOT, 'results', 'trials');
    if (!fs.existsSync(dir)) return sendJson(res, 404, { error: 'No trials yet.' });
    const trials = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson(path.join(dir, f)));
    return sendJson(res, 200, { count: trials.length, trials });
  }

  if (route.startsWith('/api/trial/')) {
    const id = route.slice('/api/trial/'.length);
    // Reject anything that isn't a bare run id, so the route can't walk the filesystem.
    if (!/^[a-z0-9_-]+$/i.test(id)) return sendJson(res, 400, { error: 'bad run id' });
    const trial = readJson(path.join(ROOT, 'results', 'trials', `${id}.json`));
    if (!trial) return sendJson(res, 404, { error: 'unknown run id' });
    return sendJson(res, 200, trial);
  }

  // Static: only ever serve out of app/public.
  const rel = route === '/' ? 'index.html' : route.replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Not found. Did you run: node harness/report.mjs');
  }

  const body = fs.readFileSync(file);
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'content-length': body.length,
  });
  res.end(body);
});

server.listen(PORT, () => {
  console.log(`Report:  http://localhost:${PORT}/`);
  console.log(`Summary: http://localhost:${PORT}/api/summary`);
  console.log(`Trials:  http://localhost:${PORT}/api/trials`);
});
