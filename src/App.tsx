import { useEffect, useRef, useState } from 'react';
import {
  Library as LibraryIcon,
  Clock,
  Star,
  Lightbulb,
  ChartNoAxesColumn,
  Plus,
  Settings as SettingsIcon,
  Search,
  PanelLeftClose,
  PanelRightClose,
  PanelLeft,
  PanelRight,
  Sun,
  Moon,
  Home,
  X,
  Columns2,
  Check,
  CloudOff,
  Folder,
  Tag,
  BookOpen,
  Focus,
  ArrowLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { initDatabase, repository, flush, persist } from './core/database';
import { createCloseHandler } from './core/desktop-close';
import { useApp } from './core/store';
import { desktop, pickNative, nativeDrop, readDatabase, download } from './core/platform';
import { importFiles, releaseEngines } from './core/library';
import { Reader } from './readers/Reader';
import { Library } from './ui/Library';
import { Settings } from './ui/Settings';
import { RightPanel } from './ui/RightPanel';
import { Command } from './ui/Command';
import { IconButton, Logo, Modal, Loading } from './ui/shared';
import type { ImportFile } from './core/platform';
export default function App() {
  const s = useApp(),
    fileInput = useRef<HTMLInputElement>(null),
    folderInput = useRef<HTMLInputElement>(null),
    relocate = useRef<string | undefined>(undefined);
  const [initError, setInitError] = useState(''),
    [busy, setBusy] = useState(''),
    [drag, setDrag] = useState(false),
    [shelfModal, setShelfModal] = useState(false),
    [shelfName, setShelfName] = useState(''),
    [splitPicker, setSplitPicker] = useState(false),
    [splitRatio, setSplitRatio] = useState(50);
  const active = s.docs.find((d) => d.id === s.active);
  const tabs = s.tabs.map((id) => s.docs.find((d) => d.id === id)).filter((d) => !!d);
  const reading = s.active !== null;
  const minimized = s.focus || (!s.left && !s.right && reading);
  useEffect(() => {
    void initDatabase()
      .then(() => {
        s.refresh();
        useApp.setState({ ready: true });
        const last = localStorage.getItem('folio-last');
        if (last && repository.documents().some((d) => d.id === last)) useApp.getState().open(last);
      })
      .catch((e) => setInitError(String(e)));
    const saved = () => useApp.setState({ saved: true }),
      error = (e: Event) => {
        useApp.setState({ saved: false });
        useApp
          .getState()
          .notify('本地保存失败，请立即导出数据库备份。' + String((e as CustomEvent).detail || ''));
      };
    window.addEventListener('folio:saved', saved);
    window.addEventListener('folio:save-error', error);
    const visibility = () => {
      if (document.visibilityState === 'hidden' && useApp.getState().ready)
        void flush().catch(() => {});
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('folio:saved', saved);
      window.removeEventListener('folio:save-error', error);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    const dark =
      s.settings.theme === 'dark' ||
      (s.settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.setProperty('--accent', s.settings.accent);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = () => {
      if (useApp.getState().settings.theme === 'system')
        document.documentElement.dataset.theme = media.matches ? 'dark' : 'light';
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [s.settings.theme, s.settings.accent]);
  const process = async (files: ImportFile[]) => {
    setBusy(`正在导入 ${files.length} 份文档…`);
    try {
      await importFiles(files, relocate.current);
    } catch (e) {
      s.notify('导入失败：' + String(e));
    } finally {
      setBusy('');
      relocate.current = undefined;
    }
  };
  const pick = async (folder = false, id?: string) => {
    relocate.current = id;
    if (desktop) {
      try {
        setBusy('等待选择文件…');
        await process(await pickNative(folder));
      } catch (e) {
        s.notify(String(e));
      } finally {
        setBusy('');
      }
    } else (folder ? folderInput : fileInput).current?.click();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useApp.setState({ command: !useApp.getState().command });
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void pick();
      }
      if (mod && e.key === ',') {
        e.preventDefault();
        useApp.setState({ settingsOpen: true });
      }
      if (mod && e.key.toLowerCase() === 'w' && useApp.getState().active) {
        e.preventDefault();
        useApp.getState().close(useApp.getState().active!);
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        useApp.setState({ focus: !useApp.getState().focus });
      }
      if (e.key === 'Escape') {
        useApp.setState({ focus: false });
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    let lastAction = Date.now(),
      lastTick = Date.now(),
      lastPage = 0;
    const activity = () => (lastAction = Date.now());
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel'];
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    const timer = setInterval(() => {
      const now = Date.now(),
        elapsed = Math.min(15, Math.max(0, (now - lastTick) / 1000));
      lastTick = now;
      const st = useApp.getState();
      if (
        st.ready &&
        st.active &&
        document.visibilityState === 'visible' &&
        document.hasFocus() &&
        now - lastAction < 90000
      ) {
        repository.tick(st.active, Math.round(elapsed));
        persist();
        const doc = st.docs.find((d) => d.id === st.active);
        if (doc && lastPage !== doc.page) {
          lastPage = doc.page;
          st.updateDoc(doc.id, {
            status: doc.status === 'unread' ? 'reading' : doc.status,
            progress: doc.total === 1 ? 1 : doc.page / doc.total,
          });
        }
      }
    }, 15000);
    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, activity));
    };
  }, []);
  useEffect(() => {
    void releaseEngines([...s.tabs, ...(s.split ? [s.split] : [])]);
  }, [s.tabs, s.split]);
  useEffect(() => {
    if (!desktop) return;
    let stop: (() => void) | undefined,
      cancelled = false;
    void import('@tauri-apps/api/webview').then(async ({ getCurrentWebview }) => {
      const unlisten = await getCurrentWebview().onDragDropEvent((e) => {
        if (e.payload.type === 'over') setDrag(true);
        if (e.payload.type === 'leave') setDrag(false);
        if (e.payload.type === 'drop') {
          setDrag(false);
          void nativeDrop(e.payload.paths)
            .then(process)
            .catch((e) => s.notify(String(e)));
        }
      });
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  useEffect(() => {
    if (!desktop) return;
    let stop: (() => void) | undefined,
      cancelled = false;
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const window = getCurrentWindow();
      const unlisten = await window.onCloseRequested(
        createCloseHandler({
          isReady: () => useApp.getState().ready,
          save: flush,
          destroy: () => window.destroy(),
          onError: (stage, error) =>
            useApp
              .getState()
              .notify(
                stage === 'save'
                  ? '资料库保存失败，窗口已保留。请导出备份后重试关闭。'
                  : '资料已保存，但关闭窗口失败：' + String(error),
              ),
        }),
      );
      if (cancelled) unlisten();
      else stop = unlisten;
      void initDatabase()
        .then(() => {
          if (!cancelled) return window.emit('folio:close-listener-ready');
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  const resize = (side: 'left' | 'right', event: React.PointerEvent) => {
    event.preventDefault();
    const start = event.clientX,
      original = side === 'left' ? s.settings.leftWidth : s.settings.rightWidth;
    const move = (e: PointerEvent) => {
      const value = Math.max(
        190,
        Math.min(420, original + (e.clientX - start) * (side === 'left' ? 1 : -1)),
      );
      useApp
        .getState()
        .updateSettings(side === 'left' ? { leftWidth: value } : { rightWidth: value });
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };
  const navigate = (view: string) => {
    useApp.setState({ view, active: null });
    localStorage.removeItem('folio-last');
  };
  const guide = async () => {
    try {
      const r = await fetch('/guide.md');
      await process([
        { name: '欢迎来到知间 · Folio.md', bytes: new Uint8Array(await r.arrayBuffer()) },
      ]);
    } catch (e) {
      s.notify(String(e));
    }
  };
  if (initError)
    return (
      <div className="fatal">
        <Logo />
        <h1>资料库暂时无法载入</h1>
        <p>{initError}</p>
        <button
          onClick={() => {
            void readDatabase().then((b) => {
              if (b) download('Folio-recovery.sqlite', b, 'application/vnd.sqlite3');
            });
          }}
        >
          导出原始数据以便恢复
        </button>
        <p>未覆盖或重置你的原有数据。</p>
      </div>
    );
  if (!s.ready) return <Loading text="正在整理你的阅读空间…" />;
  return (
    <div
      className={`app ${minimized ? 'immersive' : ''}`}
      onDragOver={(e) => {
        if (!desktop) {
          e.preventDefault();
          setDrag(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
      }}
      onDrop={(e) => {
        if (desktop) return;
        e.preventDefault();
        setDrag(false);
        const files = Array.from(e.dataTransfer.files);
        void Promise.all(
          files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
        ).then(process);
      }}
    >
      <input
        type="file"
        multiple
        accept=".pdf,.epub,.docx,.txt,.md,.markdown,.html,.htm"
        ref={fileInput}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          void Promise.all(
            files.map(async (f) => ({
              name: f.name,
              bytes: new Uint8Array(await f.arrayBuffer()),
            })),
          ).then(process);
          e.target.value = '';
        }}
      />
      <input
        type="file"
        multiple
        {...{ webkitdirectory: '' }}
        ref={folderInput}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files || []).filter((f) =>
            /\.(pdf|epub|docx|txt|md|markdown|html|htm)$/i.test(f.name),
          );
          void Promise.all(
            files.map(async (f) => ({
              name: f.name,
              bytes: new Uint8Array(await f.arrayBuffer()),
            })),
          ).then(process);
          e.target.value = '';
        }}
      />
      <AnimatePresence>
        {s.left && !s.focus && (
          <motion.aside
            className="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: s.settings.leftWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            <button
              className="brand-home"
              onClick={() => navigate('all')}
              aria-label="Folio 资料库首页"
            >
              <Logo />
            </button>
            <button className="sidebar-search" onClick={() => useApp.setState({ command: true })}>
              <Search size={15} />
              <span>搜索与命令</span>
              <kbd>⌘ K</kbd>
            </button>
            <div className="sidebar-group-label">阅读空间</div>
            <nav className="main-nav">
              {[
                ['all', '全部文档', LibraryIcon, s.docs.length],
                ['recent', '最近阅读', Clock, s.docs.filter((d) => d.opened > 0).length],
                ['favorites', '我的收藏', Star, s.docs.filter((d) => d.favorite).length],
                [
                  'inbox',
                  '灵感收集箱',
                  Lightbulb,
                  s.notes.filter((n) => n.kind === 'excerpt').length,
                ],
                ['stats', '阅读足迹', ChartNoAxesColumn, ''],
              ].map(([id, label, Icon, count]) => {
                const I = Icon as typeof LibraryIcon;
                return (
                  <button
                    key={String(id)}
                    className={!reading && s.view === id ? 'selected' : ''}
                    onClick={() => navigate(String(id))}
                  >
                    <I size={17} />
                    <span>{String(label)}</span>
                    {count !== '' && <small>{String(count)}</small>}
                  </button>
                );
              })}
            </nav>
            <div className="sidebar-group-label">
              书架与工作台
              <IconButton label="新建书架或工作台" onClick={() => setShelfModal(true)}>
                <Plus size={14} />
              </IconButton>
            </div>
            <nav className="shelf-nav">
              {s.settings.shelves.map((name) => (
                <button
                  key={name}
                  className={!reading && s.view === name ? 'selected' : ''}
                  onClick={() => navigate(name)}
                >
                  <Folder size={16} />
                  <span>{name}</span>
                </button>
              ))}
              {!s.settings.shelves.length && (
                <button className="new-shelf" onClick={() => setShelfModal(true)}>
                  <Plus size={15} />
                  创建一个阅读空间
                </button>
              )}
            </nav>
            {Array.from(new Set(s.docs.flatMap((d) => d.tags))).length > 0 && (
              <>
                <div className="sidebar-group-label">标签</div>
                <nav className="shelf-nav">
                  {Array.from(new Set(s.docs.flatMap((d) => d.tags))).map((tag) => (
                    <button key={tag} onClick={() => navigate('tag:' + tag)}>
                      <Tag size={14} />
                      <span>{tag}</span>
                    </button>
                  ))}
                </nav>
              </>
            )}
            <div className="sidebar-spacer" />
            <div className="sidebar-bottom">
              <span>
                <CloudOff size={14} />
                只属于你的阅读空间
              </span>
              <button onClick={() => useApp.setState({ settingsOpen: true })}>
                <SettingsIcon size={17} />
                设置<small>⌘ ,</small>
              </button>
            </div>
            <div
              className="panel-resizer left"
              role="separator"
              aria-label="调整资料库宽度"
              onPointerDown={(e) => resize('left', e)}
            />
          </motion.aside>
        )}
      </AnimatePresence>
      <div className="workspace">
        <header className="app-header">
          <div className="header-start">
            <IconButton
              label={s.left ? '隐藏资料库' : '显示资料库'}
              onClick={() => useApp.setState({ left: !s.left, focus: false })}
            >
              {s.left ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
            </IconButton>
            {reading ? (
              <IconButton label="返回资料库" onClick={() => navigate(s.view)}>
                <Home size={17} />
              </IconButton>
            ) : (
              <span className="header-breadcrumb">
                知间 <span>/</span> 阅读空间
              </span>
            )}
          </div>
          <div className="document-tabs">
            {reading &&
              tabs.map((d) => (
                <div className={`document-tab ${d.id === s.active ? 'selected' : ''}`} key={d.id}>
                  <button onClick={() => s.open(d.id)}>
                    <BookOpen size={13} />
                    <span>{d.name}</span>
                  </button>
                  <IconButton label={`关闭 ${d.name}`} onClick={() => s.close(d.id)}>
                    <X size={12} />
                  </IconButton>
                </div>
              ))}
          </div>
          <div className="header-end">
            {reading && (
              <>
                <IconButton
                  label="双文档对照"
                  active={!!s.split}
                  onClick={() =>
                    s.split ? useApp.setState({ split: null }) : setSplitPicker(true)
                  }
                >
                  <Columns2 size={17} />
                </IconButton>
                <IconButton
                  label="专注模式"
                  active={s.focus}
                  onClick={() => useApp.setState({ focus: !s.focus })}
                >
                  <Focus size={17} />
                </IconButton>
              </>
            )}
            <IconButton
              label="切换主题"
              onClick={() =>
                s.updateSettings({
                  theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark',
                })
              }
            >
              {document.documentElement.dataset.theme === 'dark' ? (
                <Sun size={17} />
              ) : (
                <Moon size={17} />
              )}
            </IconButton>
            <IconButton label="打开设置" onClick={() => useApp.setState({ settingsOpen: true })}>
              <SettingsIcon size={17} />
            </IconButton>
            {reading && (
              <IconButton
                label={s.right ? '隐藏辅助面板' : '显示辅助面板'}
                onClick={() => useApp.setState({ right: !s.right, focus: false })}
              >
                {s.right ? <PanelRightClose size={18} /> : <PanelRight size={18} />}
              </IconButton>
            )}
          </div>
        </header>
        <div className="workspace-body">
          {active ? (
            <>
              <div
                className="readers"
                style={{ '--split': splitRatio + '%' } as React.CSSProperties}
              >
                <div className="primary-reader">
                  <Reader
                    key={active.id}
                    id={active.id}
                    onRelocate={(id) => void pick(false, id)}
                  />
                </div>
                {s.split && s.docs.some((d) => d.id === s.split) && (
                  <>
                    <div
                      className="split-resizer"
                      role="separator"
                      aria-label="调整对照分屏比例"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        const root = e.currentTarget.parentElement!;
                        const move = (ev: PointerEvent) => {
                          const r = root.getBoundingClientRect();
                          setSplitRatio(
                            Math.max(25, Math.min(75, ((ev.clientX - r.left) / r.width) * 100)),
                          );
                        };
                        const end = () => {
                          window.removeEventListener('pointermove', move);
                          window.removeEventListener('pointerup', end);
                        };
                        window.addEventListener('pointermove', move);
                        window.addEventListener('pointerup', end);
                      }}
                    />
                    <div className="secondary-reader">
                      <div className="split-title">
                        <select
                          aria-label="对照文档"
                          value={s.split}
                          onChange={(e) => useApp.setState({ split: e.target.value })}
                        >
                          {s.docs
                            .filter((d) => d.id !== active.id)
                            .map((d) => (
                              <option value={d.id} key={d.id}>
                                {d.name}
                              </option>
                            ))}
                        </select>
                        <IconButton
                          label="关闭对照"
                          onClick={() => useApp.setState({ split: null })}
                        >
                          <X size={14} />
                        </IconButton>
                      </div>
                      <Reader
                        key={s.split}
                        id={s.split}
                        secondary
                        onRelocate={(id) => void pick(false, id)}
                      />
                    </div>
                  </>
                )}
              </div>
              {s.right && !s.focus && (
                <div className="right-container" style={{ width: s.settings.rightWidth }}>
                  <div
                    className="panel-resizer right"
                    role="separator"
                    aria-label="调整辅助面板宽度"
                    onPointerDown={(e) => resize('right', e)}
                  />
                  <RightPanel />
                </div>
              )}
            </>
          ) : (
            <Library
              onImport={() => void pick()}
              onFolder={() => void pick(true)}
              onGuide={() => void guide()}
            />
          )}
        </div>
        <div className="app-status">
          <span>
            <span className="status-dot" />
            {desktop ? '桌面本地资料库' : '浏览器本地资料库'}
            <span className="status-separator" />
            AI {s.settings.aiEnabled ? '按需开启' : '已关闭'}
          </span>
          <span>
            {s.saved ? (
              <>
                <Check size={12} />
                已保存
              </>
            ) : (
              <>正在保存…</>
            )}
            <span className="status-separator" />
            让知识自然沉淀
          </span>
        </div>
      </div>
      {minimized && (
        <button
          className="exit-focus"
          onClick={() => useApp.setState({ focus: false, left: true, right: true })}
        >
          <ArrowLeft size={14} />
          退出沉浸 <kbd>Esc</kbd>
        </button>
      )}
      <Command onImport={() => void pick()} />
      <Settings />
      <Modal
        open={shelfModal}
        onClose={() => setShelfModal(false)}
        title="创建阅读空间"
        description="可以是一座书架，也可以是一个轻量研究工作台。"
      >
        <label>
          名称
          <input
            autoFocus
            placeholder="例如：机器学习研究"
            value={shelfName}
            onChange={(e) => setShelfName(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button
            className="primary"
            disabled={!shelfName.trim()}
            onClick={() => {
              const name = shelfName.trim();
              if (
                ['all', 'recent', 'favorites', 'inbox', 'stats'].includes(name) ||
                name.startsWith('tag:')
              ) {
                s.notify('请使用其他名称');
                return;
              }
              if (!s.settings.shelves.includes(name))
                s.updateSettings({ shelves: [...s.settings.shelves, name] });
              setShelfModal(false);
              setShelfName('');
              navigate(name);
            }}
          >
            创建空间
          </button>
        </div>
        <p className="muted">在文档详情中把文档加入此空间。不同文档的摘录仍会保留来源。</p>
      </Modal>
      <Modal open={splitPicker} onClose={() => setSplitPicker(false)} title="选择对照文档">
        <div className="split-picker">
          {s.docs
            .filter((d) => d.id !== s.active)
            .map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  useApp.setState({ split: d.id });
                  setSplitPicker(false);
                }}
              >
                <BookOpen size={17} />
                {d.name}
              </button>
            ))}
          {s.docs.length < 2 && <p className="muted">先导入另一份文档，即可并排阅读。</p>}
        </div>
      </Modal>
      {busy && (
        <div className="busy-overlay">
          <Loading text={busy} />
        </div>
      )}
      {drag && (
        <div className="drop-overlay">
          <BookOpen size={40} />
          <h2>让新的思考，来到这里。</h2>
          <p>松开以导入文档</p>
        </div>
      )}
      <AnimatePresence>
        {s.toast && (
          <motion.div
            role="status"
            className="toast"
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {s.toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
