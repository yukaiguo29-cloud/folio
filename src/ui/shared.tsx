import * as Dialog from '@radix-ui/react-dialog';
import { X, LoaderCircle } from 'lucide-react';
import type { ReactNode, ButtonHTMLAttributes } from 'react';
export function IconButton({
  label,
  children,
  active = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`icon-button ${active ? 'active' : ''}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal ${wide ? 'wide' : ''}`}
          aria-describedby={description ? 'modal-description' : undefined}
        >
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="关闭弹窗">
                <X size={18} />
              </IconButton>
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description id="modal-description" className="muted">
              {description}
            </Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Loading({ text = '正在打开文档…' }: { text?: string }) {
  return (
    <div className="state-message">
      <LoaderCircle className="spin" size={26} />
      <p>{text}</p>
    </div>
  );
}
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? 'small' : ''}`}>
      <svg width="30" height="32" viewBox="0 0 30 32" fill="none" aria-hidden="true">
        <path d="M5 6.5 14 4v23l-9 2V6.5Z" fill="currentColor" opacity=".55" />
        <path d="m16 4 9 2.5V29l-9-2V4Z" fill="currentColor" />
        <path d="M1 10v21l12-3M29 10v21l-12-3" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      {!small && (
        <span>
          Folio<span className="brand-cn">知间</span>
        </span>
      )}
    </span>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-inline">
      <p>{title}</p>
      {children}
    </div>
  );
}
export const dateLabel = (time: number) =>
  new Date(time).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
