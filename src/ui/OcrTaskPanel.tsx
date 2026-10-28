import { useEffect, useRef, useState } from 'react';
import { ScanText, Square, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ReadingEngine } from '../readers/engine';
import { recognizePdfPages, type OcrLanguage, type OcrProgress } from '../core/ocr';
import { repository, persist } from '../core/database';
import { useApp } from '../core/store';
import { Modal } from './shared';

export function OcrTaskPanel({
  open,
  onClose,
  docId,
  fingerprint,
  page,
  total,
  engine,
}: {
  open: boolean;
  onClose: () => void;
  docId: string;
  fingerprint: string;
  page: number;
  total: number;
  engine: ReadingEngine;
}) {
  const [scope, setScope] = useState<'page' | 'range'>('page');
  const [from, setFrom] = useState(String(page));
  const [to, setTo] = useState(String(page));
  const [language, setLanguage] = useState<OcrLanguage>('chi_sim+eng');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [completed, setCompleted] = useState(0);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const notify = useApp((s) => s.notify);
  useEffect(() => {
    if (open) {
      setFrom(String(page));
      setTo(String(page));
      setError('');
      setCompleted(0);
      setFailed(0);
      setProgress(null);
    }
  }, [open, page]);
  useEffect(() => () => controller.current?.abort(), []);
  const start = async () => {
    const first = Math.max(1, Math.min(total, Number(from) || page));
    const last = scope === 'page' ? first : Math.max(first, Math.min(total, Number(to) || first));
    const pages = Array.from({ length: last - first + 1 }, (_, i) => first + i).filter(
      (n) => !repository.ocrPage(docId, n),
    );
    if (!pages.length) {
      setError('这些页面已经有 OCR 结果，无需重复识别。');
      return;
    }
    const signal = new AbortController();
    controller.current = signal;
    setRunning(true);
    setError('');
    setCompleted(0);
    setFailed(0);
    try {
      await recognizePdfPages({
        docId,
        fingerprint,
        engine,
        pages,
        language,
        signal: signal.signal,
        onProgress: setProgress,
        onPage: (result) => {
          repository.putOcrPage(result);
          persist();
          setCompleted((value) => value + 1);
        },
      });
      notify(`OCR 完成：已识别 ${pages.length} 页`);
    } catch (e) {
      if (signal.signal.aborted) setError('OCR 已取消，已完成的页面仍然保留。');
      else {
        setFailed((value) => value + 1);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (controller.current === signal) controller.current = null;
      setRunning(false);
    }
  };
  return (
    <Modal open={open} onClose={running ? () => {} : onClose} title="识别文档文字">
      <div className="ocr-panel">
        <div className="ocr-intro">
          <ScanText size={23} />
          <div>
            <strong>扫描 PDF 文字识别</strong>
            <p>首次使用会下载语言模型，识别在本机浏览器线程中进行，不修改原 PDF。</p>
          </div>
        </div>
        <label>
          识别范围
          <select value={scope} onChange={(e) => setScope(e.target.value as 'page' | 'range')} disabled={running}>
            <option value="page">当前页面（第 {page} 页）</option>
            <option value="range">指定页码范围</option>
          </select>
        </label>
        {scope === 'range' && (
          <div className="ocr-range">
            <label>从<input type="number" min="1" max={total} value={from} onChange={(e) => setFrom(e.target.value)} disabled={running} /></label>
            <span>至</span>
            <label>到<input type="number" min="1" max={total} value={to} onChange={(e) => setTo(e.target.value)} disabled={running} /></label>
          </div>
        )}
        <label>
          识别语言
          <select value={language} onChange={(e) => setLanguage(e.target.value as OcrLanguage)} disabled={running}>
            <option value="chi_sim+eng">简体中文 + English</option>
            <option value="eng">English</option>
          </select>
        </label>
        {running && progress && (
          <div className="ocr-progress">
            <div className="ocr-progress-head"><span>第 {progress.page} 页 · {progress.phase}</span><span>{completed} / {progress.total}</span></div>
            <div className="progress-track"><i style={{ width: `${Math.round(((completed + (progress.phase === '页面完成' ? 0 : 0.2)) / progress.total) * 100)}%` }} /></div>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
        {!running && completed > 0 && <p className="ocr-success"><CheckCircle2 size={15} /> 已保存 {completed} 页 OCR 结果，可使用全文搜索查找。</p>}
        {failed > 0 && <p className="error-text"><AlertTriangle size={15} /> {failed} 页失败，可重新执行。</p>}
        <div className="modal-actions">
          {running ? (
            <button className="secondary-button" onClick={() => controller.current?.abort()}><Square size={14} />停止任务</button>
          ) : (
            <>
              <button className="subtle-button" onClick={onClose}>稍后处理</button>
              <button className="primary" onClick={() => void start()}><ScanText size={15} />开始识别</button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
