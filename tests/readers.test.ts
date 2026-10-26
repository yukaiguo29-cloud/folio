// @vitest-environment jsdom
import { beforeAll, describe, it, expect } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { DOMMatrix, Path2D, ImageData, createCanvas } from '@napi-rs/canvas';
let engine: typeof import('../src/readers/engine');
beforeAll(async () => {
  Object.assign(globalThis, { DOMMatrix, Path2D, ImageData });
  engine = await import('../src/readers/engine');
  engine.pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ).href;
});
const bytes = async (name: string) =>
  new Uint8Array(await readFile(join(process.cwd(), 'test-fixtures', name)));
describe('real reading engines', () => {
  it('opens a real PDF, searches its extracted text and renders a real page', async () => {
    const e = await engine.createEngine('pdf', await bytes('Folio-reading-test.pdf'));
    expect(e.count).toBe(3);
    expect(await e.text(2)).toContain('serendipity');
    const p = await e.pdf!.getPage(1);
    const viewport = p.getViewport({ scale: 1 });
    const canvas = createCanvas(viewport.width, viewport.height);
    await p.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
    const png = canvas.toBuffer('image/png');
    expect(png.length).toBeGreaterThan(10000);
    await mkdir(join(process.cwd(), 'test-results'), { recursive: true });
    await writeFile(join(process.cwd(), 'test-results/pdf-render.png'), png);
    e.destroy();
  }, 20000);
  it('reports a damaged PDF as an error instead of accepting it', async () => {
    await expect(engine.createEngine('pdf', await bytes('corrupt.pdf'))).rejects.toThrow('PDF');
  });
  it('rejects corrupt EPUB and DOCX archives without waiting forever', async () => {
    const invalid = new TextEncoder().encode('not a zip archive');
    await expect(engine.createEngine('epub', invalid)).rejects.toThrow('EPUB');
    await expect(engine.createEngine('docx', invalid)).rejects.toThrow();
  });
  it('reads real EPUB chapters with a real table of contents', async () => {
    const e = await engine.createEngine('epub', await bytes('Quiet-book.epub'));
    expect(e.count).toBe(2);
    expect(e.outline.map((o) => o.page)).toEqual([1, 2]);
    expect(await e.text(2)).toContain('second chapter');
    expect(await e.html!(1)).toContain('A quiet beginning');
    e.destroy();
  }, 15000);
  it('reads real DOCX content while explicitly describing layout limitations', async () => {
    const e = await engine.createEngine('docx', await bytes('Word-reading-test.docx'));
    expect(await e.text(1)).toContain('serendipity');
    expect(e.warning).toContain('DOCX');
    expect(e.warning).toContain('无法完整还原');
    e.destroy();
  });
  it('parses Markdown headings, tables, emphasis and searchable text', async () => {
    const e = await engine.createEngine('md', await bytes('Reading-notes.md'));
    expect(e.outline).toHaveLength(3);
    expect(await e.html!(1)).toContain('<table>');
    expect(await e.html!(1)).toContain('<strong>real Markdown file</strong>');
    expect(await e.text(1)).toContain('serendipity');
    e.destroy();
  });
  it('escapes plain text rather than executing it as HTML', async () => {
    const e = await engine.createEngine(
      'txt',
      new TextEncoder().encode('<script>alert(1)</script>'),
    );
    expect(await e.html!(1)).toContain('&lt;script&gt;');
    expect(await e.text(1)).toContain('<script>');
    e.destroy();
  });
  it('opens HTML while stripping scripts, remote images, events and external links', async () => {
    const e = await engine.createEngine('html', await bytes('Safe-reading.html'));
    const html = await e.html!(1);
    expect(html).toContain('Safe local document content');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('https://example.com');
    expect(
      engine.sanitize(
        '<a href="javascript:alert(1)">bad</a><iframe src="https://example.com"></iframe><img src="data:image/png;base64,AAAA">',
      ),
    ).not.toContain('javascript:');
    e.destroy();
  });
  it('detects UTF-16 BOMs and GB18030 text', () => {
    expect(engine.decode(new Uint8Array([255, 254, 65, 0, 66, 0]))).toBe('AB');
    expect(engine.decode(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]))).toBe('中文');
  });
  it('rejects empty input in all readers', async () => {
    await expect(engine.createEngine('txt', new Uint8Array())).rejects.toThrow('为空');
  });
});
