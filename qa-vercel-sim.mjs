/**
 * A static host that behaves like Vercel for a Vite static deployment:
 *   1. filesystem first - if the path maps to a real file in dist/, serve it
 *   2. otherwise apply the rewrites from vercel.json
 *   3. apply the headers from vercel.json
 * Used to validate the production build before it goes to a public URL.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const ROOT = process.argv[2] || '/home/claude/nurse-rush/dist';
const CONFIG = process.argv[3] || '/home/claude/nurse-rush/vercel.json';
const PORT = +(process.argv[4] || 4300);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

let cfg = {};
try { cfg = JSON.parse(await readFile(CONFIG, 'utf8')); } catch { /* none */ }
const rewrites = cfg.rewrites || [];
const headerRules = cfg.headers || [];

function matchSource(source, pathname) {
  // Vercel path-to-regexp subset: "/(.*)", "/assets/(.*)", ":param", literals.
  // Wildcards are swapped for placeholders FIRST, then the literal remainder
  // is escaped, then the placeholders become real regex.
  const WILD = '\u0000W\u0000';
  const SEG = '\u0000S\u0000';
  let s = source
    .replace(/\(\.\*\)/g, WILD)
    .replace(/:\w+\*/g, WILD)
    .replace(/\*/g, WILD)
    .replace(/:\w+/g, SEG);
  s = s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  s = s.split(WILD).join('.*').split(SEG).join('[^/]+');
  return new RegExp('^' + s + '$').test(pathname);
}

function headersFor(pathname) {
  const out = {};
  for (const rule of headerRules) {
    if (matchSource(rule.source, pathname)) {
      for (const h of rule.headers) out[h.key] = h.value;
    }
  }
  return out;
}

async function resolveFile(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidates = [join(ROOT, clean)];
  if (clean.endsWith('/')) candidates.push(join(ROOT, clean, 'index.html'));
  else candidates.push(join(ROOT, clean + '.html'));
  for (const c of candidates) {
    try {
      const s = await stat(c);
      if (s.isFile()) return c;
    } catch { /* next */ }
  }
  return null;
}

const log = [];

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pathname = url.pathname;

  // 1. filesystem first (this is what Vercel does before rewrites)
  let file = await resolveFile(pathname);
  let rewritten = false;

  // 2. rewrites
  if (!file) {
    for (const r of rewrites) {
      if (matchSource(r.source, pathname)) {
        file = await resolveFile(r.destination);
        rewritten = true;
        break;
      }
    }
  }

  if (!file) {
    log.push({ pathname, status: 404 });
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404');
    return;
  }

  const body = await readFile(file);
  const ext = extname(file);
  const hdrs = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': body.length,
    ...headersFor(pathname),
  };
  log.push({ pathname, status: 200, served: file.replace(ROOT, ''), rewritten, cache: hdrs['Cache-Control'] || hdrs['cache-control'] || null });
  res.writeHead(200, hdrs);
  res.end(body);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`vercel-sim serving ${ROOT} on http://127.0.0.1:${PORT}`);
  console.log(`rewrites: ${JSON.stringify(rewrites)}`);
  console.log(`header rules: ${headerRules.length}`);
});

process.on('SIGTERM', () => { console.log(JSON.stringify(log, null, 1)); process.exit(0); });
