import { createEngine } from '../readers/engine';
import type { ReadingEngine } from '../readers/engine';
import { repository, flush } from './database';
import { useApp, mutate } from './store';
import { desktop, localWrite, readBytes } from './platform';
import type { ImportFile } from './platform';
import { formatOf } from './types';
import type { FolioDocument } from './types';
const engines = new Map<string, Promise<ReadingEngine>>();
const indexing = new Set<string>();
async function fingerprint(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer)),
  )
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export function getEngine(doc: FolioDocument) {
  let e = engines.get(doc.id);
  if (!e) {
    e = readBytes(doc.id, doc.path).then(async (bytes) => {
      if ((await fingerprint(bytes)) !== doc.id) {
        throw new Error(
          '原文件内容已经改变。请作为新文档导入，或重新定位到内容一致的原文件；原有笔记已保留。',
        );
      }
      return createEngine(doc.format, bytes);
    });
    engines.set(doc.id, e);
    e.catch(() => engines.delete(doc.id));
  }
  return e;
}
export async function releaseEngines(keep: string[]) {
  for (const [id, promise] of engines)
    if (!keep.includes(id) && !indexing.has(id)) {
      engines.delete(id);
      void promise.then((e) => e.destroy()).catch(() => {});
    }
}
export async function importFiles(files: ImportFile[], relocateId?: string) {
  let added = 0,
    duplicates = 0;
  const errors: string[] = [];
  let lastId = '';
  for (const file of files) {
    const format = formatOf(file.name);
    if (!format) {
      errors.push(`${file.name}：不支持的格式`);
      continue;
    }
    if (file.bytes.length > 250 * 1024 * 1024) {
      errors.push(`${file.name}：首版支持最大 250 MB`);
      continue;
    }
    try {
      const hash = await fingerprint(file.bytes);
      if (relocateId && hash !== relocateId)
        throw new Error('所选文件与原文档内容不同，未覆盖原批注。');
      const old = repository.documents().find((x) => x.id === hash);
      if (old) {
        if (!desktop || !file.path) await localWrite('files', hash, file.bytes);
        mutate(() =>
          repository.putDocument({ ...old, path: file.path || old.path, name: file.name }),
        );
        duplicates++;
        lastId = hash;
        continue;
      }
      const engine = await createEngine(format, file.bytes);
      if (!desktop || !file.path) await localWrite('files', hash, file.bytes);
      const doc: FolioDocument = {
        id: hash,
        name: file.name,
        format,
        path: file.path,
        size: file.bytes.length,
        added: Date.now(),
        opened: 0,
        page: 1,
        total: engine.count,
        progress: 0,
        favorite: false,
        status: 'unread',
        tags: [],
        shelf: '',
        indexed: false,
      };
      mutate(() => {
        repository.putDocument(doc);
        repository.event(hash, '导入文档');
      });
      engines.set(hash, Promise.resolve(engine));
      added++;
      lastId = hash;
      void indexDocument(doc, engine);
    } catch (e) {
      errors.push(`${file.name}：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await flush();
  const { notify, open } = useApp.getState();
  notify(
    `${added} 份文档已导入${duplicates ? `，${duplicates} 份重复文件已关联` : ''}${errors.length ? '。' + errors.join('；') : ''}`,
  );
  if (lastId) open(lastId);
  return { added, duplicates, errors };
}
export async function indexDocument(doc: FolioDocument, engine: ReadingEngine) {
  if (doc.indexed || indexing.has(doc.id)) return;
  indexing.add(doc.id);
  try {
    repository.clearIndex(doc.id);
    for (let n = 1; n <= engine.count; n++) {
      const text = await engine.text(n);
      if (!repository.documents().some((d) => d.id === doc.id)) return;
      repository.indexPage(doc.id, n, text);
      if (n % 5 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    let cover: string | undefined;
    if (engine.pdf && typeof CanvasRenderingContext2D !== 'undefined') {
      try {
        const page = await engine.pdf.getPage(1),
          original = page.getViewport({ scale: 1 }),
          viewport = page.getViewport({ scale: 200 / original.width });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        cover = canvas.toDataURL('image/webp', 0.7);
        canvas.width = 0;
        canvas.height = 0;
      } catch {
        /* A missing preview must never prevent indexing or reading. */
      }
    }
    useApp
      .getState()
      .updateDoc(doc.id, { indexed: true, total: engine.count, ...(cover ? { cover } : {}) });
    await flush();
  } catch {
    useApp.getState().notify('文本索引尚未完成，重新打开文档后会重试。');
  } finally {
    indexing.delete(doc.id);
    const state = useApp.getState();
    if (!state.tabs.includes(doc.id) && state.split !== doc.id) {
      setTimeout(() => {
        const current = useApp.getState();
        if (!current.tabs.includes(doc.id) && current.split !== doc.id)
          void releaseEngines([...current.tabs, ...(current.split ? [current.split] : [])]);
      }, 2000);
    }
  }
}
export async function removeDocument(id: string) {
  mutate(() => repository.removeDocument(id));
  useApp.getState().close(id);
  await releaseEngines(useApp.getState().tabs);
  await localWrite('files', id);
  await flush();
}
export function notesMarkdown(docId?: string) {
  const docs = repository.documents();
  return (
    '# ' +
    (docId ? docs.find((d) => d.id === docId)?.name : '灵感收集箱') +
    '\n\n' +
    repository
      .notes(docId)
      .filter((n) => (!docId ? n.kind === 'excerpt' : true))
      .map(
        (n) =>
          `## ${docs.find((d) => d.id === n.docId)?.name || '文档'} · 第 ${n.anchor.page} 页 / 节\n\n> ${n.anchor.quote.replaceAll('\n', '\n> ')}\n\n${n.body}\n\n${new Date(n.created).toLocaleString()}\n`,
      )
      .join('\n---\n\n')
  );
}
