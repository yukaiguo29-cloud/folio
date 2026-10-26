import { navigateTo } from '../core/navigation';
import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Plus,
  FolderOpen,
  ArrowDownToLine,
  LayoutGrid,
  List,
  Search,
  Star,
  MoreHorizontal,
  BookOpen,
  Clock,
  Lightbulb,
  ArrowRight,
} from 'lucide-react';
import { useApp, mutate } from '../core/store';
import { repository } from '../core/database';
import { removeDocument, notesMarkdown } from '../core/library';
import { download } from '../core/platform';
import type { FolioDocument } from '../core/types';
import { IconButton, Modal, Empty, dateLabel } from './shared';
const titles: Record<string, [string, string]> = {
  all: ['我的资料库', '每一页，都通向新的发现。'],
  recent: ['最近阅读', '把思绪接回上一次停下的地方。'],
  favorites: ['我的收藏', '值得反复打开的文字。'],
  inbox: ['灵感收集箱', '让散落在不同书页间的想法，在这里相遇。'],
  stats: ['阅读足迹', '记录每一次安静而专注的投入。'],
};
export function Library({
  onImport,
  onFolder,
  onGuide,
}: {
  onImport: () => void;
  onFolder: () => void;
  onGuide: () => void;
}) {
  const docs = useApp((s) => s.docs),
    view = useApp((s) => s.view),
    notes = useApp((s) => s.notes);
  const [query, setQuery] = useState(''),
    [sort, setSort] = useState('recent'),
    [format, setFormat] = useState('all'),
    [status, setStatus] = useState('all'),
    [grid, setGrid] = useState(true),
    [detail, setDetail] = useState<string | null>(null),
    [listScroll, setListScroll] = useState(0),
    [showWelcome, setShowWelcome] = useState(true);
  const [title, subtitle] = titles[view] || [
    view.startsWith('tag:') ? '标签 · ' + view.slice(4) : view,
    '一个属于你的阅读空间。',
  ];
  const filtered = useMemo(
    () =>
      docs
        .filter(
          (d) =>
            (view === 'favorites'
              ? d.favorite
              : view === 'recent'
                ? d.opened > 0
                : view.startsWith('tag:')
                  ? d.tags.includes(view.slice(4))
                  : !titles[view]
                    ? d.shelf === view
                    : true) &&
            `${d.name} ${d.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()) &&
            (format === 'all' || d.format === format) &&
            (status === 'all' || d.status === status),
        )
        .sort((a, b) =>
          sort === 'name'
            ? a.name.localeCompare(b.name, 'zh')
            : sort === 'added'
              ? b.added - a.added
              : sort === 'format'
                ? a.format.localeCompare(b.format)
                : sort === 'progress'
                  ? b.progress - a.progress
                  : b.opened - a.opened || b.added - a.added,
        ),
    [docs, view, query, format, status, sort],
  );
  const current = docs.find((d) => d.id === detail);
  const stats = repository.stats();
  const excerpts = notes.filter(
    (n) =>
      n.kind === 'excerpt' &&
      `${n.anchor.quote} ${n.body} ${docs.find((d) => d.id === n.docId)?.name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <main className="library-main">
      <div className="library-topline">
        <span>你的个人阅读空间</span>
        <span className="local-badge">
          <span />
          本地优先 · 安心阅读
        </span>
      </div>
      <div className="library-heading">
        <div>
          <div className="eyebrow">A LITTLE SPACE FOR BIG IDEAS</div>
          <h1>
            {title}
            <span className="count">
              {view === 'inbox' ? excerpts.length : view === 'stats' ? '' : filtered.length}
            </span>
          </h1>
          <p>{subtitle}</p>
        </div>
        <button className="primary" onClick={onImport}>
          <Plus size={16} />
          导入文档
        </button>
      </div>
      {view === 'stats' ? (
        <>
          <div className="stats-grid">
            <div>
              <Clock size={20} />
              <strong>
                {Math.floor(stats.seconds / 60)}
                <small> 分钟</small>
              </strong>
              <span>本周阅读时长</span>
            </div>
            <div>
              <BookOpen size={20} />
              <strong>
                {stats.count}
                <small> 份</small>
              </strong>
              <span>本周阅读文档</span>
            </div>
            <div>
              <Star size={20} />
              <strong>
                {stats.finished}
                <small> 份</small>
              </strong>
              <span>已完成阅读</span>
            </div>
          </div>
          <section className="trend">
            <h2>最近七天</h2>
            <div className="bars">
              {stats.days.map((d) => (
                <div key={d.at} title={`${dateLabel(d.at)} · ${Math.floor(d.seconds / 60)} 分钟`}>
                  <span>{Math.floor(d.seconds / 60)}m</span>
                  <i
                    style={{
                      height: Math.max(
                        3,
                        (d.seconds / Math.max(60, ...stats.days.map((x) => x.seconds))) * 130,
                      ),
                    }}
                  />
                  <label>{new Date(d.at).toLocaleDateString('zh-CN', { weekday: 'short' })}</label>
                </div>
              ))}
            </div>
            <p className="muted">仅记录窗口处于前台、且最近 90 秒内有操作的阅读时间。</p>
          </section>
        </>
      ) : view === 'inbox' ? (
        <>
          <div className="library-filters">
            <label className="filter-search">
              <Search size={16} />
              <input
                placeholder="搜索灵感与来源…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button
              className="subtle-button"
              onClick={() => download('Folio-灵感收集箱.md', notesMarkdown())}
            >
              <ArrowDownToLine size={15} />
              导出 Markdown
            </button>
          </div>
          <div className="excerpt-grid">
            {excerpts.map((n) => (
              <article className="excerpt-card" key={n.id}>
                <Lightbulb size={17} />
                <blockquote>{n.anchor.quote}</blockquote>
                {n.body && <p>{n.body}</p>}
                <button onClick={() => navigateTo(n.docId, n.anchor)}>
                  {docs.find((d) => d.id === n.docId)?.name} · {n.anchor.page}
                  <ArrowUpRight size={14} />
                </button>
                <small>{dateLabel(n.created)}</small>
              </article>
            ))}
          </div>
          {!excerpts.length && (
            <Empty title="留住让你停顿的那句话">
              <p>阅读时选择文本，点击「收藏灵感」，摘录会自动来到这里。</p>
            </Empty>
          )}
        </>
      ) : (
        <>
          {!docs.length && view === 'all' && showWelcome ? (
            <section className="welcome">
              <div className="book-sculpture">
                <div className="book-leaf leaf-a" />
                <div className="book-leaf leaf-b" />
                <div className="book-leaf leaf-c" />
                <span>F</span>
              </div>
              <div className="eyebrow">LESS NOISE. MORE READING.</div>
              <h2>
                打开一本书，
                <br />
                开始一段思考。
              </h2>
              <p>给阅读一点留白，让知识自然沉淀。</p>
              <div className="welcome-actions">
                <button className="primary" onClick={onImport}>
                  <BookOpen size={17} />
                  打开文档
                </button>
                <button className="secondary-button" onClick={onFolder}>
                  <FolderOpen size={17} />
                  导入文件夹
                </button>
                <button className="subtle-button" onClick={() => setShowWelcome(false)}>
                  浏览阅读资料库
                </button>
              </div>
              <button className="guide-link" onClick={onGuide}>
                阅读 Folio 使用指南
                <ArrowRight size={14} />
              </button>
              <span className="supported-formats">PDF · EPUB · DOCX · Markdown · TXT · HTML</span>
            </section>
          ) : (
            <>
              {view === 'all' && !query && docs.some((d) => d.opened > 0) && (
                <section className="continue-reading">
                  <div className="section-label">接着上次的思考</div>
                  <button
                    onClick={() => {
                      const d = [...docs].sort((a, b) => b.opened - a.opened)[0];
                      useApp.getState().open(d.id);
                    }}
                  >
                    <div className="mini-book">
                      <BookOpen size={24} />
                    </div>
                    <div>
                      <h3>{[...docs].sort((a, b) => b.opened - a.opened)[0].name}</h3>
                      <p>
                        从第 {[...docs].sort((a, b) => b.opened - a.opened)[0].page} 页 / 节继续 ·
                        已读{' '}
                        {Math.round(
                          [...docs].sort((a, b) => b.opened - a.opened)[0].progress * 100,
                        )}
                        %
                      </p>
                    </div>
                    <span>
                      继续阅读 <ArrowUpRight size={16} />
                    </span>
                  </button>
                </section>
              )}
              <div className="library-filters">
                <label className="filter-search">
                  <Search size={16} />
                  <input
                    aria-label="筛选资料库"
                    placeholder="查找文档、标签…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <div className="filter-options">
                  <select
                    aria-label="文件类型"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    <option value="all">所有格式</option>
                    {['pdf', 'epub', 'docx', 'md', 'txt', 'html'].map((f) => (
                      <option key={f} value={f}>
                        {f.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="阅读状态"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="all">所有状态</option>
                    <option value="unread">未读</option>
                    <option value="reading">阅读中</option>
                    <option value="finished">已完成</option>
                  </select>
                  <select
                    aria-label="文档排序"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="recent">最近阅读</option>
                    <option value="added">导入时间</option>
                    <option value="name">名称</option>
                    <option value="format">格式</option>
                    <option value="progress">阅读进度</option>
                  </select>
                  <div className="view-toggle">
                    <IconButton
                      label="网格视图"
                      disabled={filtered.length > 120}
                      active={grid && filtered.length <= 120}
                      onClick={() => setGrid(true)}
                    >
                      <LayoutGrid size={16} />
                    </IconButton>
                    <IconButton
                      label="列表视图"
                      active={!grid || filtered.length > 120}
                      onClick={() => setGrid(false)}
                    >
                      <List size={17} />
                    </IconButton>
                  </div>
                </div>
              </div>
              {filtered.length > 120 ? (
                <div
                  className="document-list virtual-list"
                  onScroll={(e) => setListScroll(e.currentTarget.scrollTop)}
                >
                  <div style={{ height: filtered.length * 88, position: 'relative' }}>
                    {filtered
                      .slice(
                        Math.max(0, Math.floor(listScroll / 88) - 4),
                        Math.floor(listScroll / 88) + 13,
                      )
                      .map((d, i) => (
                        <div
                          key={d.id}
                          style={{
                            position: 'absolute',
                            height: 88,
                            left: 0,
                            right: 0,
                            top: (Math.max(0, Math.floor(listScroll / 88) - 4) + i) * 88,
                          }}
                        >
                          <DocumentCard doc={d} onDetail={() => setDetail(d.id)} />
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <div className={grid ? 'document-grid' : 'document-list'}>
                  {filtered.map((d) => (
                    <DocumentCard key={d.id} doc={d} onDetail={() => setDetail(d.id)} />
                  ))}
                </div>
              )}
              {!filtered.length && (
                <Empty title="这里还没有文档">
                  <p>导入文档，或调整筛选条件。</p>
                  <button className="subtle-button" onClick={onImport}>
                    打开文档
                    <ArrowUpRight size={14} />
                  </button>
                </Empty>
              )}
            </>
          )}
          <div className="library-footnote">
            <span>所有美好的思考，都始于专注的一页。</span>
            <span>
              {docs.length} 份文档 · {notes.filter((n) => n.kind !== 'bookmark').length} 条笔记
            </span>
          </div>
        </>
      )}
      <Modal
        open={!!current}
        onClose={() => setDetail(null)}
        title="文档详情"
        description={current?.name}
      >
        {current && <DocumentDetail doc={current} onClose={() => setDetail(null)} />}
      </Modal>
    </main>
  );
}
function DocumentCard({ doc: d, onDetail }: { doc: FolioDocument; onDetail: () => void }) {
  return (
    <article className={`document-card format-${d.format}`}>
      <button
        className="document-open"
        onClick={() => useApp.getState().open(d.id)}
        aria-label={`阅读 ${d.name}`}
      >
        <div className={`document-cover ${d.cover ? 'has-preview' : ''}`}>
          {d.cover && <img src={d.cover} alt="文档首页预览" loading="lazy" />}
          <span className="cover-format">{d.format.toUpperCase()}</span>
          <div className="cover-lines" />
          <strong>{d.name.replace(/\.[^.]+$/, '')}</strong>
          <span className="cover-imprint">知间阅读 / FOLIO</span>
          <BookOpen className="cover-icon" size={80} strokeWidth={0.6} />
        </div>
        <div className="document-description">
          <h3 title={d.name}>{d.name}</h3>
          <p>
            {d.status === 'finished'
              ? '已完成'
              : d.status === 'reading'
                ? `已读 ${Math.round(d.progress * 100)}%`
                : '尚未阅读'}
            <span> · {d.format.toUpperCase()}</span>
          </p>
          <div className="progress-track">
            <i style={{ width: Math.round(d.progress * 100) + '%' }} />
          </div>
        </div>
      </button>
      <div className="document-card-actions">
        <IconButton
          label={`收藏 ${d.name}`}
          active={d.favorite}
          onClick={() => useApp.getState().updateDoc(d.id, { favorite: !d.favorite })}
        >
          <Star size={15} fill={d.favorite ? 'currentColor' : 'none'} />
        </IconButton>
        <IconButton label={`${d.name} 的详情`} onClick={onDetail}>
          <MoreHorizontal size={18} />
        </IconButton>
      </div>
    </article>
  );
}
function DocumentDetail({ doc: d, onClose }: { doc: FolioDocument; onClose: () => void }) {
  const [tags, setTags] = useState(d.tags.join(', '));
  const settings = useApp((s) => s.settings);
  return (
    <div className="detail-form">
      <dl>
        <dt>文件来源</dt>
        <dd>{d.path || '浏览器本地副本（IndexedDB）'}</dd>
        <dt>文件大小</dt>
        <dd>{(d.size / 1024 / 1024).toFixed(2)} MB</dd>
        <dt>导入时间</dt>
        <dd>{dateLabel(d.added)}</dd>
        <dt>全文索引</dt>
        <dd>{d.indexed ? '已完成' : '等待处理'}</dd>
      </dl>
      <label>
        标签（逗号分隔）
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          onBlur={() =>
            useApp.getState().updateDoc(d.id, {
              tags: tags
                .split(/[,，]/)
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      <label>
        书架 / 工作台
        <select
          value={d.shelf}
          onChange={(e) => useApp.getState().updateDoc(d.id, { shelf: e.target.value })}
        >
          <option value="">未分类</option>
          {settings.shelves.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        阅读状态
        <select
          value={d.status}
          onChange={(e) =>
            useApp.getState().updateDoc(d.id, { status: e.target.value as FolioDocument['status'] })
          }
        >
          <option value="unread">未读</option>
          <option value="reading">阅读中</option>
          <option value="finished">已完成</option>
        </select>
      </label>
      <div className="modal-actions">
        <button
          className="danger-button"
          onClick={() => {
            if (confirm(`从资料库移除「${d.name}」及其全部笔记？原文件不会被删除。`)) {
              void removeDocument(d.id);
              onClose();
            }
          }}
        >
          移出资料库
        </button>
        <button
          className="primary"
          onClick={() => {
            mutate(() =>
              repository.putDocument({
                ...d,
                tags: tags
                  .split(/[,，]/)
                  .map((t) => t.trim())
                  .filter(Boolean),
              }),
            );
            onClose();
          }}
        >
          完成
        </button>
      </div>
    </div>
  );
}
