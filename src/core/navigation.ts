import { useApp } from './store';
import type { Anchor } from './types';
export function navigateTo(docId: string, anchor: Anchor) {
  useApp.getState().open(docId, anchor.page);
  setTimeout(
    () => window.dispatchEvent(new CustomEvent('folio:jump', { detail: { docId, anchor } })),
    120,
  );
}
