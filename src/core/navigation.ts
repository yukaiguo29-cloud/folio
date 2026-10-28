import { useApp } from './store';
import type { Anchor } from './types';
import { readingNavigation, type ReadingPane } from './reading-navigation';
export function navigateTo(docId: string, anchor: Anchor) {
  const pane: ReadingPane = 'primary';
  const location = { docId, page: anchor.page, offset: 0, anchor, pane };
  if (readingNavigation.navigate(location, pane)) return;
  useApp.getState().open(docId, anchor.page);
  setTimeout(() => window.dispatchEvent(new CustomEvent('folio:jump', { detail: location })), 120);
}
