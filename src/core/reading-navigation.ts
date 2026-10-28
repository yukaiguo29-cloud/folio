import { useSyncExternalStore } from 'react';
import type { Anchor } from './types';

export type ReadingPane = 'primary' | 'secondary';

export interface ReadingLocation {
  docId: string;
  page: number;
  offset?: number;
  anchor?: Anchor;
  scale?: number;
  fit?: 'width' | 'page' | 'manual';
  continuous?: boolean;
  spread?: boolean;
  pane: ReadingPane;
}

interface Registration {
  getCurrent: () => ReadingLocation | null;
  activate: (location: ReadingLocation) => boolean;
}

interface HistoryState {
  entries: ReadingLocation[];
  index: number;
}

const LIMIT = 50;
const emptyState = (): HistoryState => ({ entries: [], index: -1 });

function comparable(location: ReadingLocation) {
  return JSON.stringify({
    docId: location.docId,
    page: location.page,
    offset: Math.round((location.offset || 0) * 1000) / 1000,
    anchor: location.anchor
      ? {
          page: location.anchor.page,
          quote: location.anchor.quote,
          start: location.anchor.start,
          end: location.anchor.end,
        }
      : undefined,
    scale: location.scale,
    fit: location.fit,
    continuous: location.continuous,
    spread: location.spread,
  });
}

export class ReadingNavigationService {
  private readonly registrations = new Map<ReadingPane, Registration>();
  private readonly histories = new Map<ReadingPane, HistoryState>();
  private readonly listeners = new Map<ReadingPane, Set<() => void>>();
  private readonly snapshots = new Map<
    ReadingPane,
    { canBack: boolean; canForward: boolean; size: number }
  >();

  register(pane: ReadingPane, registration: Registration) {
    this.registrations.set(pane, registration);
    if (!this.histories.has(pane)) this.histories.set(pane, emptyState());
    this.notify(pane);
    return () => {
      if (this.registrations.get(pane) === registration) this.registrations.delete(pane);
    };
  }

  subscribe(pane: ReadingPane, listener: () => void) {
    const listeners = this.listeners.get(pane) || new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(pane, listeners);
    return () => listeners.delete(listener);
  }

  state(pane: ReadingPane) {
    const cached = this.snapshots.get(pane);
    if (cached) return cached;
    const history = this.histories.get(pane) || emptyState();
    const snapshot = {
      canBack: history.index > 0,
      canForward: history.index >= 0 && history.index < history.entries.length - 1,
      size: history.entries.length,
    };
    this.snapshots.set(pane, snapshot);
    return snapshot;
  }

  navigate(location: ReadingLocation, pane: ReadingPane = location.pane) {
    const registration = this.registrations.get(pane);
    if (!registration) return false;
    const current = registration.getCurrent();
    if (!registration.activate(location)) return false;
    const history = this.histories.get(pane) || emptyState();
    if (current && history.index < 0) {
      history.entries = [current];
      history.index = 0;
    } else if (current) {
      history.entries[history.index] = current;
    }
    const last = history.entries[history.index];
    if (last && comparable(last) === comparable(location)) {
      history.entries[history.index] = location;
      this.histories.set(pane, history);
      this.notify(pane);
      return true;
    }
    history.entries = history.entries.slice(0, history.index + 1);
    history.entries.push(location);
    if (history.entries.length > LIMIT) history.entries.shift();
    history.index = history.entries.length - 1;
    this.histories.set(pane, history);
    this.notify(pane);
    return true;
  }

  back(pane: ReadingPane) {
    const registration = this.registrations.get(pane);
    const history = this.histories.get(pane);
    if (!registration || !history || history.index <= 0) return false;
    const current = registration.getCurrent();
    if (current) history.entries[history.index] = current;
    const target = history.entries[history.index - 1];
    if (!registration.activate(target)) return false;
    history.index -= 1;
    this.notify(pane);
    return true;
  }

  forward(pane: ReadingPane) {
    const registration = this.registrations.get(pane);
    const history = this.histories.get(pane);
    if (!registration || !history || history.index >= history.entries.length - 1) return false;
    const current = registration.getCurrent();
    if (current) history.entries[history.index] = current;
    const target = history.entries[history.index + 1];
    if (!registration.activate(target)) return false;
    history.index += 1;
    this.notify(pane);
    return true;
  }

  private notify(pane: ReadingPane) {
    const history = this.histories.get(pane) || emptyState();
    this.snapshots.set(pane, {
      canBack: history.index > 0,
      canForward: history.index >= 0 && history.index < history.entries.length - 1,
      size: history.entries.length,
    });
    this.listeners.get(pane)?.forEach((listener) => listener());
  }
}

export const readingNavigation = new ReadingNavigationService();

export function useReadingNavigation(pane: ReadingPane) {
  return useSyncExternalStore(
    (listener) => readingNavigation.subscribe(pane, listener),
    () => readingNavigation.state(pane),
    () => readingNavigation.state(pane),
  );
}
