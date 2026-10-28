import type { ReadingEngine } from '../readers/engine';

export interface CaptureRegion {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function capturePdfRegion(engine: ReadingEngine, region: CaptureRegion) {
  if (!engine.pdf) throw new Error('区域截图只支持 PDF 页面。');
  const page = await engine.pdf.getPage(region.page);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(2, 2400 / base.width));
  const viewport = page.getViewport({ scale });
  const full = document.createElement('canvas');
  full.width = Math.ceil(viewport.width);
  full.height = Math.ceil(viewport.height);
  const context = full.getContext('2d');
  if (!context) throw new Error('无法创建截图画布。');
  await page.render({ canvasContext: context, canvas: full, viewport }).promise;
  const sx = Math.max(0, Math.floor(region.x * full.width));
  const sy = Math.max(0, Math.floor(region.y * full.height));
  const sw = Math.max(1, Math.min(full.width - sx, Math.floor(region.width * full.width)));
  const sh = Math.max(1, Math.min(full.height - sy, Math.floor(region.height * full.height)));
  const crop = document.createElement('canvas');
  crop.width = sw;
  crop.height = sh;
  crop.getContext('2d')?.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  full.width = 1;
  full.height = 1;
  return {
    region,
    width: sw,
    height: sh,
    dataUrl: crop.toDataURL('image/png'),
    blob: await new Promise<Blob>((resolve, reject) =>
      crop.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG 生成失败。'))), 'image/png'),
    ),
  };
}
