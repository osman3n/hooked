/* serve.mjs — a static file server with no dependencies.
   GitHub Pages will serve these files with its own MIME table, so this exists
   only for local testing and for the screenshot harness. */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

export function serve(port = 0, root = ROOT) {
  // resolve first: a relative root like '.' makes the traversal check below
  // compare 'index.html' against '.' and 403 every request
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith('/')) path += 'index.html';

      // refuse anything that escapes the root
      const target = normalize(join(base, path));
      if (target !== base && !target.startsWith(base + sep)) {
        res.writeHead(403).end('forbidden');
        return;
      }

      const info = await stat(target).catch(() => null);
      if (!info || !info.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }

      const body = await readFile(target);
      res.writeHead(200, {
        'content-type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-cache',
        'content-length': body.length,
      });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err));
    }
  });

  return new Promise(ok => {
    server.listen(port, '127.0.0.1', () => {
      ok({ server, port: server.address().port, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

/* `node tools/serve.mjs 8080` runs it directly */
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const port = Number(process.argv[2] || 8080);
  const { url } = await serve(port);
  console.log(`HOOKED → ${url}`);
}
