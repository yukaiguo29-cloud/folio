// @vitest-environment jsdom
import { beforeAll, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import { DOMMatrix, Path2D, ImageData } from '@napi-rs/canvas';
import 'fake-indexeddb/auto';
vi.mock('sql.js', async () => {
  const actual = await vi.importActual<typeof import('sql.js')>('sql.js');
  return {
    default: () =>
      actual.default({
        locateFile: () => join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
      }),
  };
});
let App: typeof import('../src/App').default;
beforeAll(async () => {
  Object.assign(globalThis, { DOMMatrix, Path2D, ImageData });
  vi.stubGlobal('crypto', webcrypto);
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', window.matchMedia);
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  class IntersectionObserverMock {
    constructor(private cb: IntersectionObserverCallback) {}
    observe(target: Element) {
      if (!target.classList.contains('pdf-page'))
        this.cb(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  HTMLElement.prototype.scrollIntoView = () => {};
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => ({
    x: 400,
    y: 300,
    width: 200,
    height: 20,
    top: 300,
    left: 400,
    right: 600,
    bottom: 320,
    toJSON: () => ({}),
  });
  window.confirm = () => true;
  Object.defineProperty(File.prototype, 'arrayBuffer', {
    value: function () {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    },
  });
  vi.stubGlobal('fetch', async (url: string) => {
    if (url !== '/guide.md') throw new Error('Unexpected network access in offline test');
    const bytes = await readFile(join(process.cwd(), 'public/guide.md'));
    return {
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  });
  const engine = await import('../src/readers/engine');
  engine.pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ).href;
  App = (await import('../src/App')).default;
});
it('completes the real local import, read, annotate, search, restore, remove and reimport flow', async () => {
  const user = userEvent.setup();
  let mounted = render(<App />);
  await screen.findByRole('button', { name: '打开文档' });
  await user.click(screen.getByRole('button', { name: '阅读 Folio 使用指南' }));
  await screen.findByRole('region', { name: '主阅读窗格' });
  const { useApp } = await import('../src/core/store');
  const db = await import('../src/core/database');
  const platform = await import('../src/core/platform');
  await waitFor(() => expect(db.repository.documents()).toHaveLength(1));
  await waitFor(() => expect(mounted.container.querySelector('.prose h1')).not.toBeNull());
  const article = mounted.container.querySelector<HTMLElement>('.prose')!;
  const title = article.querySelector('h1')!.firstChild!;
  const range = document.createRange();
  range.setStart(title, 0);
  range.setEnd(title, title.textContent!.length);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  fireEvent.mouseUp(article);
  await user.click(await screen.findByRole('button', { name: '批注选文' }));
  await user.type(screen.getByPlaceholderText('这一段让你想到什么？'), '真实的持久化笔记');
  await user.click(screen.getByRole('button', { name: '保存批注' }));
  await waitFor(() =>
    expect(db.repository.notes().some((n) => n.body === '真实的持久化笔记')).toBe(true),
  );
  await user.click(screen.getByRole('button', { name: '添加书签' }));
  expect(db.repository.notes()).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: '笔记', exact: true }));
  expect(await screen.findByText('真实的持久化笔记')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '切换主题' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(db.repository.settings().theme).toBe('dark');
  const pdfBytes = await readFile(join(process.cwd(), 'test-fixtures/Folio-reading-test.pdf'));
  const input = mounted.container.querySelector<HTMLInputElement>('input[type=file]')!;
  await user.upload(
    input,
    new File([new Uint8Array(pdfBytes)], 'Folio-reading-test.pdf', { type: 'application/pdf' }),
  );
  await waitFor(() =>
    expect(useApp.getState().docs.find((d) => d.format === 'pdf')?.indexed).toBe(true),
  );
  const pdf = useApp.getState().docs.find((d) => d.format === 'pdf')!;
  await waitFor(() => expect(useApp.getState().active).toBe(pdf.id));
  await user.click(screen.getByRole('button', { name: '下一页', exact: true }));
  expect(db.repository.documents().find((d) => d.id === pdf.id)?.page).toBe(2);
  await user.click(screen.getByRole('button', { name: '文档内搜索' }));
  await user.type(screen.getByRole('textbox', { name: '搜索文档正文' }), 'serendipity');
  expect(await screen.findByText('1 处')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '关闭', exact: true }));
  await user.click(screen.getByRole('button', { name: '添加书签' }));
  await act(async () => {
    await db.flush();
  });
  const saved = await platform.readDatabase();
  expect(saved!.length).toBeGreaterThan(1000);
  mounted.unmount();
  await db.restoreDatabase(saved!);
  useApp.setState({ ready: false, docs: [], notes: [], active: null, tabs: [] });
  mounted = render(<App />);
  await screen.findByRole('region', { name: '主阅读窗格' });
  expect(db.repository.documents().find((d) => d.id === pdf.id)?.page).toBe(2);
  expect(db.repository.notes().some((n) => n.body === '真实的持久化笔记')).toBe(true);
  expect(db.repository.settings().theme).toBe('dark');
  expect(useApp.getState().active).toBe(pdf.id);
  await user.click(screen.getByRole('button', { name: '返回资料库' }));
  await user.click(screen.getByRole('button', { name: 'Folio-reading-test.pdf 的详情' }));
  await user.click(screen.getByRole('button', { name: '移出资料库' }));
  await waitFor(() => expect(db.repository.documents().some((d) => d.id === pdf.id)).toBe(false));
  expect(db.repository.notes(pdf.id)).toHaveLength(0);
  await user.upload(
    mounted.container.querySelector<HTMLInputElement>('input[type=file]')!,
    new File([new Uint8Array(pdfBytes)], 'Folio-reading-test.pdf', { type: 'application/pdf' }),
  );
  await waitFor(() => expect(db.repository.documents().some((d) => d.id === pdf.id)).toBe(true));
  await expect(platform.readBytes('does-not-exist')).rejects.toThrow('不存在');
  const corrupt = await readFile(join(process.cwd(), 'test-fixtures/corrupt.pdf'));
  const before = db.repository.documents().length;
  await user.upload(
    mounted.container.querySelector<HTMLInputElement>('input[type=file]')!,
    new File([new Uint8Array(corrupt)], 'corrupt.pdf', { type: 'application/pdf' }),
  );
  await waitFor(() => expect(useApp.getState().toast).toContain('corrupt.pdf'));
  expect(db.repository.documents()).toHaveLength(before);
  cleanup();
}, 30000);
