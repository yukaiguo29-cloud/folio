import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve, relative } from 'node:path';
import JSZip from 'jszip';
const root = resolve(fileURLToPath(new URL('../', import.meta.url))),
  out = resolve(root, '../output');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await mkdir(out, { recursive: true });
await mkdir(join(root, 'THIRD-PARTY-LICENSES'), { recursive: true });
let notices =
  '# 第三方组件\n\n以下为应用直接使用的组件及其安装版本。各组件保留原有许可证；离线 PDF 资源的额外许可证保留于对应资源目录。\n\n| 组件 | 版本 | 许可证 |\n| --- | --- | --- |\n';
for (const name of Object.keys(manifest.dependencies)) {
  const location = join(root, 'node_modules', name);
  const pkg = JSON.parse(await readFile(join(location, 'package.json'), 'utf8'));
  const license =
    typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license || 'See package');
  notices += `| ${name} | ${pkg.version} | ${license} |\n`;
  for (const file of await readdir(location)) {
    if (/^licen[sc]e(?:\..*)?$/i.test(file) && (await stat(join(location, file))).isFile())
      await writeFile(
        join(root, 'THIRD-PARTY-LICENSES', name.replaceAll('/', '-') + '-' + file),
        await readFile(join(location, file)),
      );
  }
}
await writeFile(join(root, 'THIRD-PARTY.md'), notices);
async function walk(dir, zip, prefix, skip) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, e.name),
      rel = relative(root, path).replaceAll('\\', '/');
    if (skip(rel) || e.isSymbolicLink()) continue;
    if (e.isDirectory()) await walk(path, zip, prefix, skip);
    else zip.file(prefix + rel, await readFile(path));
  }
}
const source = new JSZip();
await walk(
  root,
  source,
  'folio/',
  (p) =>
    p === 'node_modules' ||
    p === 'dist' ||
    p === '.git' ||
    p === 'src-tauri/target' ||
    p === 'public/pdf-assets' ||
    p === 'tsconfig.tsbuildinfo',
);
const portable = new JSZip();
for (const dir of ['dist', 'test-fixtures', 'THIRD-PARTY-LICENSES'])
  await walk(join(root, dir), portable, 'Folio-browser/', () => false);
for (const file of [
  'README.md',
  'TEST-REPORT.md',
  'THIRD-PARTY.md',
  '启动 Folio.cmd',
  'start-folio.command',
  'scripts/serve.mjs',
])
  portable.file('Folio-browser/' + file, await readFile(join(root, file)));
portable.file(
  'Folio-browser/先读我.txt',
  '知间 · Folio ' +
    manifest.version +
    ' 浏览器运行版\n\n需要 Node.js 24。解压后双击「启动 Folio.cmd」，保留服务窗口。\n也可执行 node scripts/serve.mjs，再访问 http://127.0.0.1:1420/ 。\n\n这不是原生 Windows 安装包。文档副本与笔记保存在当前浏览器的 IndexedDB。请保留原文件，并在设置中导出数据库备份。\n完整 Tauri 源码在另一份 source 压缩包内。\n',
);
for (const [label, zip] of [
  ['source', source],
  ['browser', portable],
]) {
  const bytes = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const name = `Folio-${manifest.version}-${label}.zip`;
  await writeFile(join(out, name), bytes);
  await JSZip.loadAsync(bytes, { checkCRC32: true });
  console.log(`${name}: ${(bytes.length / 1024 / 1024).toFixed(2)} MB, CRC verification passed.`);
}
