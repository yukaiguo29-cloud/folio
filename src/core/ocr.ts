import type { OcrPage, OcrTextBlock } from './types';
import type { ReadingEngine } from '../readers/engine';

export type OcrLanguage = OcrPage['language'];

export interface OcrProgress {
  page: number;
  completed: number;
  total: number;
  phase: string;
}

export interface OcrTaskOptions {
  docId: string;
  fingerprint: string;
  engine: ReadingEngine;
  pages: number[];
  language: OcrLanguage;
  signal: AbortSignal;
  onProgress?: (progress: OcrProgress) => void;
  onPage?: (page: OcrPage) => void | Promise<void>;
}

async function renderPage(engine: ReadingEngine, pageNumber: number) {
  if (!engine.pdf) throw new Error('OCR 只支持 PDF 文档。');
  const page = await engine.pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.2, Math.max(1.2, 1800 / base.width));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建 OCR 图像画布。');
  await page.render({ canvasContext: context, canvas, viewport }).promise;
  return { canvas, width: canvas.width, height: canvas.height };
}

export async function recognizePdfPages(options: OcrTaskOptions): Promise<OcrPage[]> {
  if (!options.engine.pdf) throw new Error('OCR 只支持 PDF 文档。');
  const tesseract = await import('tesseract.js');
  const worker = await tesseract.createWorker(options.language, undefined, {
    logger: (message: { status: string; progress: number }) => {
      const current = options.pages[0] || 1;
      options.onProgress?.({
        page: current,
        completed: 0,
        total: options.pages.length,
        phase: message.status,
      });
    },
  });
  const results: OcrPage[] = [];
  try {
    for (let index = 0; index < options.pages.length; index++) {
      if (options.signal.aborted) throw new DOMException('OCR 已取消', 'AbortError');
      const pageNumber = options.pages[index];
      options.onProgress?.({
        page: pageNumber,
        completed: index,
        total: options.pages.length,
        phase: '正在渲染页面',
      });
      const rendered = await renderPage(options.engine, pageNumber);
      const result = await worker.recognize(rendered.canvas, {}, { blocks: true });
      const blocks: OcrTextBlock[] = (result.data.blocks || []).map((block) => ({
        text: block.text,
        confidence: Number(block.confidence || 0),
        x: block.bbox.x0 / rendered.width,
        y: block.bbox.y0 / rendered.height,
        width: (block.bbox.x1 - block.bbox.x0) / rendered.width,
        height: (block.bbox.y1 - block.bbox.y0) / rendered.height,
      }));
      results.push({
        docId: options.docId,
        page: pageNumber,
        text: result.data.text.trim(),
        blocks,
        language: options.language,
        engine: 'Tesseract.js 6',
        confidence: Number(result.data.confidence || 0),
        fingerprint: options.fingerprint,
        created: Date.now(),
      });
      await options.onPage?.(results[results.length - 1]);
      rendered.canvas.width = 1;
      rendered.canvas.height = 1;
      options.onProgress?.({
        page: pageNumber,
        completed: index + 1,
        total: options.pages.length,
        phase: '页面完成',
      });
    }
    return results;
  } finally {
    await worker.terminate();
  }
}
