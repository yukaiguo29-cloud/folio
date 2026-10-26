import { beforeAll, describe, it, expect } from 'vitest';
import initSqlJs from 'sql.js';
import type { SqlJsStatic } from 'sql.js';
import { fileURLToPath } from 'node:url';
import { Repository } from '../src/core/database';
import { resolveAnchor } from '../src/core/anchors';
import { endpointUrl } from '../src/core/ai';
import { defaults, formatOf, clamp } from '../src/core/types';
import type { FolioDocument, Note } from '../src/core/types';
let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs({
    locateFile: () =>
      fileURLToPath(new URL('../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url)),
  });
});
const doc = (id = 'doc1'): FolioDocument => ({
  id,
  name: '真实文档.pdf',
  format: 'pdf',
  size: 1000,
  added: Date.now(),
  opened: Date.now(),
  page: 2,
  offset: 0.43,
  total: 8,
  progress: 0.25,
  favorite: true,
  status: 'reading',
  tags: ['研究'],
  shelf: '机器学习',
  indexed: false,
});
const note = (id = 'note1'): Note => ({
  id,
  docId: 'doc1',
  kind: 'note',
  color: '#f2cf70',
  body: '我的思考',
  anchor: { page: 2, quote: '安静地阅读', start: 3, prefix: '开始' },
  created: 1793010000000,
});
describe('SQLite library and recovery', () => {
  it('migrates a new database and keeps its schema version', () => {
    const r = new Repository(SQL);
    expect(r.rows('PRAGMA user_version')).toEqual([{ user_version: 1 }]);
    expect(r.documents()).toEqual([]);
  });
  it('restores real document progress, tags, settings and notes after export/reopen', () => {
    const r = new Repository(SQL);
    r.putDocument(doc());
    r.putNote(note());
    r.putSettings({ ...defaults, theme: 'dark', fontSize: 24 });
    const reopened = new Repository(SQL, r.export());
    expect(reopened.documents()[0]).toMatchObject({
      page: 2,
      progress: 0.25,
      tags: ['研究'],
      shelf: '机器学习',
    });
    expect(reopened.notes()[0]).toEqual(note());
    expect(reopened.settings()).toMatchObject({ theme: 'dark', fontSize: 24 });
  });
  it('updates the same content identity instead of duplicating it', () => {
    const r = new Repository(SQL);
    r.putDocument(doc());
    r.putDocument({ ...doc(), page: 6 });
    expect(r.documents()).toHaveLength(1);
    expect(r.documents()[0].page).toBe(6);
  });
  it('keeps a file re-association from deleting notes', () => {
    const r = new Repository(SQL);
    r.putDocument(doc());
    r.putNote(note());
    r.putDocument({ ...doc(), path: 'D:/new/path.pdf' });
    expect(r.notes('doc1')).toHaveLength(1);
  });
  it('removes related notes, index, activity and timeline in one transaction', () => {
    const r = new Repository(SQL);
    r.putDocument(doc());
    r.putNote(note());
    r.indexPage('doc1', 2, 'local text');
    r.event('doc1', 'added');
    r.tick('doc1', 30);
    r.removeDocument('doc1');
    expect(r.documents()).toEqual([]);
    expect(r.notes()).toEqual([]);
    expect(r.events('doc1')).toEqual([]);
    expect(r.search('local')).toEqual([]);
    expect(r.rows('SELECT * FROM sessions')).toEqual([]);
    r.putDocument(doc());
    expect(r.documents()).toHaveLength(1);
  });
  it('updates a note and removes only that note', () => {
    const r = new Repository(SQL);
    r.putNote(note());
    r.putNote({ ...note(), body: '修订后的思考' });
    r.putNote(note('note2'));
    expect(r.notes()).toHaveLength(2);
    r.deleteNote('note1');
    expect(r.notes()[0].id).toBe('note2');
  });
  it('finds Chinese body text, tags, filenames and notes with page positions', () => {
    const r = new Repository(SQL);
    r.putDocument(doc());
    r.putNote(note());
    r.indexPage('doc1', 4, '我们通过安静阅读来发现新的知识。');
    expect(r.search('知识')[0]).toMatchObject({ docId: 'doc1', page: 4, kind: 'text' });
    expect(r.search('研究')[0].kind).toBe('document');
    expect(r.search('我的思考')[0]).toMatchObject({ kind: 'note', page: 2 });
    expect(r.search('真实文档')[0].kind).toBe('document');
  });
  it('treats SQL wildcard characters as literal search text', () => {
    const r = new Repository(SQL);
    r.indexPage('a', 1, '100% complete');
    r.indexPage('b', 1, 'unrelated');
    expect(r.search('%')).toHaveLength(1);
    expect(r.search("' OR 1=1 --")).toHaveLength(0);
  });
  it('re-indexes a page without duplicate results and supports document scoping', () => {
    const r = new Repository(SQL);
    r.indexPage('a', 1, 'first marker');
    r.indexPage('a', 1, 'second marker');
    r.indexPage('b', 1, 'second marker');
    expect(r.search('first')).toHaveLength(0);
    expect(r.search('second', 'a')).toHaveLength(1);
  });
  it('shows only genuine activity and completion statistics', () => {
    const r = new Repository(SQL);
    expect(r.stats().seconds).toBe(0);
    expect(r.stats().count).toBe(0);
    r.putDocument({ ...doc(), status: 'finished' });
    r.tick('doc1', 45);
    r.tick('doc1', 15);
    r.tick('doc2', 30);
    expect(r.stats()).toMatchObject({ seconds: 90, count: 2, finished: 1 });
  });
  it('rejects damaged files and future schema versions', () => {
    expect(() => new Repository(SQL, new TextEncoder().encode('not sqlite'))).toThrow();
    const r = new Repository(SQL);
    r.db.run('PRAGMA user_version=999');
    expect(() => new Repository(SQL, r.export())).toThrow('更新');
  });
});
describe('stable text anchors', () => {
  it('uses exact offsets when the selected original text still matches', () => {
    expect(resolveAnchor('abc hello world', { page: 1, quote: 'hello', start: 4 })).toEqual({
      start: 4,
      end: 9,
    });
  });
  it('restores the correct repeated quote using surrounding context after text changes', () => {
    const text = 'first: same. second: same!';
    expect(
      resolveAnchor(text, { page: 1, quote: 'same', start: 0, prefix: 'second: ', suffix: '!' }),
    ).toEqual({ start: 21, end: 25 });
  });
  it('returns no match instead of highlighting unrelated text', () => {
    expect(resolveAnchor('unchanged document', { page: 1, quote: 'missing quote' })).toBeNull();
  });
});
describe('input and endpoint boundaries', () => {
  it('recognizes all six formats and normalizes aliases', () => {
    expect(['book.PDF', 'a.epub', 'b.docx', 'c.txt', 'd.markdown', 'e.htm'].map(formatOf)).toEqual([
      'pdf',
      'epub',
      'docx',
      'txt',
      'md',
      'html',
    ]);
    expect(formatOf('script.exe')).toBeNull();
  });
  it('accepts secure remote services and local Ollama', () => {
    expect(endpointUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/chat/completions',
    );
    expect(endpointUrl('http://localhost:11434/v1')).toContain('/chat/completions');
  });
  it('rejects embedded credentials, non-web protocols and unencrypted remote services', () => {
    for (const url of [
      'file:///secret',
      'https://user:pass@example.com',
      'http://remote.example/v1',
      'javascript:alert(1)',
    ])
      expect(() => endpointUrl(url)).toThrow();
  });
  it('clamps invalid page input', () => {
    expect(clamp(NaN, 1, 10)).toBe(1);
    expect(clamp(999, 1, 10)).toBe(10);
  });
});
