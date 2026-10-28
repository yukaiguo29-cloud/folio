import { navigateTo } from '../core/navigation';
import { useEffect, useState, useRef } from 'react';
import {
  ListTree,
  MessageSquare,
  Sparkles,
  Clock,
  LayoutGrid,
  Download,
  Trash2,
  Pencil,
  ArrowUpRight,
  Bookmark,
  Send,
  ShieldCheck,
  Square,
} from 'lucide-react';
import { useApp, mutate } from '../core/store';
import { repository } from '../core/database';
import { getEngine, notesMarkdown } from '../core/library';
import { download } from '../core/platform';
import { askAI, retrieve, endpointUrl } from '../core/ai';
import type { Source } from '../core/ai';
import type { ReadingEngine } from '../readers/engine';
import { DocumentPage } from '../readers/Page';
import type { Note, Anchor } from '../core/types';
import { IconButton, Empty, Modal, dateLabel } from './shared';
export function RightPanel() {
  const active = useApp((s) => s.active),
    doc = useApp((s) => s.docs.find((d) => d.id === s.active)),
    panel = useApp((s) => s.panel),
    allNotes = useApp((s) => s.notes),
    settings = useApp((s) => s.settings);
  const [engine, setEngine] = useState<ReadingEngine | null>(null),
    [editing, setEditing] = useState<Note | null>(null),
    [filter, setFilter] = useState('');
  useEffect(() => {
    setEngine(null);
    let cancelled = false;
    if (doc)
      getEngine(doc)
        .then((e) => {
          if (!cancelled) setEngine(e);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active, doc?.path]);
  const notes = allNotes.filter(
    (n) =>
      n.docId === active &&
      (n.body + ' ' + n.anchor.quote).toLowerCase().includes(filter.toLowerCase()),
  );
  const tabs = [
    ['outline', '目录', ListTree],
    ['notes', '笔记', MessageSquare],
    ['ai', 'AI 助手', Sparkles],
    ['history', '时光轴', Clock],
    ['thumbnails', '缩略图', LayoutGrid],
  ] as const;
  return (
    <aside className="right-panel">
      <div className="right-tabs">
        {tabs.map(([id, label, Icon]) => (
          <IconButton
            key={id}
            label={label}
            active={id === panel}
            onClick={() => useApp.setState({ panel: id })}
          >
            <Icon size={17} />
          </IconButton>
        ))}
      </div>
      <div className="right-heading">
        <h3>{tabs.find((t) => t[0] === panel)?.[1]}</h3>
        {panel === 'notes' && (
          <IconButton
            label="导出当前文档笔记"
            onClick={() =>
              download((doc?.name || '文档') + '-笔记.md', notesMarkdown(active || undefined))
            }
          >
            <Download size={15} />
          </IconButton>
        )}
      </div>
      <div className="right-content">
        {!doc ? (
          <Empty title="打开文档，开始探索" />
        ) : panel === 'outline' ? (
          engine?.outline.length ? (
            <nav className="outline">
              {engine.outline.map((o, i) => (
                <button
                  key={i}
                  className={o.page === doc.page ? 'current' : ''}
                  style={{ paddingLeft: 12 + Math.min(o.level - 1, 4) * 12 }}
                  onClick={() => {
                    navigateTo(doc.id, { page: o.page, quote: '' });
                  }}
                >
                  <span>{o.title}</span>
                  <small>{o.page}</small>
                </button>
              ))}
            </nav>
          ) : (
            <Empty title="这份文档没有内置目录">
              <p>你仍可以使用页码、搜索和书签导航。</p>
            </Empty>
          )
        ) : panel === 'notes' ? (
          <>
            <input
              className="panel-search"
              placeholder="搜索高亮、批注、书签…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <p className="panel-caption">{notes.length} 条记录 · 已保存于本地资料库</p>
            {notes.map((n) => (
              <article className="note-card" key={n.id}>
                <button
                  className="note-quote"
                  style={{ borderColor: n.color }}
                  onClick={() => navigateTo(doc.id, n.anchor)}
                >
                  {n.kind === 'bookmark' ? (
                    <>
                      <Bookmark size={15} />
                      书签 · 第 {n.anchor.page} 页
                    </>
                  ) : (
                    n.anchor.quote
                  )}
                </button>
                {n.body && <p>{n.body}</p>}
                <footer>
                  <button onClick={() => navigateTo(doc.id, n.anchor)}>
                    第 {n.anchor.page} 页 / 节<ArrowUpRight size={12} />
                  </button>
                  <div>
                    <IconButton label="编辑笔记" onClick={() => setEditing({ ...n })}>
                      <Pencil size={13} />
                    </IconButton>
                    <IconButton
                      label="删除笔记"
                      onClick={() => {
                        if (confirm('删除这条笔记？此操作无法撤销。'))
                          mutate(() => repository.deleteNote(n.id));
                      }}
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </footer>
              </article>
            ))}
            {!notes.length && (
              <Empty title="把思考，留在书页旁">
                <p>选择一段文字，即可高亮、批注或收藏摘录。工具栏中的书签可保存当前页。</p>
              </Empty>
            )}
          </>
        ) : panel === 'history' ? (
          <div className="timeline">
            {repository.events(doc.id).map((e) => (
              <article key={e.id}>
                <small>
                  {dateLabel(e.at)} ·{' '}
                  {new Date(e.at).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </small>
                <p>{e.text}</p>
              </article>
            ))}
          </div>
        ) : panel === 'thumbnails' ? (
          engine?.pdf ? (
            <div className="thumbnails">
              {Array.from({ length: engine.count }, (_, i) => (
                <button
                  className={doc.page === i + 1 ? 'current' : ''}
                  key={i}
                  aria-label={`跳转第 ${i + 1} 页`}
                  onClick={() => navigateTo(doc.id, { page: i + 1, quote: '' })}
                >
                  <DocumentPage
                    engine={engine}
                    page={i + 1}
                    scale={0.23}
                    notes={[]}
                    settings={settings}
                    thumbnail
                  />
                  <span>{i + 1}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty title="缩略图适用于 PDF">
              <p>其他文档可使用目录导航。</p>
            </Empty>
          )
        ) : (
          <AIPanel key={doc.id} docId={doc.id} page={doc.page} />
        )}
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="编辑笔记">
        {editing && (
          <>
            <blockquote>{editing.anchor.quote || '书签'}</blockquote>
            <textarea
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            />
            <div className="modal-actions">
              <button
                className="primary"
                onClick={() => {
                  mutate(() => repository.putNote(editing));
                  setEditing(null);
                }}
              >
                保存
              </button>
            </div>
          </>
        )}
      </Modal>
    </aside>
  );
}
function AIPanel({ docId, page }: { docId: string; page: number }) {
  const settings = useApp((s) => s.settings);
  const [selection, setSelection] = useState<{ id: string; anchor: Anchor } | null>(null),
    [mode, setMode] = useState('page'),
    [question, setQuestion] = useState(''),
    [sources, setSources] = useState<Source[] | null>(null),
    [response, setResponse] = useState(''),
    [used, setUsed] = useState<Source[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const selected = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSelection(detail);
      setMode('selection');
    };
    window.addEventListener('folio:selection', selected);
    return () => {
      window.removeEventListener('folio:selection', selected);
      controller.current?.abort();
    };
  }, []);
  if (!settings.aiEnabled)
    return (
      <div className="ai-intro">
        <Sparkles size={30} strokeWidth={1} />
        <h3>多一种理解的视角。</h3>
        <p>解释段落，提炼观点，或向原文提问。由你决定何时开启、发送哪些文字。</p>
        <button
          className="secondary-button"
          onClick={() => useApp.setState({ settingsOpen: true })}
        >
          配置 AI 服务
        </button>
        <small>
          <ShieldCheck size={14} />
          当前没有任何内容被发送
        </small>
      </div>
    );
  const prepare = async () => {
    setError('');
    try {
      endpointUrl(settings.endpoint);
      if (!settings.model.trim()) throw new Error('请先在设置中填写模型名称。');
      if (!question.trim()) throw new Error('先写下你的问题。');
      let context: Source[] = [];
      if (mode === 'selection') {
        if (selection?.id !== docId) throw new Error('请先在此文档中选择一段文字。');
        context = [{ page: selection.anchor.page, text: selection.anchor.quote.slice(0, 12000) }];
      } else if (mode === 'document') context = retrieve(docId, question, page);
      else {
        const doc = useApp.getState().docs.find((d) => d.id === docId)!;
        const engine = await getEngine(doc);
        context = [{ page, text: (await engine.text(page)).slice(0, 12000) }];
      }
      if (!context.length) throw new Error('暂无可用原文，请等待索引完成。');
      setSources(context);
    } catch (e) {
      setError(String(e));
    }
  };
  const send = async () => {
    if (!sources) return;
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setResponse('');
    setUsed(sources);
    setError('');
    setSources(null);
    try {
      const answer = await askAI(settings, question, sources, c.signal);
      if (!c.signal.aborted) setResponse(answer);
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (controller.current === c) setBusy(false);
    }
  };
  return (
    <div className="ai-panel">
      <div className="ai-service">
        <span className="status-dot" />
        {settings.model || '尚未配置模型'}
      </div>
      <label>
        提供的原文范围
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="page">当前页 / 章节</option>
          <option value="selection">选中的文本</option>
          <option value="document">文档检索（关键词）</option>
        </select>
      </label>
      {mode === 'selection' && selection?.id === docId && (
        <blockquote>{selection.anchor.quote.slice(0, 250)}</blockquote>
      )}
      <div className="ai-prompts">
        {['解释这段文字', '提取关键观点', '翻译为中文', '生成复习卡片'].map((q) => (
          <button key={q} onClick={() => setQuestion(q)}>
            {q}
          </button>
        ))}
      </div>
      <textarea
        placeholder="写下你想理解的问题…"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <button className="primary" disabled={busy} onClick={() => void prepare()}>
        <Send size={14} />
        查看发送内容
      </button>
      {busy && (
        <div className="ai-busy">
          正在等待模型回答…
          <button
            onClick={() => {
              controller.current?.abort();
              setBusy(false);
            }}
          >
            停止
            <Square size={12} />
          </button>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      {response && (
        <div className="ai-response">
          {response.split(/(\[页\d+\])/g).map((part, i) => {
            const match = part.match(/^\[页(\d+)\]$/);
            const n = Number(match?.[1]);
            return match ? (
              used.some((s) => s.page === n) ? (
                <button key={i} onClick={() => useApp.getState().updateDoc(docId, { page: n })}>
                  {part}
                </button>
              ) : (
                <span key={i}>[未核实引用]</span>
              )
            ) : (
              part
            );
          })}
          <small>回答来自配置的模型，请结合原文判断。</small>
        </div>
      )}
      <Modal
        open={sources !== null}
        onClose={() => setSources(null)}
        title="确认发送内容"
        description={`目标服务：${settings.endpoint} · 模型：${settings.model}`}
      >
        <p>仅发送以下原文、你的问题和阅读助手指令。本次问题：{question}</p>
        <div className="context-preview">
          {sources?.map((s, i) => (
            <section key={i}>
              <b>第 {s.page} 页 / 节</b>
              <pre>{s.text}</pre>
            </section>
          ))}
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={() => setSources(null)}>
            取消
          </button>
          <button className="primary" onClick={() => void send()}>
            发送并提问
          </button>
        </div>
      </Modal>
    </div>
  );
}
