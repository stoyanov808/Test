const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

let game;
try { game = fs.readFileSync(path.join(__dirname, 'PLAY.html')); }
catch { console.error('Extract the complete ZIP first: PLAY.html must be beside START.cjs.'); process.exit(1); }

const audioFiles = new Map();
const audioRoot = path.join(__dirname, 'audio');
if (fs.existsSync(audioRoot)) {
  for (const name of fs.readdirSync(audioRoot)) {
    if (/^[a-z0-9-]+\.(wav|ogg|mp3)$/i.test(name)) {
      audioFiles.set(`/audio/${name}`, { bytes: fs.readFileSync(path.join(audioRoot, name)), type: name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg' });
    }
  }
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  const audio = audioFiles.get(pathname);
  if (audio) {
    response.writeHead(200, { 'Content-Type': audio.type, 'Content-Length': audio.bytes.length });
    response.end(audio.bytes); return;
  }
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
