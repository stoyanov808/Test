const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

let game;
try { game = fs.readFileSync(path.join(__dirname, 'PLAY.html')); }
catch { console.error('Extract the complete ZIP first: PLAY.html must be beside START.cjs.'); process.exit(1); }

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  if (pathname !== '/' && pathname !== '/PLAY.html') { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': game.length });
  response.end(game);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(5188, '127.0.0.1', () => {
  const address = `http://127.0.0.1:${server.address().port}/`;
  console.log(`OT STAROTO: ${address}\nKeep this window open while playing. Press Ctrl+C to stop.`);
  if (process.argv.includes('--no-open')) return;
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/d', '/c', 'start', '', address] : [address];
  const child = spawn(command, args, { stdio: 'ignore' });
  child.on('error', () => console.log('Open the address above in your browser.'));
  child.unref();
});
