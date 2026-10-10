import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT || 8004);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.task', 'application/octet-stream'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml']
]);

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = resolve(root, `.${pathname}`);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) throw new Error('invalid path');
    if ((await stat(filePath)).isDirectory()) throw new Error('directory');
    const content = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': types.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'same-origin'
    });
    response.end(content);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`DREAMY OCEAN: http://127.0.0.1:${port}/index.html`);
});
