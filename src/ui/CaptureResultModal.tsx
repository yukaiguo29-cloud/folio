import { useMemo, useState } from 'react';
import { Clipboard, Download, Sigma } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Modal } from './shared';
import type { CaptureRegion } from '../core/capture';

export function CaptureResultModal({
  result,
  onClose,
}: {
  result: { dataUrl: string; blob: Blob; width: number; height: number; region: CaptureRegion } | null;
  onClose: () => void;
}) {
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [latex, setLatex] = useState('');
  const preview = useMemo(() => {
    if (!latex.trim()) return '';
    return katex.renderToString(latex, { displayMode: true, throwOnError: false, trust: false });
  }, [latex]);
  if (!result) return null;
  const copy = async () => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      throw new Error('当前环境不支持图片剪贴板，请使用保存 PNG。');
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': result.blob })]);
  };
  const save = () => {
    const link = document.createElement('a');
    link.href = result.dataUrl;
    link.download = `Folio-page-${result.region.page}-capture.png`;
    link.click();
  };
  return (
    <>
      <Modal open={!!result && !formulaOpen} onClose={onClose} title="保存阅读截图" wide>
        <div className="capture-result">
          <div className="capture-preview-wrap">
            <img src={result.dataUrl} alt={`第 ${result.region.page} 页截图`} />
          </div>
          <p className="muted">第 {result.region.page} 页 · {result.width} × {result.height}px · PNG</p>
          <div className="modal-actions capture-actions">
            <button className="secondary-button" onClick={() => void copy()}><Clipboard size={15} />复制图片</button>
            <button className="secondary-button" onClick={save}><Download size={15} />保存 PNG</button>
            <button className="subtle-button" onClick={() => setFormulaOpen(true)}><Sigma size={15} />手动编辑公式</button>
          </div>
        </div>
      </Modal>
      <Modal open={formulaOpen} onClose={() => setFormulaOpen(false)} title="公式编辑与预览" wide>
        <div className="formula-editor">
          <div className="capture-preview-wrap"><img src={result.dataUrl} alt="公式原图" /></div>
          <label>LaTeX 源码<textarea value={latex} onChange={(e) => setLatex(e.target.value)} placeholder="例如：\\frac{a}{b} = c" /></label>
          <div className="formula-preview" dangerouslySetInnerHTML={{ __html: preview || '<span>输入 LaTeX 后预览公式</span>' }} />
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => void navigator.clipboard?.writeText(latex)}><Clipboard size={15} />复制 LaTeX</button>
            <button className="primary" onClick={() => setFormulaOpen(false)}>完成编辑</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
