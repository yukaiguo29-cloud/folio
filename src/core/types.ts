export type Format = 'pdf' | 'epub' | 'docx' | 'txt' | 'md' | 'html';
export interface FolioDocument {
  id: string;
  name: string;
  format: Format;
  path?: string;
  size: number;
  added: number;
  opened: number;
  page: number;
  offset?: number;
  total: number;
  progress: number;
  favorite: boolean;
  status: 'unread' | 'reading' | 'finished';
  tags: string[];
  shelf: string;
  indexed: boolean;
  cover?: string;
}
export interface Anchor {
  page: number;
  quote: string;
  prefix?: string;
  suffix?: string;
  start?: number;
  end?: number;
  rects?: { x: number; y: number; w: number; h: number }[];
}
export interface Note {
  id: string;
  docId: string;
  kind: 'highlight' | 'underline' | 'note' | 'excerpt' | 'bookmark';
  color: string;
  body: string;
  anchor: Anchor;
  created: number;
}
export interface HistoryEvent {
  id: string;
  docId: string;
  at: number;
  text: string;
}
export interface Settings {
  theme: 'light' | 'dark' | 'system';
  accent: string;
  fontSize: number;
  lineHeight: number;
  font: string;
  width: number;
  margin: number;
  paper: 'white' | 'sepia';
  wrap: boolean;
  leftWidth: number;
  rightWidth: number;
  aiEnabled: boolean;
  endpoint: string;
  model: string;
  shelves: string[];
}
export const defaults: Settings = {
  theme: 'system',
  accent: '#577266',
  fontSize: 18,
  lineHeight: 1.9,
  font: 'serif',
  width: 740,
  margin: 48,
  paper: 'white',
  wrap: true,
  leftWidth: 232,
  rightWidth: 288,
  aiEnabled: false,
  endpoint: 'http://localhost:11434/v1',
  model: '',
  shelves: [],
};
export interface SearchHit {
  docId: string;
  page: number;
  text: string;
  kind: 'document' | 'text' | 'note';
  noteId?: string;
}
export interface OutlineItem {
  title: string;
  page: number;
  level: number;
  id?: string;
}
export function formatOf(name: string): Format | null {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext === 'markdown'
    ? 'md'
    : ext === 'htm'
      ? 'html'
      : ['pdf', 'epub', 'docx', 'txt', 'md', 'html'].includes(ext || '')
        ? (ext as Format)
        : null;
}
export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}
