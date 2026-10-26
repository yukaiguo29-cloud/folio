import { useEffect, useRef, useState, memo } from 'react';
import { pdfjs } from './engine';
import type { ReadingEngine } from './engine';
import type { Note, Settings } from '../core/types';
import { resolveAnchor, rangeAt } from '../core/anchors';
import 'pdfjs-dist/web/pdf_viewer.css';
function DocumentPageImpl({
  engine,
  page,
  scale,
  notes,
  settings,
  thumbnail = false,
}: {
  engine: ReadingEngine;
  page: number;
  scale: number;
  notes: Note[];
  settings: Settings;
  thumbnail?: boolean;
}) {
  const wrapper = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    layer = useRef<HTMLDivElement>(null),
    article = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false),
    [html, setHtml] = useState(''),
    [dimensions, setDimensions] = useState({ w: 612, h: 792 }),
    [error, setError] = useState(''),
    [marks, setMarks] = useState<
      { x: number; y: number; w: number; h: number; color: string; underline: boolean }[]
    >([]);
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => setVisible(entries[0].isIntersecting), {
      rootMargin: thumbnail ? '100px' : '650px',
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let renderTask: ReturnType<pdfjs.PDFPageProxy['render']> | undefined;
    let textLayer: pdfjs.TextLayer | undefined;
    if (engine.pdf) {
      void (async () => {
        try {
          const p = await engine.pdf!.getPage(page);
          if (cancelled) return;
          const view = p.getViewport({ scale });
          setDimensions({ w: view.width, h: view.height });
          const c = canvas.current;
          if (!c) return;
          const ratio = thumbnail ? 1 : Math.min(devicePixelRatio || 1, 2);
          c.width = Math.ceil(view.width * ratio);
          c.height = Math.ceil(view.height * ratio);
          c.style.width = `${view.width}px`;
          c.style.height = `${view.height}px`;
          renderTask = p.render({
            canvas: c,
            viewport: view,
            transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
          });
          await renderTask.promise;
          if (cancelled) return;
          if (!thumbnail && layer.current) {
            layer.current.innerHTML = '';
            textLayer = new pdfjs.TextLayer({
              textContentSource: await p.getTextContent(),
              container: layer.current,
              viewport: view,
            });
            await textLayer.render();
          }
        } catch (e) {
          if (!cancelled && !(e instanceof Error && e.name === 'RenderingCancelledException'))
            setError('页面渲染失败：' + String(e));
        }
      })();
    } else if (engine.html) {
      void engine
        .html(page)
        .then((value) => {
          if (!cancelled) setHtml(value);
        })
        .catch((e) => setError(String(e)));
    }
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      if (canvas.current) {
        canvas.current.width = 0;
        canvas.current.height = 0;
      }
      if (layer.current) layer.current.innerHTML = '';
    };
  }, [engine, page, scale, visible, thumbnail]);
  useEffect(() => {
    if (engine.pdf || !article.current || !visible) return;
    const el = article.current;
    const update = () => {
      const box = wrapper.current!.getBoundingClientRect();
      const out: typeof marks = [];
      for (const n of notes) {
        const located = resolveAnchor(el.textContent || '', n.anchor);
        if (!located) continue;
        const r = rangeAt(el, located.start, located.end);
        if (!r) continue;
        for (const b of r.getClientRects())
          out.push({
            x: b.x - box.x,
            y: b.y - box.y,
            w: b.width,
            h: b.height,
            color: n.color,
            underline: n.kind === 'underline',
          });
      }
      setMarks(out);
    };
    const resize = new ResizeObserver(update);
    resize.observe(el);
    update();
    return () => resize.disconnect();
  }, [html, notes, settings.fontSize, settings.width, settings.lineHeight, visible, engine.pdf]);
  const size = engine.pdf ? { width: dimensions.w, height: dimensions.h } : undefined;
  return (
    <div
      ref={wrapper}
      className={`document-page ${engine.pdf ? 'pdf-page' : 'reflow-page'} ${thumbnail ? 'thumbnail-page' : ''}`}
      data-page={page}
      style={size}
    >
      {engine.pdf ? (
        <>
          <canvas ref={canvas} aria-label={`第 ${page} 页`} />
          {!thumbnail && (
            <div
              ref={layer}
              className="textLayer"
              style={
                { '--scale-factor': scale, '--total-scale-factor': scale } as React.CSSProperties
              }
            />
          )}
          <div className="annotation-layer">
            {notes.flatMap((n) =>
              (n.anchor.rects || []).map((r, i) => (
                <span
                  key={n.id + i}
                  style={{
                    left: r.x * 100 + '%',
                    top: r.y * 100 + '%',
                    width: r.w * 100 + '%',
                    height: r.h * 100 + '%',
                    background: n.kind === 'underline' ? 'transparent' : n.color,
                    borderBottom: n.kind === 'underline' ? `2px solid ${n.color}` : undefined,
                  }}
                />
              )),
            )}
          </div>
        </>
      ) : (
        <>
          <article
            ref={article}
            className={`prose ${settings.wrap ? '' : 'no-wrap'}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <div className="annotation-layer">
            {marks.map((r, i) => (
              <span
                key={i}
                style={{
                  left: r.x,
                  top: r.y,
                  width: r.w,
                  height: r.h,
                  background: r.underline ? 'transparent' : r.color,
                  borderBottom: r.underline ? `2px solid ${r.color}` : undefined,
                }}
              />
            ))}
          </div>
        </>
      )}
      {error && <div className="page-error">{error}</div>}
    </div>
  );
}
export const DocumentPage = memo(DocumentPageImpl);
