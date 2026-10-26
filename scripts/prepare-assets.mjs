import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const name of ['cmaps', 'standard_fonts', 'wasm']) {
  await mkdir(root + 'public/pdf-assets/' + name, { recursive: true });
  await cp(root + 'node_modules/pdfjs-dist/' + name, root + 'public/pdf-assets/' + name, {
    recursive: true,
  });
}
console.log('PDF fonts, CMaps and WASM assets are ready for offline reading.');
