#!/usr/bin/env node
// 固定解牌库的工具：看进度、查格式。文案写进 data/library/**/*.json 之后跑一下。
//
//   node cli/library.mjs stats          填了多少格（按主题 / 牌位分）
//   node cli/library.mjs check          查结构：牌 id 全不全、键名对不对、有没有多出来的字段
//   node cli/library.mjs todo [n]       列前 n 个还没写的格（默认 20），给写文案的人排队用
//   node cli/library.mjs sample [n]     从已写的格里随机抽 n 组（默认 8）：过去 / 未来 / 本周主线 / 需要注意 / 关系 ta / 阻碍 / 走向，走 build() 打印实际输出
//   node cli/library.mjs batch          一批写完跑这个：check + stats + 重复键 + sample
//
// 别的脚本也能 import { loadLibraryFromFS } 直接把库装进内存。

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CARDS } from '../js/data/deck.js';
import { loadLibraryFrom, coverage, THEMES, NORMAL_POSITIONS, RELATION_POSITIONS, NORMAL_FILES, THEME_NAMES, NORMAL_POSITION_NAMES, RELATION_POSITION_NAMES } from '../js/library.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'library');

export async function readLibraryFiles() {
  const normalParts = {};
  for (const f of NORMAL_FILES) normalParts[f] = JSON.parse(await readFile(path.join(DIR, 'normal', f + '.json'), 'utf8'));
  const relation = JSON.parse(await readFile(path.join(DIR, 'relation.json'), 'utf8'));
  return { normalParts, normal: Object.assign({}, ...Object.values(normalParts)), relation };
}
export async function loadLibraryFromFS() {
  const { normal, relation } = await readLibraryFiles();
  return loadLibraryFrom({ normal, relation });
}

/// JSON.parse 会悄悄吞掉重复的键，这里扫原文：同一个对象里同名键出现两次就报
function duplicateKeys(text, label) {
  const problems = [];
  const stack = [];   // 每层一个 Set
  let i = 0, inStr = false, esc = false, cur = '', keyPending = false, lastStr = '';
  while (i < text.length) {
    const ch = text[i];
    if (inStr) {
      if (esc) { esc = false; cur += ch; }
      else if (ch === '\\') { esc = true; }
      else if (ch === '"') { inStr = false; lastStr = cur; }
      else cur += ch;
    } else if (ch === '"') { inStr = true; cur = ''; }
    else if (ch === '{') stack.push(new Set());
    else if (ch === '}') stack.pop();
    else if (ch === ':') {
      const top = stack[stack.length - 1];
      if (top) { if (top.has(lastStr)) problems.push(`${label}: 重复键 "${lastStr}"`); top.add(lastStr); }
    }
    i++;
  }
  return problems;
}

async function duplicateKeyProblems() {
  const out = [];
  for (const f of NORMAL_FILES) out.push(...duplicateKeys(await readFile(path.join(DIR, 'normal', f + '.json'), 'utf8'), f + '.json'));
  out.push(...duplicateKeys(await readFile(path.join(DIR, 'relation.json'), 'utf8'), 'relation.json'));
  return out;
}

function check({ normalParts, normal, relation }) {
  const problems = [];
  const ids = new Set(CARDS.map((c) => c.id));
  for (const id of ids) {
    if (!normal[id]) problems.push(`normal 缺牌 ${id}`);
    if (!relation[id]) problems.push(`relation 缺牌 ${id}`);
  }
  for (const [id, card] of Object.entries(normal)) {
    if (!ids.has(id)) { problems.push(`normal 多了不认识的牌 ${id}`); continue; }
    for (const side of ['up', 'rev']) {
      if (!card[side]) { problems.push(`${id} 缺 ${side}`); continue; }
      for (const t of Object.keys(card[side])) if (!THEMES.includes(t)) problems.push(`${id}.${side} 多了主题 ${t}`);
      for (const t of THEMES) {
        if (!card[side][t]) { problems.push(`${id}.${side} 缺主题 ${t}`); continue; }
        for (const p of Object.keys(card[side][t])) if (!NORMAL_POSITIONS.includes(p)) problems.push(`${id}.${side}.${t} 多了牌位 ${p}`);
        for (const p of NORMAL_POSITIONS) if (typeof card[side][t][p] !== 'string') problems.push(`${id}.${side}.${t}.${p} 不是字符串`);
      }
    }
  }
  for (const [id, card] of Object.entries(relation)) {
    if (!ids.has(id)) { problems.push(`relation 多了不认识的牌 ${id}`); continue; }
    for (const side of ['up', 'rev']) {
      if (!card[side]) { problems.push(`relation ${id} 缺 ${side}`); continue; }
      for (const p of Object.keys(card[side])) if (!RELATION_POSITIONS.includes(p)) problems.push(`relation ${id}.${side} 多了牌位 ${p}`);
      for (const p of RELATION_POSITIONS) if (typeof card[side][p] !== 'string') problems.push(`relation ${id}.${side}.${p} 不是字符串`);
    }
  }
  // 牌放错文件
  for (const [f, part] of Object.entries(normalParts)) for (const id of Object.keys(part)) {
    const want = id.startsWith('major_') ? 'majors' : id.split('_')[0];
    if (want !== f) problems.push(`${id} 放在 ${f}.json，应该在 ${want}.json`);
  }
  return problems;
}

function todo({ normal, relation }, limit) {
  const out = [];
  for (const c of CARDS) {
    for (const side of ['up', 'rev']) {
      for (const t of THEMES) for (const p of NORMAL_POSITIONS) if (!(normal[c.id]?.[side]?.[t]?.[p] || '').trim()) out.push(`${c.id} ${c.name} ${side === 'up' ? '正位' : '逆位'} · ${THEME_NAMES[t]} · ${NORMAL_POSITION_NAMES[p]}`);
      for (const p of RELATION_POSITIONS) if (!(relation[c.id]?.[side]?.[p] || '').trim()) out.push(`${c.id} ${c.name} ${side === 'up' ? '正位' : '逆位'} · 关系 · ${RELATION_POSITION_NAMES[p]}`);
      if (out.length >= limit) return out.slice(0, limit);
    }
  }
  return out;
}

async function sample(files, n) {
  const { build } = await import('../js/reading.js');
  loadLibraryFrom(files);
  const filledCards = CARDS.filter((c) => THEMES.every((t) => NORMAL_POSITIONS.every((p) => (files.normal[c.id]?.up?.[t]?.[p] || '').trim())));
  if (!filledCards.length) { console.log('还没有写满的牌。'); return; }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const spots = [
    ['过去', () => ({ spread: 'three', question: pick(['', '这件事会怎么样', '我们之间', '这份工作']), pos: 'past' })],
    ['未来', () => ({ spread: 'three', question: pick(['', '他会回来吗', '这个项目', '我该不该换']), pos: 'future' })],
    ['本周主线', () => ({ spread: 'week', question: '本周运势', pos: 'axis' })],
    ['需要注意', () => ({ spread: 'week', question: '本周运势', pos: 'gentle' })],
    ['关系 ta', () => ({ spread: 'relation', question: '我们之间', pos: 'him' })],
    ['阻碍', () => ({ spread: 'relation', question: '我们之间', pos: 'block' })],
    ['走向', () => ({ spread: 'relation', question: '我们之间', pos: 'toward' })],
  ];
  for (let k = 0; k < n; k++) {
    const [label, mk] = spots[k % spots.length];
    const { spread, question, pos } = mk();
    const c = pick(filledCards); const rev = Math.random() < 0.5;
    const other = () => ({ id: pick(filledCards).id, reversed: Math.random() < 0.5 });
    let cards;
    if (spread === 'three') cards = ['past', 'present', 'future'].map((p) => ({ ...(p === pos ? { id: c.id, reversed: rev } : other()), position: p }));
    else if (spread === 'week') cards = ['axis', 'gentle', 'action'].map((p) => ({ ...(p === pos ? { id: c.id, reversed: rev } : other()), position: p }));
    else cards = RELATION_POSITIONS.map((p) => ({ ...(p === pos ? { id: c.id, reversed: rev } : other()), position: p }));
    const ip = build({ spread, question, cards });
    const hit = ip.cards.find((x) => x.position === pos);
    console.log(`[${label}] ${hit.name}${hit.reversed ? '逆位' : '正位'} · ${ip.category_name}（问：${question || '无'}）\n    ${hit.text}\n`);
  }
}

const cmd = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}`) {
  const files = await readLibraryFiles();
  if (cmd === 'sample') {
    await sample(files, parseInt(process.argv[3] || '8', 10));
  } else if (cmd === 'batch') {
    const problems = [...check(files), ...(await duplicateKeyProblems())];
    if (problems.length) { for (const p of problems) console.log('✗ ' + p); process.exitCode = 1; } else console.log('结构 / 重复键：没问题。');
    loadLibraryFrom(files);
    const c = coverage();
    console.log(`进度：普通 ${c.normal.filled}/${c.normal.total}   关系 ${c.relation.filled}/${c.relation.total}   合计 ${c.filled}/${c.total}`);
    const full = CARDS.filter((x) => THEMES.every((t) => NORMAL_POSITIONS.every((p) => (files.normal[x.id]?.up?.[t]?.[p] || '').trim() && (files.normal[x.id]?.rev?.[t]?.[p] || '').trim())) && RELATION_POSITIONS.every((p) => (files.relation[x.id]?.up?.[p] || '').trim() && (files.relation[x.id]?.rev?.[p] || '').trim()));
    const partial = CARDS.filter((x) => !full.includes(x) && (Object.values(files.normal[x.id]?.up || {}).some((t) => Object.values(t).some((v) => v.trim())) || RELATION_POSITIONS.some((p) => (files.relation[x.id]?.up?.[p] || '').trim())));
    console.log(`写满 74 格的牌：${full.length} 张（${full.map((x) => x.name).join('、')}）`);
    if (partial.length) console.log(`✗ 写了一半的牌（每张必须 74 格）：${partial.map((x) => x.name).join('、')}`);
    console.log('');
    await sample(files, 7);
  } else if (cmd === 'stats') {
    loadLibraryFrom(files);
    const c = coverage();
    console.log(`普通 ${c.normal.filled}/${c.normal.total}   关系 ${c.relation.filled}/${c.relation.total}   合计 ${c.filled}/${c.total}（${(100 * c.filled / c.total).toFixed(1)}%）`);
    console.log('按主题：' + THEMES.map((t) => `${THEME_NAMES[t]} ${c.byTheme[t]}`).join('  '));
    console.log('按牌位：' + [...NORMAL_POSITIONS, ...RELATION_POSITIONS].map((p) => `${NORMAL_POSITION_NAMES[p] || RELATION_POSITION_NAMES[p]} ${c.byPos[p]}`).join('  '));
  } else if (cmd === 'check') {
    const problems = check(files);
    problems.push(...(await duplicateKeyProblems()));
    if (!problems.length) console.log('结构没问题：78 张牌、键名、类型、无重复键。');
    else { for (const p of problems) console.log('✗ ' + p); process.exitCode = 1; }
  } else if (cmd === 'todo') {
    for (const line of todo(files, parseInt(process.argv[3] || '20', 10))) console.log(line);
  } else {
    console.log('用法：node cli/library.mjs stats | check | todo [n] | sample [n] | batch');
    process.exitCode = 1;
  }
}
