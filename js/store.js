// 记录存浏览器本地（IndexedDB）：占卜记录、AI 细解缓存、解牌回复、壁纸文件。
// 没有后端。想换设备就用「导出 / 导入」（app.js 里）。

import { build } from './reading.js';

const DB_NAME = 'chambre';
const DB_VER = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('readings')) db.createObjectStore('readings', { keyPath: 'id' }).createIndex('ts', 'ts');
      if (!db.objectStoreNames.contains('ai')) db.createObjectStore('ai', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbp;
}

function tx(store, mode, f) {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = f(s);
    t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}
const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
const put = (store, val, key) => tx(store, 'readwrite', (s) => (key === undefined ? s.put(val) : s.put(val, key)));
const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
const all = (store) => tx(store, 'readonly', (s) => s.getAll());

export function nowISO() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const p = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `.${p(d.getMilliseconds(), 3)}${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
}
export function newID() {
  const a = new Uint8Array(6); crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
}

// —— 记录 ——
// reading: {id, ts, spread, question, cards[{id, reversed, position}], by, asked_by, status, reply?}
// interp 不存，读出来现算（表改了老记录也跟着新）

function withInterp(r) {
  if (!r) return r;
  return { ...r, interp: build(r) };
}

export async function listReadings() {
  const rows = await all('readings');
  rows.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return rows.map(withInterp);
}
export async function getReading(id) { return withInterp(await get('readings', id)); }

export async function addReading({ spread, question, cards, by = 'her' }) {
  const r = { id: newID(), ts: nowISO(), spread, question: (question || '').trim().slice(0, 500),
    cards, by, asked_by: '', status: 'done', asked: false };
  await put('readings', r);
  return withInterp(r);
}
export async function updateReading(id, patch) {
  const r = await get('readings', id);
  if (!r) return null;
  const n = { ...r, ...patch };
  await put('readings', n);
  return withInterp(n);
}
export async function deleteReading(id) {
  await del('readings', id);
  const ais = await all('ai');
  for (const a of ais) if (a.reading_id === id) await del('ai', a.key);
}

// —— AI 细解缓存 ——
export async function aiGet(id, category) {
  if (category) return get('ai', `${id}|${category}`);
  const ais = (await all('ai')).filter((a) => a.reading_id === id);
  ais.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return ais[0] || null;
}
export async function aiPut(id, category, body) {
  const row = { key: `${id}|${category}`, reading_id: id, category, ts: nowISO(), ...body };
  await put('ai', row);
  return row;
}

// —— 文件（壁纸）——
export const fileGet = (key) => get('files', key);
export const filePut = (key, blob) => put('files', blob, key);
export const fileDelete = (key) => del('files', key);

// —— 导出 / 导入（换设备用；壁纸和设置不带）——
export async function exportAll() {
  return { app: 'chambre', version: 1, exported: nowISO(), readings: await all('readings'), ai: await all('ai') };
}
export async function importAll(data) {
  if (!data || data.app !== 'chambre' || !Array.isArray(data.readings)) throw new Error('不是占星室导出的文件');
  let n = 0;
  for (const r of data.readings) if (r && r.id && r.spread && Array.isArray(r.cards)) { await put('readings', r); n++; }
  for (const a of data.ai || []) if (a && a.key) await put('ai', a);
  return n;
}
