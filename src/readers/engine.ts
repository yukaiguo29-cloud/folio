import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Format, OutlineItem } from '../core/types';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export { pdfjs };
export interface ReadingEngine {
  format: Format;
  count: number;
  outline: OutlineItem[];
  warning?: string;
  pdf?: pdfjs.PDFDocumentProxy;
  html?: (page: number) => Promise<string>;
  text: (page: number) => Promise<string>;
  destroy: () => void;
}
export function decode(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gb18030').decode(bytes);
  }
}
export function sanitize(html: string) {
  const clean = DOMPurify.sanitize(html, {
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'link',
      'meta',
      'video',
      'audio',
      'svg',
      'math',
    ],
    FORBID_ATTR: ['style', 'srcset', 'target'],
    ALLOW_DATA_ATTR: false,
  });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  for (const img of doc.querySelectorAll('img'))
    if (!img.src.startsWith('data:image/') && !img.src.startsWith('blob:'))
      img.removeAttribute('src');
  for (const a of doc.querySelectorAll('a')) {
    const href = a.getAttribute('href') || '';
    if (!href.startsWith('#')) a.removeAttribute('href');
  }
  return doc.body.innerHTML;
}
function textOf(html: string) {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
}
function splitHtml(html: string) {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const pages: string[] = [];
  let page = '';
  for (const el of Array.from(dom.body.childNodes)) {
    const content =
      el.nodeType === Node.ELEMENT_NODE
        ? (el as Element).outerHTML
        : escapeHtml(el.textContent || '');
    if (page.length > 10000) {
      pages.push(page);
      page = '';
    }
    page += content;
  }
  if (page.trim()) pages.push(page);
  return pages.length ? pages : ['<p>此文档没有可阅读的文本内容。</p>'];
}
export function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
function htmlEngine(format: Format, pages: string[], warning?: string): ReadingEngine {
  const outline: OutlineItem[] = [];
  for (let i = 0; i < pages.length; i++) {
    const doc = new DOMParser().parseFromString(pages[i], 'text/html');
    for (const h of doc.querySelectorAll('h1,h2,h3,h4')) {
      const id = `folio-h-${outline.length}`;
      h.id = id;
      outline.push({ title: h.textContent || '', page: i + 1, level: Number(h.tagName[1]), id });
    }
    pages[i] = doc.body.innerHTML;
  }
  return {
    format,
    count: pages.length,
    outline,
    warning,
    html: async (n) => pages[n - 1] || '',
    text: async (n) => textOf(pages[n - 1] || ''),
    destroy: () => {
      pages.length = 0;
    },
  };
}
export async function createEngine(format: Format, bytes: Uint8Array): Promise<ReadingEngine> {
  if (!bytes.length) throw new Error('文件为空，无法阅读。');
  if (format === 'pdf') {
    const task = pdfjs.getDocument({
      data: bytes.slice(),
      cMapUrl: '/pdf-assets/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdf-assets/standard_fonts/',
      wasmUrl: '/pdf-assets/wasm/',
    });
    let encrypted = false;
    task.onPassword = () => {
      encrypted = true;
      void task.destroy();
    };
    let pdf: pdfjs.PDFDocumentProxy;
    try {
      pdf = await task.promise;
    } catch (e) {
      if (encrypted) throw new Error('此 PDF 已加密，请先解除密码后导入。');
      throw new Error(`PDF 无法打开：${e instanceof Error ? e.message : '文件损坏或已加密'}`);
    }
    const outline: OutlineItem[] = [];
    try {
      const walk = async (items: Awaited<ReturnType<typeof pdf.getOutline>>, level = 1) => {
        for (const item of items || []) {
          let dest = item.dest;
          if (typeof dest === 'string') dest = await pdf.getDestination(dest);
          let page = 1;
          if (Array.isArray(dest) && dest[0] != null)
            page =
              typeof dest[0] === 'number' ? dest[0] + 1 : (await pdf.getPageIndex(dest[0])) + 1;
          outline.push({ title: item.title, page, level });
          await walk(item.items, level + 1);
        }
      };
      await walk(await pdf.getOutline());
    } catch {
      /* A malformed outline must not prevent reading. */
    }
    return {
      format,
      count: pdf.numPages,
      pdf,
      outline,
      text: async (n) => {
        const p = await pdf.getPage(n);
        const c = await p.getTextContent();
        return c.items
          .map((x, i) => {
            if (!('str' in x)) return '';
            const next = c.items[i + 1];
            const adjacentChinese =
              next &&
              'str' in next &&
              /[\u3400-\u9fff]$/.test(x.str) &&
              /^[\u3400-\u9fff]/.test(next.str);
            return x.str + (x.hasEOL ? '\n' : adjacentChinese ? '' : ' ');
          })
          .join('');
      },
      destroy: () => {
        void task.destroy();
      },
    };
  }
  if (format === 'epub') {
    const { default: ePub } = await import('epubjs');
    const book = ePub('', { replacements: 'none' });
    let navigationWarning = false;
    const loadNavigation = book.loadNavigation.bind(book);
    book.loadNavigation = async (packaging) => {
      try {
        return await loadNavigation(packaging);
      } catch {
        navigationWarning = true;
        book.navigation = {
          toc: [],
          landmarks: [],
          destroy() {},
        } as unknown as typeof book.navigation;
        return book.navigation;
      }
    };
    try {
      // Opening explicitly makes corrupt ZIP/package errors reject instead of leaving book.ready pending.
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          book.open(bytes.slice().buffer as ArrayBuffer, 'binary').then(() => book.ready),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error('章节解析超时，文件可能已经损坏。')),
              20000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
      const spine = (
        book.spine as unknown as {
          spineItems: {
            href: string;
            load: (loader: unknown) => Promise<Document>;
            unload: () => void;
          }[];
        }
      ).spineItems;
      const pages: string[] = [];
      const hrefToPage = new Map<string, number>();
      for (const s of spine) {
        const xml = await s.load(book.load.bind(book));
        let html = xml.querySelector('body')?.innerHTML || '';
        for (const img of Array.from(xml.querySelectorAll('img'))) {
          const src = img.getAttribute('src');
          if (!src) continue;
          try {
            const resolved = book.resolve(
              new URL(src, 'https://epub.local/' + s.href).pathname.slice(1),
            );
            const blob = await book.archive.getBlob(resolved);
            if (blob) {
              const data = await new Promise<string>((r) => {
                const f = new FileReader();
                f.onload = () => r(String(f.result));
                f.readAsDataURL(blob);
              });
              html = html.replaceAll(src, data);
            }
          } catch {
            /* Missing EPUB images leave their alternate text. */
          }
        }
        hrefToPage.set(s.href.split('#')[0], pages.length + 1);
        pages.push(sanitize(html));
        s.unload();
      }
      const engine = htmlEngine(format, pages);
      if (navigationWarning) engine.warning = 'EPUB 目录损坏，已保留可读取的章节。';
      const nav = await book.loaded.navigation;
      engine.outline = nav.toc.flatMap(function flatten(x): OutlineItem[] {
        return [
          { title: x.label, page: hrefToPage.get(x.href.split('#')[0]) || 1, level: 1 },
          ...(x.subitems || []).flatMap(flatten),
        ];
      });
      const release = engine.destroy;
      engine.destroy = () => {
        release();
        book.destroy();
      };
      return engine;
    } catch (e) {
      book.destroy();
      throw new Error('EPUB 解析失败：' + String(e));
    }
  }
  if (format === 'docx') {
    const mammoth = await import('mammoth');
    const input = { arrayBuffer: bytes.slice().buffer as ArrayBuffer, buffer: bytes };
    const result = await mammoth.convertToHtml(
      input as Parameters<typeof mammoth.convertToHtml>[0],
    );
    return htmlEngine(
      format,
      splitHtml(sanitize(result.value)),
      'DOCX 使用流式排版，保留基本结构；复杂页面、页眉页脚和修订无法完整还原。',
    );
  }
  const text = decode(bytes);
  if (format === 'txt') {
    const pages: string[] = [];
    for (let i = 0; i < text.length; i += 7000)
      pages.push(`<pre class="plain-text">${escapeHtml(text.slice(i, i + 7000))}</pre>`);
    return htmlEngine(format, pages.length ? pages : ['<p>空文档</p>']);
  }
  return htmlEngine(
    format,
    splitHtml(sanitize(format === 'md' ? await marked.parse(text, { async: true }) : text)),
  );
}
