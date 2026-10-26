import { create } from 'zustand';
import { defaults } from './types';
import type { FolioDocument, Settings, Note } from './types';
import { repository, persist } from './database';
interface State {
  ready: boolean;
  docs: FolioDocument[];
  notes: Note[];
  settings: Settings;
  tabs: string[];
  active: string | null;
  view: string;
  left: boolean;
  right: boolean;
  panel: 'outline' | 'notes' | 'ai' | 'history' | 'thumbnails';
  focus: boolean;
  ruler: boolean;
  split: string | null;
  command: boolean;
  settingsOpen: boolean;
  toast: string;
  saved: boolean;
  rev: number;
  refresh: () => void;
  updateSettings: (s: Partial<Settings>) => void;
  open: (id: string, page?: number) => void;
  close: (id: string) => void;
  updateDoc: (id: string, patch: Partial<FolioDocument>) => void;
  notify: (message: string) => void;
}
export const useApp = create<State>((set, get) => ({
  ready: false,
  docs: [],
  notes: [],
  settings: defaults,
  tabs: [],
  active: null,
  view: 'all',
  left: true,
  right: true,
  panel: 'outline',
  focus: false,
  ruler: false,
  split: null,
  command: false,
  settingsOpen: false,
  toast: '',
  saved: true,
  rev: 0,
  refresh: () =>
    set((s) => ({
      docs: repository.documents(),
      notes: repository.notes(),
      settings: repository.settings(),
      rev: s.rev + 1,
    })),
  updateSettings: (patch) => {
    const s = { ...get().settings, ...patch };
    repository.putSettings(s);
    persist();
    set({ settings: s, saved: false });
  },
  open: (id, page) => {
    const d = get().docs.find((x) => x.id === id);
    if (!d) return;
    if (!d.opened) repository.event(id, '开始阅读');
    else if (new Date(d.opened).toDateString() !== new Date().toDateString())
      repository.event(id, '继续阅读');
    const patch: Partial<FolioDocument> = { opened: Date.now() };
    if (page) {
      patch.page = page;
      patch.offset = 0;
    }
    get().updateDoc(id, patch);
    set((s) => ({ active: id, tabs: s.tabs.includes(id) ? s.tabs : [...s.tabs, id] }));
    localStorage.setItem('folio-last', id);
  },
  close: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((x) => x !== id);
      const active = s.active === id ? tabs.at(-1) || null : s.active;
      if (active) localStorage.setItem('folio-last', active);
      else localStorage.removeItem('folio-last');
      return {
        tabs,
        active,
        split: s.split === id ? null : s.split,
      };
    }),
  updateDoc: (id, patch) => {
    const d = get().docs.find((x) => x.id === id);
    if (!d) return;
    repository.putDocument({ ...d, ...patch });
    persist();
    set((s) => ({ docs: s.docs.map((x) => (x.id === id ? { ...x, ...patch } : x)), saved: false }));
  },
  notify: (toast) => {
    set({ toast });
    setTimeout(() => {
      if (get().toast === toast) set({ toast: '' });
    }, 5500);
  },
}));
export function mutate(fn: () => void) {
  fn();
  persist();
  useApp.getState().refresh();
  useApp.setState({ saved: false });
}
