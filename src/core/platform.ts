import { invoke, isTauri } from '@tauri-apps/api/core';
export const desktop = typeof window !== 'undefined' && isTauri();
let idbPromise: Promise<IDBDatabase> | undefined;
function idb() {
  return (idbPromise ??= new Promise((resolve, reject) => {
    const r = indexedDB.open('folio-local', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('data');
      r.result.createObjectStore('files');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export async function localRead(store: string, key: string): Promise<Uint8Array | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store).objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result ? new Uint8Array(r.result) : undefined);
    r.onerror = () => reject(r.error);
  });
}
export async function localWrite(store: string, key: string, value?: Uint8Array) {
  const db = await idb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    if (value) s.put(value, key);
    else s.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export const readDatabase = () =>
  desktop
    ? invoke<number[] | null>('load_database').then((x) => (x ? new Uint8Array(x) : undefined))
    : localRead('data', 'library');
export const saveDatabase = (bytes: Uint8Array) =>
  desktop
    ? invoke('save_database', { bytes: Array.from(bytes) })
    : localWrite('data', 'library', bytes);
export async function readBytes(id: string, path?: string) {
  const bytes =
    desktop && path
      ? new Uint8Array(await invoke<number[]>('read_document', { path }))
      : await localRead('files', id);
  if (!bytes) throw new Error('原文件已移动或浏览器文件副本不存在，请重新定位。');
  return bytes;
}
export interface ImportFile {
  name: string;
  bytes: Uint8Array;
  path?: string;
}
export async function pickNative(folder = false): Promise<ImportFile[]> {
  const paths = await invoke<string[]>('pick_documents', { folder });
  const result = [];
  for (const path of paths) {
    result.push({
      name: path.split(/[\\/]/).pop()!,
      path,
      bytes: new Uint8Array(await invoke<number[]>('read_document', { path })),
    });
  }
  return result;
}
export async function nativeDrop(paths: string[]): Promise<ImportFile[]> {
  const allowed = await invoke<string[]>('register_drop', { paths });
  const result = [];
  for (const path of allowed)
    result.push({
      name: path.split(/[\\/]/).pop()!,
      path,
      bytes: new Uint8Array(await invoke<number[]>('read_document', { path })),
    });
  return result;
}
export function download(
  name: string,
  content: string | Uint8Array,
  type = 'text/markdown;charset=utf-8',
) {
  const blob = new Blob(
    [typeof content === 'string' ? content : (content.slice().buffer as ArrayBuffer)],
    { type },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
