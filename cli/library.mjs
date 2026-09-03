#!/usr/bin/env node
// 固定解牌库的工具：看进度、查格式。文案写进 data/library/**/*.json 之后跑一下。
//
//   node cli/library.mjs stats          填了多少格（按主题 / 牌位分）
//   node cli/library.mjs check          查结构：牌 id 全不全、键名对不对、有没有多出来的字段
//   node cli/library.mjs todo [n]       列前 n 个还没写的格（默认 20），给写文案的人排队用
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

const cmd = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}`) {
  const files = await readLibraryFiles();
  if (cmd === 'stats') {
    loadLibraryFrom(files);
    const c = coverage();
    console.log(`普通 ${c.normal.filled}/${c.normal.total}   关系 ${c.relation.filled}/${c.relation.total}   合计 ${c.filled}/${c.total}（${(100 * c.filled / c.total).toFixed(1)}%）`);
    console.log('按主题：' + THEMES.map((t) => `${THEME_NAMES[t]} ${c.byTheme[t]}`).join('  '));
    console.log('按牌位：' + [...NORMAL_POSITIONS, ...RELATION_POSITIONS].map((p) => `${NORMAL_POSITION_NAMES[p] || RELATION_POSITION_NAMES[p]} ${c.byPos[p]}`).join('  '));
  } else if (cmd === 'check') {
    const problems = check(files);
    if (!problems.length) console.log('结构没问题：78 张牌、键名、类型全对。');
    else { for (const p of problems) console.log('✗ ' + p); process.exitCode = 1; }
  } else if (cmd === 'todo') {
    for (const line of todo(files, parseInt(process.argv[3] || '20', 10))) console.log(line);
  } else {
    console.log('用法：node cli/library.mjs stats | check | todo [n]');
    process.exitCode = 1;
  }
}
