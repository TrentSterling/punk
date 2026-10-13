'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const MIME = { '.htm':'text/html; charset=utf-8', '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.mp4':'video/mp4', '.woff':'font/woff', '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8' };
function rangeFor(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size < 1) return false;
  let start, end;
  if (!match[1]) { const n = Number(match[2]); if (!Number.isSafeInteger(n) || n < 1) return false; start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1; }
  if (![start, end].every(Number.isSafeInteger) || start < 0 || start >= size || end < start) return false;
  return {start, end: Math.min(end, size - 1)};
}
async function startServer({root, overrides = {}, onRequest = () => {}}) {
  root = fs.realpathSync(root);
  const server = http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, {'Allow':'GET, HEAD'}).end(); return; }
    let relative;
    try { relative = decodeURIComponent(new URL(req.url, 'http://local.test').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (relative.includes('\0') || relative.includes('\\') || relative.split('/').includes('..')) { res.writeHead(403).end(); return; }
    relative = relative.replace(/^\/+/, '') || 'index.htm';
    if (relative.endsWith('/')) relative += 'index.htm';
    let bytes = Object.prototype.hasOwnProperty.call(overrides, relative) ? Buffer.from(overrides[relative]) : null;
    let file, size;
    try {
      if (bytes) size = bytes.length;
      else {
        file = fs.realpathSync(path.join(root, relative));
        if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        const stat = fs.statSync(file); if (!stat.isFile()) { res.writeHead(404).end(); return; } size = stat.size;
      }
    } catch { res.writeHead(404).end(); return; }
    const range = rangeFor(req.headers.range, size);
    const headers = {'Content-Type': MIME[path.extname(relative).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges':'bytes', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'};
    if (range === false) { res.writeHead(416, {...headers, 'Content-Range':`bytes */${size}`, 'Content-Length':0}).end(); return; }
    const start = range ? range.start : 0, end = range ? range.end : size - 1;
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    headers['Content-Length'] = Math.max(0, end - start + 1);
    res.writeHead(range ? 206 : 200, headers);
    onRequest({path:relative, method:req.method, range:req.headers.range || null, status:range ? 206 : 200, bytes:headers['Content-Length']});
    if (req.method === 'HEAD' || !size) { res.end(); return; }
    if (bytes) res.end(bytes.subarray(start, end + 1));
    else { const stream = fs.createReadStream(file, {start, end}); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin:`http://127.0.0.1:${server.address().port}`, close:() => new Promise(resolve => {server.close(resolve); server.closeAllConnections();}) };
}
module.exports = {rangeFor, startServer};
