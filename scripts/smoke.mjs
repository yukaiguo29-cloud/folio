import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)),
  origin = 'http://127.0.0.1:1420';
const assets = await readdir(root + 'dist/assets');
const paths = [
  '/',
  '/guide.md',
  ...['.js', '.css', '.wasm', '.mjs'].map(
    (ext) => '/assets/' + assets.find((name) => name.endsWith(ext)),
  ),
];
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
  const names = await readdir(root + 'dist/pdf-assets/' + dir);
  const name = names.find((n) => !n.toLowerCase().includes('license') && !n.endsWith('.json'));
  if (name) paths.push('/pdf-assets/' + dir + '/' + name);
}
const results = [];
for (const path of paths) {
  const response = await fetch(origin + path);
  const size = (await response.arrayBuffer()).byteLength;
  if (response.status !== 200 || !size)
    throw new Error(`Resource failed: ${path} (${response.status})`);
  if (path === '/') {
    if (!response.headers.get('content-security-policy')?.includes("object-src 'none'"))
      throw new Error('Security headers missing');
  }
  results.push({
    path,
    status: response.status,
    bytes: size,
    type: response.headers.get('content-type'),
  });
}
const forbidden = await fetch(origin + '/src/core/database.ts');
if (forbidden.status !== 404) throw new Error('Source files exposed by production server');
results.push({ path: '/src/core/database.ts', status: forbidden.status });
await mkdir(root + 'test-results', { recursive: true });
await writeFile(root + 'test-results/http-smoke.json', JSON.stringify(results, null, 2));
console.log(
  `Production HTTP smoke: ${results.length} checks passed. SQLite WASM, PDF worker, offline fonts and CMaps are available.`,
);
