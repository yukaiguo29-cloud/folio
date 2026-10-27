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
      <svg className="brand-mark" width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="32" height="32" rx="11" fill="url(#folio-mark-gradient)" />
        <path d="M9 9.5 16.2 7v19.1L9 28.2V9.5Z" fill="white" fillOpacity=".68" />
        <path d="m17.8 7 7.2 2.5v18.7l-7.2-2.1V7Z" fill="white" />
        <path d="M6.2 12.6v17.7l9.6-2.5M27.8 12.6v17.7l-9.6-2.5" stroke="white" strokeOpacity=".78" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id="folio-mark-gradient" x1="4" y1="3" x2="30" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7E9D8C" />
            <stop offset="1" stopColor="#3E6257" />
          </linearGradient>
        </defs>
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
