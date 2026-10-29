import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { readDatabase, saveDatabase } from './platform';
import { defaults } from './types';
import type { FolioDocument, Note, HistoryEvent, Settings, SearchHit, OcrPage } from './types';
import type { PersistedKnowledgeEdge } from './knowledge-graph';
export class Repository {
  db: Database;
  constructor(SQL: SqlJsStatic, bytes?: Uint8Array) {
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this.migrate();
  }
  migrate() {
    const version = Number(this.db.exec('PRAGMA user_version')[0]?.values[0][0] || 0);
    if (version > 3) throw new Error('资料库来自更新版本，请更新 Folio。');
    if (version === 0) {
      this.db.run(
        `BEGIN; CREATE TABLE docs(id TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE notes(id TEXT PRIMARY KEY,doc_id TEXT NOT NULL,json TEXT NOT NULL); CREATE INDEX notes_doc ON notes(doc_id); CREATE TABLE settings(key TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE events(id TEXT PRIMARY KEY,doc_id TEXT,at INTEGER,json TEXT); CREATE TABLE sessions(doc_id TEXT,at INTEGER,seconds INTEGER); CREATE VIRTUAL TABLE pages USING fts4(doc_id,page,text,tokenize=unicode61); CREATE TABLE ocr_pages(doc_id TEXT NOT NULL,page INTEGER NOT NULL,text TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(doc_id,page)); CREATE TABLE knowledge_edges(id TEXT PRIMARY KEY,source TEXT NOT NULL,target TEXT NOT NULL,kind TEXT NOT NULL,label TEXT NOT NULL,created INTEGER NOT NULL,json TEXT NOT NULL); CREATE TABLE graph_layout(key TEXT PRIMARY KEY,json TEXT NOT NULL); PRAGMA user_version=3; COMMIT;`,
      );
    } else if (version === 1) {
      this.db.run(
        'BEGIN; CREATE TABLE IF NOT EXISTS ocr_pages(doc_id TEXT NOT NULL,page INTEGER NOT NULL,text TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(doc_id,page)); PRAGMA user_version=2; COMMIT;',
      );
    }
    const migratedVersion = Number(this.db.exec('PRAGMA user_version')[0]?.values[0][0] || 0);
    if (migratedVersion === 2) {
      this.db.run(
        'BEGIN; CREATE TABLE IF NOT EXISTS knowledge_edges(id TEXT PRIMARY KEY,source TEXT NOT NULL,target TEXT NOT NULL,kind TEXT NOT NULL,label TEXT NOT NULL,created INTEGER NOT NULL,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS graph_layout(key TEXT PRIMARY KEY,json TEXT NOT NULL); PRAGMA user_version=3; COMMIT;',
      );
    }
  }
  rows<T>(sql: string, args: (string | number)[] = []): T[] {
    const s = this.db.prepare(sql);
    try {
      s.bind(args);
      const a: T[] = [];
      while (s.step()) a.push(s.getAsObject() as T);
      return a;
    } finally {
      s.free();
    }
  }
  documents() {
    return this.rows<{ json: string }>('SELECT json FROM docs').map(
      (x) => JSON.parse(x.json) as FolioDocument,
    );
  }
  putDocument(d: FolioDocument) {
    this.db.run('INSERT OR REPLACE INTO docs VALUES (?,?)', [d.id, JSON.stringify(d)]);
  }
  notes(id?: string) {
    return this.rows<{ json: string }>(
      id ? 'SELECT json FROM notes WHERE doc_id=?' : 'SELECT json FROM notes',
      id ? [id] : [],
    )
      .map((x) => JSON.parse(x.json) as Note)
      .sort((a, b) => b.created - a.created);
  }
  putNote(n: Note) {
    this.db.run('INSERT OR REPLACE INTO notes VALUES (?,?,?)', [n.id, n.docId, JSON.stringify(n)]);
  }
  deleteNote(id: string) {
    this.db.run('DELETE FROM notes WHERE id=?', [id]);
  }
  removeDocument(id: string) {
    this.db.run('BEGIN');
    try {
      for (const table of ['notes', 'events', 'sessions', 'pages', 'ocr_pages'])
        this.db.run(`DELETE FROM ${table} WHERE doc_id=?`, [id]);
      this.db.run('DELETE FROM knowledge_edges WHERE source=? OR target=? OR source=? OR target=?', [
        id,
        id,
        `doc:${id}`,
        `doc:${id}`,
      ]);
      this.db.run('DELETE FROM docs WHERE id=?', [id]);
      this.db.run('COMMIT');
    } catch (e) {
      this.db.run('ROLLBACK');
      throw e;
    }
  }
  settings(): Settings {
    const x = this.rows<{ json: string }>('SELECT json FROM settings WHERE key=?', [
      'preferences',
    ])[0];
    return { ...defaults, ...(x ? JSON.parse(x.json) : {}) };
  }
  putSettings(s: Settings) {
    this.db.run('INSERT OR REPLACE INTO settings VALUES (?,?)', ['preferences', JSON.stringify(s)]);
  }
  indexPage(id: string, page: number, text: string) {
    this.db.run('DELETE FROM pages WHERE doc_id=? AND page=?', [id, page]);
    this.db.run('INSERT INTO pages(doc_id,page,text) VALUES (?,?,?)', [id, page, text]);
  }
  clearIndex(id: string) {
    this.db.run('DELETE FROM pages WHERE doc_id=?', [id]);
  }
  putOcrPage(page: OcrPage) {
    this.db.run('INSERT OR REPLACE INTO ocr_pages VALUES (?,?,?,?)', [
      page.docId,
      page.page,
      page.text,
      JSON.stringify(page),
    ]);
  }
  ocrPages(docId: string) {
    return this.rows<{ json: string }>('SELECT json FROM ocr_pages WHERE doc_id=?', [docId]).map(
      (row) => JSON.parse(row.json) as OcrPage,
    );
  }
  ocrPage(docId: string, page: number) {
    const row = this.rows<{ json: string }>('SELECT json FROM ocr_pages WHERE doc_id=? AND page=?', [
      docId,
      page,
    ])[0];
    return row ? (JSON.parse(row.json) as OcrPage) : undefined;
  }
  knowledgeEdges() {
    return this.rows<{ json: string }>('SELECT json FROM knowledge_edges ORDER BY created ASC').map(
      (row) => JSON.parse(row.json) as PersistedKnowledgeEdge,
    );
  }
  putKnowledgeEdge(edge: PersistedKnowledgeEdge) {
    this.db.run('INSERT OR REPLACE INTO knowledge_edges VALUES (?,?,?,?,?,?,?)', [
      edge.id,
      edge.source,
      edge.target,
      edge.kind,
      edge.label,
      edge.created,
      JSON.stringify(edge),
    ]);
  }
  deleteKnowledgeEdge(id: string) {
    this.db.run('DELETE FROM knowledge_edges WHERE id=?', [id]);
  }
  graphLayout() {
    const row = this.rows<{ json: string }>('SELECT json FROM graph_layout WHERE key=?', ['main'])[0];
    return row ? (JSON.parse(row.json) as Record<string, { x: number; y: number }>) : {};
  }
  putGraphLayout(layout: Record<string, { x: number; y: number }>) {
    this.db.run('INSERT OR REPLACE INTO graph_layout VALUES (?,?)', ['main', JSON.stringify(layout)]);
  }
  search(query: string, onlyDoc?: string): SearchHit[] {
    const q = query.trim().slice(0, 160);
    if (!q) return [];
    const hits: SearchHit[] = [];
    const lower = q.toLocaleLowerCase();
    if (!onlyDoc) {
      for (const d of this.documents())
        if ((d.name + ' ' + d.tags.join(' ')).toLocaleLowerCase().includes(lower))
          hits.push({ docId: d.id, page: d.page, text: d.name, kind: 'document' });
    }
    // FTS handles word queries; LIKE supplies substring matching for Chinese and partial words.
    const escaped = q.replace(/[\\%_]/g, '\\$&');
    type PageRow = { doc_id: string; page: number; text: string };
    let indexed: PageRow[] = [];
    if (/^[a-z0-9\s-]+$/i.test(q)) {
      const terms = q.match(/[a-z0-9]+/gi) || [];
      if (terms.length) {
        const match = terms.map((t) => '"' + t + '"').join(' AND ');
        indexed = this.rows<PageRow>(
          `SELECT doc_id,page,text FROM pages WHERE pages MATCH ? ${onlyDoc ? 'AND doc_id=?' : ''} LIMIT 80`,
          onlyDoc ? [match, onlyDoc] : [match],
        );
      }
    }
    const substrings =
      indexed.length >= 80
        ? []
        : this.rows<PageRow>(
            `SELECT doc_id,page,text FROM pages WHERE text LIKE ? ESCAPE '\\' ${onlyDoc ? 'AND doc_id=?' : ''} LIMIT 80`,
            onlyDoc ? [`%${escaped}%`, onlyDoc] : [`%${escaped}%`],
          );
    const rows = [
      ...new Map([...indexed, ...substrings].map((r) => [r.doc_id + ':' + r.page, r])).values(),
    ].slice(0, 80);
    const ocrRows = this.rows<PageRow>(
      `SELECT doc_id,page,text FROM ocr_pages WHERE text LIKE ? ESCAPE '\\' ${onlyDoc ? 'AND doc_id=?' : ''} LIMIT 80`,
      onlyDoc ? [`%${escaped}%`, onlyDoc] : [`%${escaped}%`],
    );
    const allRows = [
      ...new Map([...rows, ...ocrRows].map((r) => [r.doc_id + ':' + r.page, r])).values(),
    ].slice(0, 80);
    for (const r of allRows) {
      const i = r.text.toLocaleLowerCase().indexOf(lower);
      hits.push({
        docId: r.doc_id,
        page: Number(r.page),
        text: (i > 40 ? '…' : '') + r.text.slice(Math.max(0, i - 40), i + q.length + 100),
        kind: 'text',
      });
    }
    for (const n of this.notes(onlyDoc))
      if ((n.body + ' ' + n.anchor.quote).toLocaleLowerCase().includes(lower))
        hits.push({
          docId: n.docId,
          page: n.anchor.page,
          text: n.body || n.anchor.quote,
          kind: 'note',
          noteId: n.id,
        });
    return hits.slice(0, 100);
  }
  event(id: string, text: string) {
    const e: HistoryEvent = { id: crypto.randomUUID(), docId: id, at: Date.now(), text };
    this.db.run('INSERT INTO events VALUES (?,?,?,?)', [e.id, id, e.at, JSON.stringify(e)]);
  }
  events(id: string) {
    return this.rows<{ json: string }>(
      'SELECT json FROM events WHERE doc_id=? ORDER BY at DESC LIMIT 100',
      [id],
    ).map((x) => JSON.parse(x.json) as HistoryEvent);
  }
  tick(id: string, seconds: number, at = Date.now()) {
    this.db.run('INSERT INTO sessions VALUES (?,?,?)', [id, at, seconds]);
  }
  stats() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const start = now.getTime() - ((now.getDay() + 6) % 7) * 86400000;
    return {
      seconds: Number(
        this.rows<{ n: number }>('SELECT COALESCE(sum(seconds),0) n FROM sessions WHERE at>=?', [
          start,
        ])[0].n,
      ),
      count: Number(
        this.rows<{ n: number }>('SELECT count(DISTINCT doc_id) n FROM sessions WHERE at>=?', [
          start,
        ])[0].n,
      ),
      finished: this.documents().filter((d) => d.status === 'finished').length,
      days: Array.from({ length: 7 }, (_, i) => {
        const at = now.getTime() - (6 - i) * 86400000;
        return {
          at,
          seconds: Number(
            this.rows<{ n: number }>(
              'SELECT COALESCE(sum(seconds),0) n FROM sessions WHERE at>=? AND at<?',
              [at, at + 86400000],
            )[0].n,
          ),
        };
      }),
    };
  }
  export() {
    return this.db.export();
  }
}
export let repository: Repository;
let initializing: Promise<Repository> | undefined;
export function initDatabase() {
  return (initializing ??= Promise.all([
    initSqlJs({ locateFile: () => wasmUrl }),
    readDatabase(),
  ]).then(([SQL, bytes]) => (repository = new Repository(SQL, bytes))));
}
export async function restoreDatabase(bytes: Uint8Array) {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const next = new Repository(SQL, bytes);
  next.documents();
  next.notes();
  next.settings();
  await flush();
  await saveDatabase(next.export());
  repository.db.close();
  repository = next;
}
let timer: ReturnType<typeof setTimeout> | undefined;
let queue = Promise.resolve();
let generation = 0;
export function persist() {
  generation++;
  clearTimeout(timer);
  timer = setTimeout(() => {
    void flush().catch(() => {});
  }, 250);
}
export function flush() {
  clearTimeout(timer);
  const version = generation;
  const bytes = repository.export();
  queue = queue
    .catch(() => {})
    .then(() => saveDatabase(bytes))
    .then(
      () => {
        if (version === generation) window.dispatchEvent(new CustomEvent('folio:saved'));
      },
      (e) => {
        window.dispatchEvent(new CustomEvent('folio:save-error', { detail: String(e) }));
        throw e;
      },
    );
  return queue;
}
