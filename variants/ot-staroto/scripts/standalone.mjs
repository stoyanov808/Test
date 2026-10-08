import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let html = await readFile(resolve(root, 'dist/index.html'), 'utf8');
for (const match of [...html.matchAll(/<script\b[^>]*src="([^\"]+)"[^>]*><\/script>/g)]) {
  const script = await readFile(resolve(root, 'dist', match[1]), 'utf8');
  if (/\bimport\s*(?:\(|[\w{*])/.test(script)) throw new Error('Standalone bundle still imports another module');
  html = html.replace(match[0], `<script type="module">${script.replaceAll('</script', '<\\/script')}</script>`);
}
for (const match of [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^\"]+)"[^>]*>/g)]) {
  const css = await readFile(resolve(root, 'dist', match[1]), 'utf8');
  html = html.replace(match[0], `<style>${css.replaceAll('</style', '<\\/style')}</style>`);
}
html = html.replace(/<link\b[^>]*rel="modulepreload"[^>]*>/g, '');
await mkdir(resolve(root, 'release'), {recursive: true});
await writeFile(resolve(root, 'release/PLAY.html'), html);
console.log(`Self-contained game: release/PLAY.html (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MiB)`);
