#!/usr/bin/env node
// 给自家机用的一条命令：ta 自己抽牌 / 出题让你在聊天卡里抽。不用后端，用的就是网页版同一套牌义和解读。
//
//   node cli/tarot.mjs draw  <今日|单张|三张|本周|关系> "问题"     ta 自己抽：打印人话 + 一行 [TAROT_CARD]{…}[/TAROT_CARD]
//   node cli/tarot.mjs offer <今日|单张|三张|本周|关系> "问题"     ta 出题：打印一行 [TAROT_OFFER]{…}[/TAROT_OFFER]
//   node cli/tarot.mjs read  '[TAROT_CARD]{…}[/TAROT_CARD]'         把一张卡翻成人话（她抽好贴过来的）
//   node cli/tarot.mjs deck                                         列 78 张牌
//   加 --json 只打印那一行卡片数据，不打印人话。
//
// 那一行 [TAROT_CARD] 贴进聊天页，用 js/tarot-card.js 画成卡；她在占星室「记录」里「貼入 ta 抽的牌」就能收进自己的记录。
// 需要 Node 18+。

import { CARDS, CARD_BY_ID, SPREADS } from '../js/data/deck.js';
import { build, render, spreadOf, cardData } from '../js/reading.js';

const ALIASES = { 今日: 'one', 今日一牌: 'one', 单张: 'one', 單張: 'one', 一张: 'one', 三张: 'three', 三張: 'three',
  本周: 'week', 本週: 'week', 每周: 'week', 关系: 'relation', 關係: 'relation', one: 'one', three: 'three', week: 'week', relation: 'relation' };

function nowISO() {
  const d = new Date(); const off = -d.getTimezoneOffset(); const sign = off >= 0 ? '+' : '-';
  const p = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
}
const newID = () => Math.random().toString(16).slice(2, 14).padEnd(12, '0');

function drawnText(reading) {
  const sp = spreadOf(reading.spread);
  const posname = Object.fromEntries(sp.positions.map((p) => [p.key, p.name]));
  const lines = [`🔮 抽好了（${sp.name}牌阵）。`];
  if (reading.question) lines.push(`问的是：${reading.question}`);
  for (const c of reading.cards) {
    const card = CARD_BY_ID[c.id] || {};
    const kws = card[c.reversed ? 'keywordsRev' : 'keywordsUp'] || [];
    const core = card[c.reversed ? 'meaningRev' : 'meaningUp'] || '';
    const head = sp.positions.length > 1 ? `【${posname[c.position] || ''}】` : '';
    lines.push(`${head}${card.name || c.id}（${c.reversed ? '逆位' : '正位'}）｜关键词：${kws.join('、')}｜${core}`);
  }
  const interp = reading.interp || build(reading);
  if (interp) { lines.push(''); lines.push(render(interp)); }
  return lines.join('\n');
}

function usage() {
  console.log(`用法：
  tarot.mjs draw  <今日|单张|三张|本周|关系> "问题"    自己抽一次
  tarot.mjs offer <今日|单张|三张|本周|关系> "问题"    出题让她在聊天卡里抽
  tarot.mjs read  '[TAROT_CARD]{…}[/TAROT_CARD]'      把一张卡翻成人话
  tarot.mjs deck                                      列 78 张牌
  --json 只打印卡片数据那一行`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const jsonOnly = argv.includes('--json');
const args = argv.filter((a) => a !== '--json');
const cmd = args[0];

if (cmd === 'deck') {
  for (const c of CARDS) console.log(`${c.id}\t${c.name}\t${c.en}\t正：${c.keywordsUp.join('、')}\t逆：${c.keywordsRev.join('、')}`);
  console.log('\n牌阵：' + SPREADS.map((s) => `${s.id}=${s.name}（${s.positions.map((p) => p.name).join('·')}）`).join('  '));
  process.exit(0);
}

if (cmd === 'read') {
  const m = /\[(TAROT_CARD|TAROT_OFFER)\]([\s\S]*?)\[\/\1\]/.exec(args.slice(1).join(' '));
  if (!m) usage();
  const data = JSON.parse(m[2]);
  const reading = { spread: data.spread, question: data.question, cards: data.cards.map((c) => ({ id: c.id, reversed: !!c.reversed, position: c.position })) };
  if (!reading.cards.length) { console.log(`她还没抽。题目：${data.question || '（无）'}，牌阵：${data.spread_name || spreadOf(data.spread).name}`); process.exit(0); }
  console.log(drawnText(reading));
  process.exit(0);
}

if (cmd !== 'draw' && cmd !== 'offer') usage();
const sid = ALIASES[(args[1] || '').trim()];
if (!sid) usage();
const sp = spreadOf(sid);
let question = (args.slice(2).join(' ') || '').trim().slice(0, 500);
if (/^今日/.test(args[1])) question = question || '每日一牌';
if (!question && cmd === 'draw') { console.error('抽牌要带问题'); process.exit(1); }

const id = newID(), ts = nowISO();
if (cmd === 'offer') {
  const offer = { id, ts, spread: sp.id, spread_name: sp.name, question, positions: sp.positions.map((p) => ({ key: p.key, name: p.name })), cards: [], done: false, interp: null };
  if (!jsonOnly) console.log(`🔮 出了题（${sp.name}牌阵）：${question || '（没写问题）'}\n把下面这行发进聊天页，她在卡里抽：`);
  console.log('[TAROT_OFFER]' + JSON.stringify(offer) + '[/TAROT_OFFER]');
  process.exit(0);
}

// draw：洗牌抽 n 张
const ids = CARDS.map((c) => c.id);
for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
const cards = sp.positions.map((p, i) => ({ id: ids[i], reversed: Math.random() < 0.5, position: p.key }));
const reading = { id, ts, spread: sp.id, question, cards, by: 'him' };
reading.interp = build(reading);
const card = cardData(reading, 'him');
if (!jsonOnly) { console.log(drawnText(reading)); console.log('\n把下面这行发进聊天页就是一张卡：'); }
console.log('[TAROT_CARD]' + JSON.stringify(card) + '[/TAROT_CARD]');
