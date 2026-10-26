import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Minus,
  Plus,
  Scan,
  Search,
  Bookmark,
  Focus,
  Columns2,
  Maximize,
  Highlighter,
  Underline,
  MessageSquare,
  Copy,
  Lightbulb,
  TextCursor,
  ChevronDown,
  ListTree,
} from 'lucide-react';
import type { ReadingEngine } from './engine';
import { DocumentPage } from './Page';
import { getEngine, indexDocument } from '../core/library';
import { repository, persist } from '../core/database';
import { useApp, mutate } from '../core/store';
import { clamp } from '../core/types';
import type { Anchor, Note, SearchHit } from '../core/types';
import { selectionAnchor, resolveAnchor, rangeAt } from '../core/anchors';
import { navigateTo } from '../core/navigation';
import { IconButton, Loading, Modal } from '../ui/shared';
const emptyNotes: Note[] = [];
export function Reader({
  id,
  secondary = false,
  onRelocate,
}: {
  id: string;
  secondary?: boolean;
  onRelocate: (id: string) => void;
}) {
  const doc = useApp((s) => s.docs.find((d) => d.id === id))!,
    settings = useApp((s) => s.settings),
    allNotes = useApp((s) => s.notes);
  const [engine, setEngine] = useState<ReadingEngine | null>(null),
    [error, setError] = useState(''),
    [scale, setScale] = useState(1),
    [fit, setFit] = useState<'width' | 'page' | 'manual'>('width'),
    [continuous, setContinuous] = useState(true),
    [spread, setSpread] = useState(false),
    [page, setPage] = useState(doc.page),
    [inputPage, setInputPage] = useState(String(doc.page)),
    [search, setSearch] = useState<string | null>(null),
    [hits, setHits] = useState<SearchHit[]>([]),
    [selection, setSelection] = useState<{ anchor: Anchor; x: number; y: number } | null>(null),
    [noteModal, setNoteModal] = useState(false),
    [noteBody, setNoteBody] = useState(''),
    [color, setColor] = useState('#f2cf70');
  const pageNotes = useMemo(() => {
    const result = new Map<number, Note[]>();
    for (const note of allNotes)
      if (note.docId === id) {
        const group = result.get(note.anchor.page) || [];
        group.push(note);
        result.set(note.anchor.page, group);
      }
    return result;
  }, [allNotes, id]);
  const scroll = useRef<HTMLDivElement>(null),
    pageRef = useRef(doc.page),
    ready = useRef(false),
    lastHistory = useRef(0),
    lastScrollSave = useRef(0),
    restoring = useRef(false);
  const [paneWidth, setPaneWidth] = useState(800);
  const focus = useApp((s) => s.focus),
    ruler = useApp((s) => s.ruler);
  const [rulerY, setRulerY] = useState(-1000),
    [outlineOpen, setOutlineOpen] = useState(false),
    [jumpTarget, setJumpTarget] = useState<Anchor | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError('');
    setEngine(null);
    ready.current = false;
    getEngine(doc)
      .then((e) => {
        if (!cancelled) {
          setEngine(e);
          void indexDocument(doc, e);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id, doc.path]);
  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const o = new ResizeObserver(() => setPaneWidth(el.clientWidth));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  const jump = useCallback(
    (n: number, offset = 0) => {
      const next = clamp(Math.round(n), 1, engine?.count || doc.total);
      pageRef.current = next;
      setPage(next);
      setInputPage(String(next));
      const state = useApp.getState();
      const current = state.docs.find((d) => d.id === id);
      state.updateDoc(id, {
        page: next,
        offset,
        progress: next / (engine?.count || doc.total),
        status: current?.status === 'finished' ? 'finished' : 'reading',
      });
      restoring.current = true;
      requestAnimationFrame(() => {
        const root = scroll.current,
          el = root?.querySelector<HTMLElement>(`[data-page="${next}"]`);
        if (root && el) {
          el.scrollIntoView({ block: 'start', behavior: 'instant' });
          root.scrollTop += offset * el.offsetHeight;
        }
      });
      setTimeout(() => {
        restoring.current = false;
      }, 200);
    },
    [id, engine?.count, doc.total],
  );
  useEffect(() => {
    if (!engine) return;
    if (!ready.current) {
      const t = setTimeout(() => {
        ready.current = true;
        jump(doc.page, doc.offset || 0);
      }, 100);
      return () => clearTimeout(t);
    }
    if (doc.page !== pageRef.current) jump(doc.page);
  }, [engine, doc.page, jump]);
  useEffect(() => {
    const handle = (e: Event) => {
      const detail = (e as CustomEvent<{ docId: string; anchor: Anchor }>).detail;
      if (detail.docId === id) setJumpTarget(detail.anchor);
    };
    window.addEventListener('folio:jump', handle);
    return () => window.removeEventListener('folio:jump', handle);
  }, [id]);
  useEffect(() => {
    if (!engine || !jumpTarget) return;
    jump(jumpTarget.page);
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const root = scroll.current,
        p = root?.querySelector<HTMLElement>(`[data-page="${jumpTarget.page}"]`),
        content = p?.querySelector<HTMLElement>(engine.pdf ? '.textLayer' : 'article');
      if (content && root) {
        const text = content.textContent || '';
        let located = resolveAnchor(text, jumpTarget);
        if (!located && jumpTarget.quote) {
          const start = text.toLowerCase().indexOf(jumpTarget.quote.toLowerCase());
          if (start >= 0) located = { start, end: start + jumpTarget.quote.length };
        }
        const range = located ? rangeAt(content, located.start, located.end) : null;
        if (range) {
          const rect = range.getBoundingClientRect(),
            box = root.getBoundingClientRect();
          root.scrollTop += rect.top - box.top - root.clientHeight * 0.3;
          const selected = window.getSelection();
          selected?.removeAllRanges();
          selected?.addRange(range);
          clearInterval(timer);
          setJumpTarget(null);
        } else if (p && jumpTarget.rects?.length) {
          const box = p.getBoundingClientRect();
          root.scrollTop +=
            box.top -
            root.getBoundingClientRect().top +
            jumpTarget.rects[0].y * box.height -
            root.clientHeight * 0.3;
          clearInterval(timer);
          setJumpTarget(null);
        }
      }
      if (tries >= 25) {
        clearInterval(timer);
        setJumpTarget(null);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [engine, jumpTarget, jump]);
  useEffect(() => {
    if (fit === 'manual' || !engine?.pdf) return;
    let cancelled = false;
    void engine.pdf.getPage(pageRef.current).then((p) => {
      if (cancelled) return;
      const v = p.getViewport({ scale: 1 });
      let next = (paneWidth - 64) / (v.width * (spread ? 2 : 1));
      if (fit === 'page')
        next = Math.min(next, ((scroll.current?.clientHeight || 800) - 60) / v.height);
      setScale(clamp(next, 0.2, 3));
    });
    return () => {
      cancelled = true;
    };
  }, [engine, fit, paneWidth, spread]);
  useEffect(() => {
    if (search === null) return;
    const t = setTimeout(() => setHits(repository.search(search, id)), 130);
    return () => clearTimeout(t);
  }, [search, id, doc.indexed]);
  useEffect(() => {
    if (secondary) return;
    const handle = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches('input,textarea,select') || target.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearch((s) => (s === null ? '' : null));
      }
      if (e.key === 'PageDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        jump(pageRef.current + 1);
      }
      if (e.key === 'PageUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        jump(pageRef.current - 1);
      }
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [jump, secondary]);
  const progress = (n: number, offset = 0) => {
    pageRef.current = n;
    setPage(n);
    setInputPage(String(n));
    const ratio = engine ? n / engine.count : 0;
    const state = useApp.getState();
    const current = state.docs.find((d) => d.id === id);
    state.updateDoc(id, {
      page: n,
      offset,
      progress: ratio,
      status: current?.status === 'finished' ? 'finished' : 'reading',
    });
    if (Date.now() - lastHistory.current > 60000) {
      lastHistory.current = Date.now();
      repository.event(id, `阅读到第 ${n} 页 / 节`);
      persist();
    }
  };
  const onScroll = () => {
    if (!engine || !ready.current || restoring.current || Date.now() - lastScrollSave.current < 200)
      return;
    lastScrollSave.current = Date.now();
    const root = scroll.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const pages = Array.from(root.querySelectorAll<HTMLElement>('.document-page'));
    const el = pages.find(
      (el) => el.getBoundingClientRect().bottom > box.top + root.clientHeight * 0.15,
    );
    const n = Number(el?.dataset.page || pageRef.current);
    const offset = el
      ? clamp((box.top - el.getBoundingClientRect().top) / Math.max(1, el.offsetHeight), 0, 1)
      : 0;
    progress(n, offset);
  };
  const selectText = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) {
      setSelection(null);
      return;
    }
    const r = s.getRangeAt(0);
    const node =
      r.commonAncestorContainer.nodeType === 1
        ? (r.commonAncestorContainer as Element)
        : r.commonAncestorContainer.parentElement;
    const p = node?.closest<HTMLElement>('.document-page');
    if (
      !p ||
      !scroll.current?.contains(p) ||
      !p.contains(r.startContainer) ||
      !p.contains(r.endContainer)
    )
      return;
    const content = p.querySelector<HTMLElement>(engine?.pdf ? '.textLayer' : 'article');
    if (!content) return;
    const anchor = selectionAnchor(content, Number(p.dataset.page), r);
    if (!anchor.quote.trim()) return;
    if (engine?.pdf) {
      const box = p.getBoundingClientRect();
      anchor.rects = Array.from(r.getClientRects())
        .filter((b) => b.width > 0 && b.height > 0)
        .map((b) => ({
          x: clamp((b.x - box.x) / box.width, 0, 1),
          y: clamp((b.y - box.y) / box.height, 0, 1),
          w: Math.min(b.width / box.width, 1),
          h: Math.min(b.height / box.height, 1),
        }));
    }
    const rect = r.getBoundingClientRect();
    setSelection({
      anchor,
      x: clamp(rect.x + rect.width / 2, 180, window.innerWidth - 180),
      y: Math.max(110, rect.y - 12),
    });
    window.dispatchEvent(new CustomEvent('folio:selection', { detail: { id, anchor } }));
  };
  const addNote = (kind: Note['kind'], body = '') => {
    const anchor = kind === 'bookmark' ? { page, quote: '' } : selection?.anchor;
    if (!anchor) return;
    const existing = allNotes.find(
      (n) => n.docId === id && n.kind === 'bookmark' && n.anchor.page === page,
    );
    if (existing && kind === 'bookmark') {
      mutate(() => repository.deleteNote(existing.id));
      return;
    }
    const note: Note = {
      id: crypto.randomUUID(),
      docId: id,
      kind,
      color,
      body,
      anchor,
      created: Date.now(),
    };
    mutate(() => {
      repository.putNote(note);
      repository.event(
        id,
        kind === 'bookmark'
          ? `在第 ${page} 页添加书签`
          : '添加' +
              {
                highlight: '高亮',
                underline: '下划线',
                note: '批注',
                excerpt: '灵感摘录',
                bookmark: '书签',
              }[kind],
      );
    });
    setSelection(null);
    setNoteModal(false);
    setNoteBody('');
    window.getSelection()?.removeAllRanges();
    useApp.getState().notify('已保存到本地');
  };
  const pages = engine
    ? continuous
      ? Array.from({ length: engine.count }, (_, i) => i + 1)
      : Array.from(
          { length: Math.min(spread ? 2 : 1, engine.count - page + 1) },
          (_, i) => page + i,
        )
    : [];
  return (
    <section
      className={`reader-pane ${secondary ? 'secondary' : ''}`}
      aria-label={secondary ? '对照阅读窗格' : '主阅读窗格'}
    >
      <div className="reader-toolbar">
        <div className="toolbar-group">
          <IconButton label="上一页" disabled={page <= 1 || !engine} onClick={() => jump(page - 1)}>
            <ArrowLeft size={16} />
          </IconButton>
          <label className="page-input">
            <input
              aria-label={secondary ? '对照页码' : '页码'}
              value={inputPage}
              onChange={(e) => setInputPage(e.target.value)}
              onBlur={() => {
                jump(Number(inputPage));
                progress(clamp(Number(inputPage), 1, engine?.count || 1));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
            <span>/ {engine?.count || doc.total}</span>
          </label>
          <IconButton
            label="下一页"
            disabled={!engine || page >= engine.count}
            onClick={() => {
              jump(page + 1);
              progress(page + 1);
            }}
          >
            <ArrowRight size={16} />
          </IconButton>
        </div>
        <div className="toolbar-group zoom-controls">
          <IconButton
            label="缩小"
            onClick={() => {
              setFit('manual');
              setScale((s) => clamp(s - 0.1, 0.25, 3));
            }}
          >
            <Minus size={15} />
          </IconButton>
          <button
            className="zoom-value"
            onClick={() => setFit((f) => (f === 'width' ? 'page' : 'width'))}
            title="切换适配宽度 / 适配页面"
          >
            {engine?.pdf ? Math.round(scale * 100) + '%' : '排版'}
            <ChevronDown size={11} />
          </button>
          <IconButton
            label="放大"
            onClick={() => {
              setFit('manual');
              setScale((s) => clamp(s + 0.1, 0.25, 3));
            }}
          >
            <Plus size={15} />
          </IconButton>
          <IconButton label="适配宽度" active={fit === 'width'} onClick={() => setFit('width')}>
            <Scan size={16} />
          </IconButton>
        </div>
        <div className="toolbar-group">
          <IconButton
            label="窗格目录"
            active={outlineOpen}
            onClick={() => setOutlineOpen((v) => !v)}
          >
            <ListTree size={16} />
          </IconButton>
          <IconButton
            label="文档内搜索"
            active={search !== null}
            onClick={() => setSearch((s) => (s === null ? '' : null))}
          >
            <Search size={16} />
          </IconButton>
          <IconButton
            label="添加书签"
            active={allNotes.some(
              (n) => n.docId === id && n.kind === 'bookmark' && n.anchor.page === page,
            )}
            onClick={() => addNote('bookmark')}
          >
            <Bookmark size={16} />
          </IconButton>
          <IconButton
            label="单页 / 双页"
            active={spread}
            disabled={!engine?.pdf}
            onClick={() => setSpread((s) => !s)}
          >
            <Columns2 size={16} />
          </IconButton>
          <IconButton
            label="连续 / 分页阅读"
            active={!continuous}
            onClick={() => setContinuous((v) => !v)}
          >
            <TextCursor size={16} />
          </IconButton>
          {!secondary && (
            <>
              <IconButton
                label="沉浸阅读"
                active={focus}
                onClick={() => useApp.setState({ focus: !focus })}
              >
                <Focus size={17} />
              </IconButton>
              <IconButton
                label="全屏阅读"
                onClick={() => {
                  if (document.fullscreenElement) void document.exitFullscreen();
                  else
                    void document.documentElement
                      .requestFullscreen()
                      .catch(() => useApp.getState().notify('当前窗口不支持全屏'));
                }}
              >
                <Maximize size={16} />
              </IconButton>
            </>
          )}
        </div>
      </div>
      {search !== null && (
        <div className="reader-search">
          <input
            autoFocus
            aria-label="搜索文档正文"
            placeholder={doc.indexed ? '搜索此文档…' : '正在建立全文索引…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span>{hits.length} 处</span>
          <button onClick={() => setSearch(null)}>关闭</button>
          {search && (
            <div className="search-dropdown">
              {hits.length ? (
                hits.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      navigateTo(id, { page: h.page, quote: search || '' });
                      setSearch(null);
                    }}
                  >
                    <b>第 {h.page} 页 / 节</b>
                    <span>{h.text}</span>
                  </button>
                ))
              ) : (
                <p>{doc.indexed ? '未找到匹配内容' : '索引中，请稍后重试'}</p>
              )}
            </div>
          )}
        </div>
      )}
      {outlineOpen && (
        <nav className="pane-outline outline">
          {engine?.outline.length ? (
            engine.outline.map((o, i) => (
              <button
                key={i}
                onClick={() => {
                  jump(o.page);
                  setOutlineOpen(false);
                }}
              >
                <span>{o.title}</span>
                <small>{o.page}</small>
              </button>
            ))
          ) : (
            <p className="muted">此文档没有内置目录。</p>
          )}
        </nav>
      )}
      {engine?.warning && <div className="reader-warning">{engine.warning}</div>}
      <div
        ref={scroll}
        className={`reader-scroll ${spread ? 'spread' : ''} ${settings.paper} ${ruler ? 'with-ruler' : ''}`}
        onScroll={onScroll}
        onMouseUp={selectText}
        onMouseMove={(e) => {
          if (ruler) setRulerY(e.clientY - (scroll.current?.getBoundingClientRect().top || 0));
        }}
        style={
          {
            '--reading-size': settings.fontSize * (!engine?.pdf ? scale : 1) + 'px',
            '--reading-line': settings.lineHeight,
            '--reading-width': settings.width + 'px',
            '--reading-margin': settings.margin + 'px',
            '--reading-font':
              settings.font === 'serif'
                ? '"Noto Serif SC", "Songti SC", "SimSun", Georgia, serif'
                : '"Segoe UI", "Microsoft YaHei", sans-serif',
          } as React.CSSProperties
        }
      >
        {error ? (
          <div className="state-message error">
            <p>这份文档暂时无法打开</p>
            <span>{error}</span>
            <button className="primary" onClick={() => onRelocate(id)}>
              重新定位原文件
            </button>
          </div>
        ) : !engine ? (
          <Loading />
        ) : (
          <div
            className="pages"
            style={engine.pdf ? undefined : { maxWidth: settings.width + settings.margin * 2 }}
          >
            {pages.map((n) => (
              <div key={id + n} className="page-wrap">
                <DocumentPage
                  engine={engine}
                  page={n}
                  scale={scale}
                  notes={pageNotes.get(n) || emptyNotes}
                  settings={settings}
                />
                <span className="page-number">{n}</span>
              </div>
            ))}
          </div>
        )}
        {ruler && (
          <div
            className="reading-ruler"
            style={{
              position: 'fixed',
              top: scroll.current?.getBoundingClientRect().top,
              left: scroll.current?.getBoundingClientRect().left,
              width: scroll.current?.clientWidth,
              height: scroll.current?.clientHeight,
              margin: 0,
              minHeight: 0,
              bottom: 'auto',
              background: `linear-gradient(to bottom, rgba(60,65,60,.16) ${rulerY - 28}px, transparent ${rulerY - 28}px, transparent ${rulerY + 28}px, rgba(60,65,60,.16) ${rulerY + 28}px)`,
            }}
          />
        )}
      </div>
      <footer className="reader-footer">
        <span>
          {doc.format.toUpperCase()}
          <i /> {doc.name}
        </span>
        <span>
          {!doc.indexed ? '索引中 · ' : ''}
          {Math.round(doc.progress * 100)}% 已读 <i />{' '}
          {engine?.pdf ? '原始页面 · 本地批注层' : '流式排版'}
        </span>
      </footer>
      {selection && !noteModal && (
        <div
          className="selection-toolbar"
          style={{ left: selection.x, top: selection.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {['#f2cf70', '#a8cbb6', '#a9c6ed', '#e9b6c6'].map((c) => (
            <button
              className={`color-dot ${c === color ? 'chosen' : ''}`}
              key={c}
              style={{ background: c }}
              aria-label={`标注颜色 ${c}`}
              onClick={() => setColor(c)}
            />
          ))}
          <i />
          <IconButton label="高亮选文" onClick={() => addNote('highlight')}>
            <Highlighter size={16} />
          </IconButton>
          <IconButton label="下划线选文" onClick={() => addNote('underline')}>
            <Underline size={16} />
          </IconButton>
          <IconButton label="批注选文" onClick={() => setNoteModal(true)}>
            <MessageSquare size={16} />
          </IconButton>
          <IconButton
            label="复制选文"
            onClick={() => {
              void navigator.clipboard
                .writeText(selection.anchor.quote)
                .then(() => useApp.getState().notify('已复制'));
              setSelection(null);
            }}
          >
            <Copy size={16} />
          </IconButton>
          <IconButton label="收藏灵感" onClick={() => addNote('excerpt')}>
            <Lightbulb size={16} />
          </IconButton>
        </div>
      )}
      <Modal open={noteModal} onClose={() => setNoteModal(false)} title="留下你的想法">
        <blockquote>{selection?.anchor.quote}</blockquote>
        <textarea
          autoFocus
          placeholder="这一段让你想到什么？"
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
        />
        <div className="modal-actions">
          <button className="primary" onClick={() => addNote('note', noteBody)}>
            保存批注
          </button>
        </div>
      </Modal>
    </section>
  );
}
