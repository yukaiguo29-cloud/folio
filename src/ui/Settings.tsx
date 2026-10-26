import { useState, useRef } from 'react';
import {
  Palette,
  Type,
  Keyboard,
  Database,
  Shield,
  Sparkles,
  Info,
  RotateCcw,
  Download,
} from 'lucide-react';
import { useApp } from '../core/store';
import { defaults } from '../core/types';
import { desktop, download } from '../core/platform';
import { repository, flush, restoreDatabase } from '../core/database';
import { Modal } from './shared';
import { version } from '../../package.json';
const groups = [
  ['appearance', '外观与主题', Palette],
  ['reading', '阅读排版', Type],
  ['keys', '键盘快捷键', Keyboard],
  ['library', '本地资料库', Database],
  ['ai', 'AI 服务', Sparkles],
  ['privacy', '隐私与数据', Shield],
  ['about', '关于 Folio', Info],
] as const;
export function Settings() {
  const open = useApp((s) => s.settingsOpen),
    s = useApp((s) => s.settings),
    update = useApp((s) => s.updateSettings);
  const [group, setGroup] = useState('appearance'),
    [key, setKey] = useState(sessionStorage.getItem('folio-api-key') || ''),
    [restoring, setRestoring] = useState(false);
  const restore = useRef<HTMLInputElement>(null);
  return (
    <Modal open={open} onClose={() => useApp.setState({ settingsOpen: false })} title="设置" wide>
      <div className="settings-layout">
        <nav>
          {groups.map(([id, label, Icon]) => (
            <button
              key={id}
              className={group === id ? 'selected' : ''}
              onClick={() => setGroup(id)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {group === 'appearance' && (
            <>
              <h3>让界面，适应你的习惯。</h3>
              <label>
                主题
                <select
                  value={s.theme}
                  onChange={(e) => update({ theme: e.target.value as typeof s.theme })}
                >
                  <option value="system">跟随系统</option>
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
              </label>
              <label>
                强调色
                <div className="accent-options">
                  {['#577266', '#627ba5', '#9a7354', '#8b7199'].map((c) => (
                    <button
                      key={c}
                      aria-label={`强调色 ${c}`}
                      aria-pressed={s.accent === c}
                      style={{ background: c }}
                      onClick={() => update({ accent: c })}
                    />
                  ))}
                </div>
              </label>
            </>
          )}
          {group === 'reading' && (
            <>
              <h3>留白，是阅读的一部分。</h3>
              <label>
                字体
                <select value={s.font} onChange={(e) => update({ font: e.target.value })}>
                  <option value="serif">宋体 / 系统衬线</option>
                  <option value="sans">黑体 / 系统无衬线</option>
                </select>
              </label>
              <label>
                字号 <span>{s.fontSize}px</span>
                <input
                  aria-label="阅读字号"
                  type="range"
                  min="13"
                  max="32"
                  value={s.fontSize}
                  onChange={(e) => update({ fontSize: Number(e.target.value) })}
                />
              </label>
              <label>
                行距 <span>{s.lineHeight}</span>
                <input
                  aria-label="阅读行距"
                  type="range"
                  min="1.3"
                  max="2.6"
                  step=".1"
                  value={s.lineHeight}
                  onChange={(e) => update({ lineHeight: Number(e.target.value) })}
                />
              </label>
              <label>
                内容宽度 <span>{s.width}px</span>
                <input
                  aria-label="阅读宽度"
                  type="range"
                  min="420"
                  max="1100"
                  step="20"
                  value={s.width}
                  onChange={(e) => update({ width: Number(e.target.value) })}
                />
              </label>
              <label>
                页边距 <span>{s.margin}px</span>
                <input
                  aria-label="阅读页边距"
                  type="range"
                  min="16"
                  max="96"
                  step="4"
                  value={s.margin}
                  onChange={(e) => update({ margin: Number(e.target.value) })}
                />
              </label>
              <label>
                纸张
                <select
                  value={s.paper}
                  onChange={(e) => update({ paper: e.target.value as typeof s.paper })}
                >
                  <option value="white">素白 / 深色</option>
                  <option value="sepia">暖纸护眼</option>
                </select>
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={s.wrap}
                  onChange={(e) => update({ wrap: e.target.checked })}
                />
                TXT 自动换行
              </label>
              <p className="muted">
                排版设置适用于可重排文档。PDF
                始终保留原始页面，可在阅读工具栏调整缩放、适配和单双页。
              </p>
            </>
          )}
          {group === 'keys' && (
            <>
              <h3>让操作，不打断思考。</h3>
              <dl className="shortcuts">
                {[
                  ['打开文档', 'Ctrl / ⌘ + O'],
                  ['命令与全局搜索', 'Ctrl / ⌘ + K'],
                  ['文档内搜索', 'Ctrl / ⌘ + F'],
                  ['关闭当前标签', 'Ctrl / ⌘ + W'],
                  ['沉浸模式', 'Ctrl / ⌘ + Shift + F'],
                  ['设置', 'Ctrl / ⌘ + ,'],
                  ['上一页 / 下一页', '← / → · Page Up / Down'],
                  ['退出沉浸模式', 'Esc'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      <kbd>{v}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {group === 'library' && (
            <>
              <h3>你的资料，留在你的电脑。</h3>
              <p>
                {desktop
                  ? '资料库数据库位于系统应用数据目录下的 com.zhijian.folio / library.sqlite。原文件按用户选择的路径引用，不额外复制。'
                  : '当前为浏览器运行版：SQLite 数据库与导入的文件副本保存在此浏览器的 IndexedDB。清除站点数据会删除它们，请定期导出备份。'}
              </p>
              <p className="muted">
                桌面版保留文件引用；文件移动后可以重新定位到内容一致的文件。备份包含进度、笔记、标签、设置和索引，不包含原文件或浏览器中的文件副本。
              </p>
              <button
                className="secondary-button"
                onClick={() =>
                  download('Folio-library.sqlite', repository.export(), 'application/vnd.sqlite3')
                }
              >
                <Download size={16} />
                导出 SQLite 备份
              </button>
              <button
                className="subtle-button"
                disabled={restoring}
                onClick={() => restore.current?.click()}
              >
                从备份恢复…
              </button>
              <input
                ref={restore}
                type="file"
                accept=".sqlite,.db"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (!confirm('恢复将替换当前资料库的记录和笔记。建议先导出当前备份。继续？'))
                    return;
                  setRestoring(true);
                  void f
                    .arrayBuffer()
                    .then((b) => restoreDatabase(new Uint8Array(b)))
                    .then(() => {
                      useApp.getState().refresh();
                      useApp.setState({ active: null, tabs: [], split: null });
                      useApp.getState().notify('资料库已恢复。浏览器版需重新导入原文件以关联。');
                    })
                    .catch((e) => useApp.getState().notify('恢复失败：' + String(e)))
                    .finally(() => setRestoring(false));
                  e.target.value = '';
                }}
              />
            </>
          )}
          {group === 'ai' && (
            <>
              <h3>按需开启，始终由你决定。</h3>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={s.aiEnabled}
                  onChange={(e) => update({ aiEnabled: e.target.checked })}
                />
                启用 AI 阅读助手
              </label>
              <label>
                OpenAI 兼容 API 基础地址
                <input
                  placeholder="http://localhost:11434/v1"
                  value={s.endpoint}
                  onChange={(e) => update({ endpoint: e.target.value })}
                />
              </label>
              <label>
                模型名称
                <input
                  placeholder="例如 qwen3:8b"
                  value={s.model}
                  onChange={(e) => update({ model: e.target.value })}
                />
              </label>
              <label>
                API Key（仅当前会话）
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    sessionStorage.setItem('folio-api-key', e.target.value);
                  }}
                />
              </label>
              <p className="muted">
                密钥不写入数据库和备份。默认不发送任何内容，每次提问前会显示将要发送的原文和目标服务。支持本地
                Ollama 的 OpenAI 兼容接口。浏览器版的外部服务需允许当前站点的 CORS 请求。
              </p>
            </>
          )}
          {group === 'privacy' && (
            <>
              <h3>阅读，应该是私密的。</h3>
              <p>
                没有账号、遥测或后台上传。文档解析、全文索引、笔记和统计都在本地运行。HTML 和
                Markdown 会经过安全过滤；远程图片和脚本不会随文档加载。
              </p>
              <p>
                PDF 批注保存于资料库的独立标注层，不写回 PDF。EPUB
                和流式文档使用原文、上下文与偏移恢复定位。
              </p>
              <button
                className="secondary-button"
                onClick={() => {
                  sessionStorage.removeItem('folio-api-key');
                  setKey('');
                  useApp.getState().notify('会话密钥已清除');
                }}
              >
                清除会话 API Key
              </button>
            </>
          )}
          {group === 'about' && (
            <div className="about">
              <h2>
                Folio <span>知间</span>
              </h2>
              <p>
                让阅读回归阅读，
                <br />
                让知识自然沉淀。
              </p>
              <small>
                {version} · 离线优先的个人文档阅读器
                <br />
                React · TypeScript · Tauri 2 · SQLite
              </small>
            </div>
          )}
          <div className="settings-bottom">
            <button
              className="subtle-button"
              onClick={() => {
                if (confirm('恢复所有设置为默认值？文档和笔记会保留。')) {
                  update({ ...defaults });
                  setKey('');
                  sessionStorage.removeItem('folio-api-key');
                }
              }}
            >
              <RotateCcw size={14} />
              恢复默认设置
            </button>
            <button
              className="primary"
              onClick={() => {
                void flush()
                  .then(() => useApp.setState({ settingsOpen: false }))
                  .catch(() => useApp.getState().notify('保存失败，请导出备份'));
              }}
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
