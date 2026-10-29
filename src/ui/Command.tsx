import { navigateTo } from '../core/navigation';
import { useEffect, useState } from 'react';
import { Search, Command as CommandIcon, ArrowUpRight, FileText } from 'lucide-react';
import { useApp } from '../core/store';
import { shortcutModifier } from '../core/shortcuts';
import { repository } from '../core/database';
import type { SearchHit } from '../core/types';
import { Modal } from './shared';
export function Command({ onImport }: { onImport: () => void }) {
  const open = useApp((s) => s.command),
    docs = useApp((s) => s.docs),
    active = useApp((s) => s.active);
  const [q, setQ] = useState(''),
    [hits, setHits] = useState<SearchHit[]>([]),
    [cursor, setCursor] = useState(0);
  const close = () => useApp.setState({ command: false });
  const commands = [
    { name: '打开文档', keys: `${shortcutModifier} + O`, action: onImport },
    {
      name: '打开最近阅读',
      keys: '',
      action: () => useApp.setState({ active: null, view: 'recent' }),
    },
    {
      name: '切换深色主题',
      keys: '',
      action: () => useApp.getState().updateSettings({ theme: 'dark' }),
    },
    {
      name: '切换浅色主题',
      keys: '',
      action: () => useApp.getState().updateSettings({ theme: 'light' }),
    },
    { name: '开启沉浸阅读', keys: '', action: () => useApp.setState({ focus: true }) },
    { name: '退出沉浸阅读', keys: 'Esc', action: () => useApp.setState({ focus: false }) },
    {
      name: '查看全部高亮',
      keys: '',
      action: () => useApp.setState({ right: true, panel: 'notes' }),
    },
    {
      name: '开启双栏',
      keys: '',
      action: () => {
        const other = docs.find((d) => d.id !== active);
        if (other && active) useApp.setState({ split: other.id });
        else useApp.getState().notify('请先导入并打开两份文档');
      },
    },
    { name: '关闭双栏', keys: '', action: () => useApp.setState({ split: null }) },
    { name: '开启阅读尺', keys: '', action: () => useApp.setState({ ruler: true }) },
    { name: '关闭阅读尺', keys: '', action: () => useApp.setState({ ruler: false }) },
    { name: '打开设置', keys: `${shortcutModifier} + ,`, action: () => useApp.setState({ settingsOpen: true }) },
    { name: '打开知识关系图', keys: '', action: () => useApp.setState({ graphOpen: true, panel: 'graph' }) },
  ];
  const filtered = commands.filter((c) => !q || c.name.includes(q.trim()));
  const match = q.match(/^(?:跳转|跳到)?\s*第?\s*(\d+)\s*(?:页|章|节)?$/);
  const jump =
    match && active
      ? {
          name: `跳转第 ${match[1]} 页`,
          keys: '',
          action: () => {
            const d = docs.find((d) => d.id === active)!;
            navigateTo(active, {
              page: Math.max(1, Math.min(d.total, Number(match[1]))),
              quote: '',
            });
          },
        }
      : null;
  const actions = [...(jump ? [jump] : []), ...filtered];
  const results = [
    ...actions.map((c) => ({ title: c.name, sub: c.keys, type: 'command', run: c.action })),
    ...hits.map((h) => ({
      title: docs.find((d) => d.id === h.docId)?.name || '文档',
      sub: h.text,
      type: h.kind,
      run: () => navigateTo(h.docId, { page: h.page, quote: q }),
    })),
  ];
  useEffect(() => {
    if (open) {
      setQ('');
      setCursor(0);
    }
  }, [open]);
  useEffect(() => {
    setCursor(0);
    const t = setTimeout(() => setHits(repository.search(q)), 120);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Modal open={open} onClose={close} title="专注指挥中心" wide>
      <div className="command-search">
        <Search size={20} />
        <input
          autoFocus
          placeholder="搜索文档、笔记，或输入「跳转第 48 页」"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(results.length - 1, c + 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            }
            if (e.key === 'Enter' && results[cursor]) {
              results[cursor].run();
              close();
            }
          }}
        />
        <kbd>ESC</kbd>
      </div>
      <div className="command-results">
        {results.length ? (
          results.map((r, i) => (
            <button
              className={cursor === i ? 'selected' : ''}
              key={i}
              onMouseEnter={() => setCursor(i)}
              onClick={() => {
                r.run();
                close();
              }}
            >
              {r.type === 'command' ? <CommandIcon size={17} /> : <FileText size={17} />}
              <div>
                <strong>{r.title}</strong>
                {r.sub && <span>{r.sub}</span>}
              </div>
              <ArrowUpRight size={14} />
            </button>
          ))
        ) : (
          <p className="empty-inline">未找到结果。已索引的正文、笔记与标签都可搜索。</p>
        )}
      </div>
      <div className="command-footer">
        <span>↑ ↓ 选择</span>
        <span>↵ 打开</span>
        <span>本地搜索 · 无需联网</span>
      </div>
    </Modal>
  );
}
