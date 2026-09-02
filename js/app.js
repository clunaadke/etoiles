// 占星室 网页版 · 整间屋。移植自 Alcove iOS TarotRoomView.swift（2026-09-03）。
// 三个 phase：pick（选牌阵 + 所问）→ draw（牌带抽牌）→ result（结果）。
// 抽屉：记录 / 图鉴 / 装修 / 设置（AI）。数据全在浏览器本地（store.js）。

import { CARDS, CARD_BY_ID, SPREADS } from './data/deck.js';
import { build, CATEGORIES, DAILY_QUESTION, WEEKLY_QUESTION, spreadOf, cardData, askText } from './reading.js';
import { decor, TINT_PRESETS, GLASS_PRESETS, rgbToHex } from './decor.js';
import * as store from './store.js';
import { cardFace, cardBack, emptySlot, preloadAll } from './cards.js';
import { DeckBand } from './band.js';
import { loadAI, saveAI, aiReady, readerLabel, homeLabel, aiDetail, aiAsk } from './ai.js';
import { renderTicket, saveImage } from './ticket.js';
import { parseMessage } from './tarot-card.js';

// —— 小工具 ——
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  palette: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-.9 2-1.8 0-.6-.3-1-.6-1.5-.3-.4-.5-.8-.5-1.3 0-1 .8-1.7 1.8-1.7H16a5 5 0 0 0 5-5c0-3.9-4-6.7-9-6.7z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/><circle cx="17" cy="11" r="1"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v5l3 2"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  bubble: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M19 10h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-4-3h-3"/></svg>',
};
const svg = (name) => { const t = document.createElement('template'); t.innerHTML = ICON[name]; return t.content.firstChild; };
const rc = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((x) => x != null && x !== false));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let toastTimer = 0;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function dateText(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return (ts || '').slice(0, 10);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function isToday(ts) { const d = new Date(ts), n = new Date(); return d.toDateString() === n.toDateString(); }
function isThisWeek(ts) {
  const d = new Date(ts), n = new Date();
  const monday = (x) => { const m = new Date(x); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m.getTime(); };
  return monday(d) === monday(n);
}

// —— 星星 ——
function startStars() {
  const cv = document.querySelector('#sky canvas');
  const ctx = cv.getContext('2d');
  let s = 0x5EED7A20n;
  const next = () => { s = (s * 6364136223846793005n + 1442695040888963407n) & 0xFFFFFFFFFFFFFFFFn; return Number((s >> 33n) & 0xFFFFn) / 65535; };
  const stars = Array.from({ length: 170 }, () => ({ x: next(), y: next(), r: 0.5 + next() * 1.3, ph: next() * 6.28 }));
  let w = 0, hh = 0, dpr = 1;
  const resize = () => { dpr = Math.min(2, devicePixelRatio || 1); w = cv.clientWidth; hh = cv.clientHeight; cv.width = w * dpr; cv.height = hh * dpr; };
  resize(); addEventListener('resize', resize);
  let last = 0;
  const frame = (t) => {
    requestAnimationFrame(frame);
    if (t - last < 83 || document.hidden || document.documentElement.dataset.stars === '0') return;
    last = t;
    const col = getComputedStyle(document.documentElement).getPropertyValue('--star').trim() || '#fff';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    const tt = t / 1000;
    for (const st of stars) {
      const tw = 0.55 + 0.45 * Math.sin(tt * 1.3 + st.ph);
      const r = st.r * (0.8 + 0.4 * tw);
      ctx.globalAlpha = 0.35 + 0.55 * tw;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(st.x * w, st.y * hh, r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  requestAnimationFrame(frame);
}

// —— 状态 ——
const S = {
  phase: 'pick', spread: null, question: '', deckOrder: [], drawn: [], chosen: null,
  reading: null, stackShowsWeek: false, readings: [], busy: false,
};
let band = null;
const app = document.getElementById('app');

async function reloadReadings() { S.readings = await store.listReadings(); }

// —— 头 ——
function header() {
  return h('div', { class: 'header' },
    h('button', { class: 'ib', onclick: goBack, 'aria-label': '返回' }, svg('back')),
    h('button', { class: 'ib', onclick: () => openSheet(settingsSheet()), 'aria-label': '设置' }, svg('gear')),
    h('div', { class: 'title' }, h('div', { class: 'fr' }, 'Chambre des Étoiles'), h('div', { class: 'zh' }, '占星室')),
    h('button', { class: 'ib', onclick: () => openSheet(decorSheet()), 'aria-label': '装修' }, svg('palette')),
    h('button', { class: 'ib', onclick: () => openSheet(historySheet()), 'aria-label': '记录' }, svg('clock')),
  );
}

function goBack() {
  if (S.phase === 'pick') { toast('已经在门口了'); return; }
  reset();
}

function render() {
  if (band) { band.destroy(); band = null; }
  rc(app, header(), h('div', { class: 'page' },
    S.phase === 'pick' ? pickView() : S.phase === 'draw' ? drawView() : readingView(S.reading, { onAgain: reset })));
}

// —— 选牌阵 + 问题 ——
const DAILY = { id: 'one', cardID: 'major_19', name: '今日一牌', hint: '听听今天想告诉你的话' };
const WEEK = { id: 'week', cardID: 'major_17', name: '本周運勢', hint: '本周主轴 · 行动建议 · 温柔提醒' };
const ENTRIES = [
  { id: 'one', cardID: 'major_01', name: '單張' },
  { id: 'three', cardID: 'major_18', name: '三張' },
  { id: 'relation', cardID: 'major_06', name: '關係' },
];

function pickView() {
  const isPeriodic = S.question === DAILY_QUESTION || S.question === WEEKLY_QUESTION;
  const cardW = Math.min(100, (Math.min(innerWidth, 480) - 36 - 22) / 2 - 12);
  const entries = h('div', { class: 'entries' }, periodicStack(cardW), ENTRIES.map((e) => {
    const sp = spreadOf(e.id);
    const sel = S.spread?.id === e.id && !isPeriodic;
    return h('button', { class: 'entry' + (sel ? ' sel' : ''), onclick: () => {
      if (isPeriodic) S.question = '';
      S.spread = sp; render();
    } }, cardFace(e.cardID, { width: cardW, lazy: false }), h('div', { class: 'name' }, e.name), h('div', { class: 'hint' }, sp.hint));
  }));
  const ta = h('textarea', { rows: 1, placeholder: '想问什么，或在心中默念', value: isPeriodic ? '' : S.question,
    oninput: (e) => { S.question = e.target.value; e.target.style.height = 'auto'; e.target.style.height = Math.min(110, e.target.scrollHeight) + 'px'; } });
  const btn = h('button', { class: 'gbtn', disabled: !S.spread, onclick: () => { ta.blur(); startDrawing(); } }, S.spread ? '洗牌' : '先點一張牌選牌陣');
  return h('div', { class: 'scroll pick' },
    entries,
    h('button', { class: 'comprow glass', onclick: () => openSheet(compendiumSheet()) },
      h('div', { class: 'fan' }, ['major_00', 'major_02', 'major_09', 'major_21'].map((id) => cardFace(id, { width: 30, lazy: false }))),
      h('div', null, h('div', { class: 't' }, '牌義圖鑑'), h('div', { class: 's' }, '78 张牌，正逆位的关键词和一句解')),
      h('span', { class: 'chev', html: ICON.chev })),
    h('div', { class: 'ask' }, h('div', { class: 'label' }, '所問'), h('div', { class: 'glass' }, ta)),
    btn,
  );
}

function periodicStack(width) {
  const top = S.stackShowsWeek ? WEEK : DAILY;
  const under = S.stackShowsWeek ? DAILY : WEEK;
  const topEl = cardFace(top.cardID, { width, lazy: false }); topEl.classList.add('top');
  const underEl = cardFace(under.cardID, { width, lazy: false }); underEl.classList.add('under');
  const stack = h('div', { class: 'stack', style: `width:${width + 24}px;height:${Math.round(width * 1.72) + 8}px` }, underEl, topEl);
  let sx = null, moved = false;
  stack.addEventListener('pointerdown', (e) => { sx = e.clientX; moved = false; stack.setPointerCapture?.(e.pointerId); topEl.style.transition = 'none'; });
  stack.addEventListener('pointermove', (e) => {
    if (sx == null) return;
    const dx = Math.max(-60, Math.min(60, e.clientX - sx));
    if (Math.abs(dx) > 8) moved = true;
    topEl.style.transform = `translateX(${dx * 0.55}px) rotate(${-3 + dx / 30}deg)`;
  });
  const up = (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx; sx = null;
    topEl.style.transition = '';
    if (Math.abs(dx) > 28) { S.stackShowsWeek = !S.stackShowsWeek; render(); return; }
    topEl.style.transform = '';
    if (!moved) { if (S.stackShowsWeek) startWeekly(); else startDaily(); }
  };
  stack.addEventListener('pointerup', up); stack.addEventListener('pointercancel', up);
  return h('div', { class: 'entry' }, stack,
    h('div', { class: 'name' }, top.name),
    h('div', { class: 'hint' }, top.hint),
    h('div', { class: 'dots', style: 'display:flex;gap:4px;margin-top:-22px' },
      h('i', { class: 'dot' + (S.stackShowsWeek ? '' : ' on'), style: `width:4px;height:4px;border-radius:50%;background:var(--gold);opacity:${S.stackShowsWeek ? .3 : .9}` }),
      h('i', { style: `width:4px;height:4px;border-radius:50%;background:var(--gold);opacity:${S.stackShowsWeek ? .9 : .3}` })));
}

function startDaily() {
  const r = S.readings.find((x) => x.question === DAILY_QUESTION && isToday(x.ts));
  if (r) { S.reading = r; S.phase = 'result'; render(); return; }
  S.spread = spreadOf('one'); S.question = DAILY_QUESTION; startDrawing();
}
function startWeekly() {
  const r = S.readings.find((x) => x.question === WEEKLY_QUESTION && isThisWeek(x.ts));
  if (r) { S.reading = r; S.phase = 'result'; render(); return; }
  S.spread = spreadOf('week'); S.question = WEEKLY_QUESTION; startDrawing();
}

// —— 抽牌 ——
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function nextPosition() { return S.spread && S.drawn.length < S.spread.positions.length ? S.spread.positions[S.drawn.length] : null; }
function slotWidth(sp) { const n = sp.positions.length; return n === 1 ? 120 : n === 3 ? 92 : 60; }

function startDrawing() {
  if (!S.spread) return;
  S.deckOrder = shuffle(CARDS.map((c) => c.id));
  S.drawn = []; S.chosen = null; S.phase = 'draw';
  preloadAll(S.deckOrder.slice(0, 20));
  render();
}

function drawView() {
  const sp = S.spread;
  const nx = nextPosition();
  const w = slotWidth(sp);
  const slots = h('div', { class: 'slots' }, sp.positions.map((pos) => {
    const d = S.drawn.find((x) => x.position === pos.key);
    return h('div', null, d ? cardFace(d.id, { reversed: d.reversed, width: w, lazy: false }) : emptySlot({ width: w, active: pos.key === nx?.key }),
      h('div', { class: 'pn' + (pos.key === nx?.key ? ' on' : '') }, pos.name));
  }));
  const mid = h('div', { class: 'mid' });
  if (S.chosen) mid.append(bigCard(S.chosen));
  else if (nx) mid.append(h('div', { class: 't' }, `为「${nx.name}」抽一张`), h('div', { class: 's' }, '左右滑动整副牌，中间那张再点一下就是它'));
  const bandHost = h('div', { class: 'band' + (S.chosen ? ' hide' : '') });
  const view = h('div', { class: 'draw' }, slots, mid, bandHost);
  requestAnimationFrame(() => {
    if (band) band.destroy();
    band = new DeckBand(bandHost, { deck: S.deckOrder, onChoose: choose });
  });
  return view;
}

function bigCard(c) {
  const w = 176;
  const card = CARD_BY_ID[c.id];
  const front = cardFace(c.id, { reversed: false, width: w, lazy: false }); front.classList.add('front'); if (c.reversed) front.classList.add('reversed');
  const back = cardBack({ width: w });
  const inner = h('div', { class: 'inner', style: `width:${w}px;height:${Math.round(w * 1.72)}px` }, back, front);
  const flip = h('div', { class: 'flip' }, inner);
  const el = h('div', { class: 'bigcard' }, flip,
    h('div', { class: 'nm' }, card.name, h('span', { class: 'tag ' + (c.reversed ? 'gold' : 'tint') }, c.reversed ? '逆位' : '正位')),
    h('div', { class: 'kw' }, (c.reversed ? card.keywordsRev : card.keywordsUp).join(' · ')));
  // 1) 放大  2) 翻面
  requestAnimationFrame(() => { flip.style.transition = 'transform .42s cubic-bezier(.2,.9,.3,1.15)'; flip.style.transform = 'scale(1)'; });
  setTimeout(() => { if (S.phase === 'draw' && S.chosen === c) { flip.classList.add('on'); setTimeout(() => el.classList.add('face'), 280); } }, 420);
  return el;
}

function choose(index) {
  const pos = nextPosition();
  if (S.chosen || !pos || index >= S.deckOrder.length) return;
  const id = S.deckOrder.splice(index, 1)[0];
  const pick = { id, reversed: Math.random() < 0.5, position: pos.key };
  S.chosen = pick;
  const page = app.querySelector('.page .draw');
  page.querySelector('.band').classList.add('hide');
  const mid = page.querySelector('.mid');
  rc(mid, bigCard(pick));
  // 3) 落进牌阵
  setTimeout(() => {
    if (S.phase !== 'draw' || S.chosen !== pick) return;
    S.drawn.push(pick); S.chosen = null;
    if (nextPosition()) { render(); }
    else finish();
  }, 1900);
}

async function finish() {
  S.busy = true;
  const r = await store.addReading({ spread: S.spread.id, question: S.question.trim(), cards: S.drawn });
  S.busy = false;
  await reloadReadings();
  S.reading = r; S.phase = 'result'; render();
}

function reset() {
  S.phase = 'pick'; S.reading = null; S.drawn = []; S.chosen = null;
  if (S.question === DAILY_QUESTION || S.question === WEEKLY_QUESTION) S.question = '';
  render();
}

// —— 结果 ——
export function readingView(reading, { onAgain, onDelete } = {}) {
  const sp = spreadOf(reading.spread);
  const st = { interp: reading.interp, category: null, interpBusy: false, ai: null, aiBusy: false, aiError: '', asking: false, saving: false };
  const glass = (...c) => h('div', { class: 'glass' }, ...c);
  const para = (t, b) => h('div', { class: 'para' }, h('div', { class: 'pt' }, t), h('div', { class: 'pb' }, b));

  const root = h('div', { class: 'scroll result' });
  const head = h('div', { class: 'head' }, h('div', { class: 'r' }, 'READING'),
    h('div', { class: 'd' }, dateText(reading.ts), h('span', { class: 'tag tint' }, sp.name),
      reading.by === 'him' || reading.asked_by === 'him' ? h('span', { class: 'tag gold' }, reading.by === 'him' ? '他抽的' : '他出的題') : null));
  root.append(head);
  if (reading.question) root.append(h('div', { class: 'glass q' }, h('div', { class: 'label', style: 'padding:0' }, '所問'), h('div', { class: 't' }, reading.question)));
  for (const d of reading.cards) {
    const card = CARD_BY_ID[d.id];
    const posName = sp.positions.find((p) => p.key === d.position)?.name || '';
    root.append(h('div', { class: 'glass cardblock' },
      sp.positions.length > 1 ? h('div', { class: 'pos' }, posName) : null,
      cardFace(d.id, { reversed: d.reversed, width: 150, lazy: false }),
      h('div', { class: 'nm' }, card?.name || d.id, h('span', { class: 'tag ' + (d.reversed ? 'gold' : 'tint') }, d.reversed ? '逆位' : '正位')),
      card ? h('div', { class: 'pills' }, (d.reversed ? card.keywordsRev : card.keywordsUp).map((k) => h('span', { class: 'pill' }, k))) : null,
      card ? h('div', { class: 'mean' }, d.reversed ? card.meaningRev : card.meaningUp) : null));
  }

  // 客观解读
  const interpBox = h('div', { class: 'glass block' });
  function drawInterp() {
    const ip = st.interp;
    if (!ip) { rc(interpBox); return; }
    const cats = h('div', { class: 'cats' }, Object.entries(CATEGORIES).map(([id, name]) => {
      const on = (st.category || ip.category) === id;
      const label = { love: '感情', work: '事業', self: '自我', daily: '日常' }[id] || name;
      return h('button', { class: 'pillbtn' + (on ? ' on' : ''), onclick: () => { st.category = id; st.interp = build(reading, id); drawInterp(); } }, label);
    }));
    rc(interpBox, 
      h('div', { class: 'bh' }, '客觀解讀'),
      cats,
      para('整體印象', ip.overall),
      ...ip.cards.map((c) => h('div', { class: 'icard' },
        h('div', { class: 'h' }, ip.cards.length > 1 && c.position_name ? h('span', { class: 'p' }, c.position_name) : null, c.name,
          h('span', { class: 'rv', style: `color:${c.reversed ? 'var(--gold)' : 'var(--tint)'}` }, c.reversed ? '逆位' : '正位')),
        h('div', { class: 'intro' }, c.intro), h('div', { class: 'tx' }, c.text),
        c.advice ? h('div', { class: 'adv' }, '→ ' + c.advice) : null)),
      ip.relations.length ? para('牌面關係', ip.relations.join('\n')) : null,
      ip.advice.length ? para('建議', ip.advice.map((a) => '· ' + a).join('\n')) : null,
      para('一句話', ip.oneline));
  }
  drawInterp();
  root.append(interpBox);

  // AI 细解
  const aiBox = h('div', { class: 'glass block' });
  function drawAI() {
    const a = st.ai;
    const kids = [h('div', { class: 'bh' }, 'AI 細解', a ? h('button', { class: 'r hand', disabled: st.aiBusy, onclick: () => runAI(true) }, st.aiBusy ? '寫著…' : '重寫') : null)];
    if (a) {
      kids.push(para('整體印象', a.overall));
      for (const c of a.cards) kids.push(h('div', { class: 'icard' }, h('div', { class: 'h' }, c.name), h('div', { class: 'tx' }, c.reading)));
      if (a.relations) kids.push(para('牌面關係', a.relations));
      if (a.advice) kids.push(para('建議', a.advice));
      if (a.oneline) kids.push(para('一句話', a.oneline));
    } else {
      kids.push(h('div', { class: 'muted' }, '很想深挖的时候再按。一个不认识你的塔罗师，只看牌，写得很细。走设置里「接別的模型」填的接口。'));
      kids.push(h('button', { class: 'gbtn quiet', style: 'font-size:14px;padding:11px', disabled: st.aiBusy, onclick: () => runAI(false) },
        st.aiBusy ? h('span', { class: 'spin' }) : null, st.aiBusy ? '寫著，要半分鐘…' : '讓 AI 細解'));
    }
    if (st.aiError) kids.push(h('div', { class: 'err' }, st.aiError));
    rc(aiBox, ...kids);
  }
  async function runAI(force) {
    if (st.aiBusy) return;
    if (!aiReady()) { toast('先去设置里填 AI 的地址、密钥和模型'); openSheet(settingsSheet()); return; }
    st.aiBusy = true; st.aiError = ''; drawAI();
    try { st.ai = await aiDetail(reading, st.category || st.interp?.category, { force }); }
    catch (e) { st.aiError = 'AI 没写出来：' + (e.message || e); }
    st.aiBusy = false; drawAI();
  }
  drawAI();
  store.aiGet(reading.id).then((hit) => { if (hit && !st.ai) { st.ai = hit; drawAI(); } });
  root.append(aiBox);

  // 讓 ta 解牌：两条路。一条是复制成一段话，贴给自家机（陈璟那样的、跑在自己电脑上的 AI）；
  // 一条是接别的模型（设置里填的接口），回复存进这条记录。
  const askBox = h('div', null);
  function drawAsk() {
    const home = homeLabel();
    const kids = [];
    kids.push(h('button', { class: 'gbtn', style: 'margin-top:4px', onclick: async () => {
      const text = askText(reading, home);
      try { await navigator.clipboard.writeText(text); toast(`复制好了，贴给${home}就行`); }
      catch { toast('复制不了，浏览器不给'); }
      if (!reading.asked) { reading.asked = true; await store.updateReading(reading.id, { asked: true }); await reloadReadings(); }
    } }, h('span', { html: ICON.bubble }), `複製給${home}`));
    if (reading.reply) {
      kids.push(h('div', { class: 'glass block', style: 'margin-top:12px' }, h('div', { class: 'bh' }, `${reading.reply.name || '模型'} 解的牌`,
        h('button', { class: 'r hand', disabled: st.asking, onclick: () => runAsk() }, st.asking ? '解著…' : '再解一次')),
        h('div', { class: 'reply' }, reading.reply.text)));
    } else {
      kids.push(h('button', { class: 'gbtn quiet', style: 'margin-top:10px;font-size:15px', disabled: st.asking, onclick: () => runAsk() },
        st.asking ? h('span', { class: 'spin' }) : null, st.asking ? '模型看著牌…' : '讓別的模型解牌'));
    }
    if (st.askError) kids.push(h('div', { class: 'err', style: 'text-align:center;margin-top:6px' }, st.askError));
    rc(askBox, ...kids);
  }
  async function runAsk() {
    if (st.asking) return;
    if (!aiReady()) { toast('先去设置里填模型的地址、密钥和模型名'); openSheet(settingsSheet()); return; }
    st.asking = true; st.askError = ''; drawAsk();
    try {
      const text = await aiAsk(reading);
      reading.reply = { name: readerLabel(), text, ts: store.nowISO() };
      await store.updateReading(reading.id, { reply: reading.reply });
      await reloadReadings();
    } catch (e) { st.askError = '没解出来：' + (e.message || e); }
    st.asking = false; drawAsk();
  }
  drawAsk();
  root.append(askBox);

  root.append(h('div', { class: 'linkrow' },
    onAgain ? h('button', { onclick: onAgain }, '再抽一次') : null,
    h('button', { onclick: async (e) => {
      if (st.saving) return; st.saving = true; e.target.textContent = '存着…';
      try { const blob = await renderTicket(reading, st.interp); await saveImage(blob, `tarot-${dateText(reading.ts)}.png`); toast('图片好了'); }
      catch (err) { toast('没画出来：' + (err.message || err)); }
      st.saving = false; e.target.textContent = '存成圖片';
    } }, '存成圖片'),
    h('button', { onclick: () => copyCard(reading) }, '複製聊天卡'),
    onDelete ? h('button', { onclick: onDelete }, '刪除這一條') : null,
  ));
  return root;
}

/// 把这次的牌复制成聊天卡数据（[TAROT_CARD]{json}[/TAROT_CARD]），塞进自己的聊天页
async function copyCard(reading) {
  const text = '[TAROT_CARD]' + JSON.stringify(cardData(reading)) + '[/TAROT_CARD]';
  try { await navigator.clipboard.writeText(text); toast('聊天卡复制好了，贴到你的聊天页去'); }
  catch { toast('复制不了，浏览器不给'); }
}

// —— 抽屉 ——
let sheetDepth = 0;
function openSheet(el) {
  document.body.append(el);
  sheetDepth++;
  history.pushState({ sheet: sheetDepth }, '');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  el._close = () => { el.classList.remove('open'); setTimeout(() => el.remove(), 320); };
  return el;
}
function closeTop() {
  const sheets = document.querySelectorAll('.sheet');
  const top = sheets[sheets.length - 1];
  if (top) { top._close(); sheetDepth--; }
}
addEventListener('popstate', () => {
  const sheets = document.querySelectorAll('.sheet');
  if (sheets.length) { const top = sheets[sheets.length - 1]; top._close(); sheetDepth = Math.max(0, sheetDepth - 1); }
  else if (S.phase !== 'pick') reset();
});
function sheet({ title, sky = false, close = 'x', onClose } = {}, body) {
  const el = h('div', { class: 'sheet' + (sky ? ' sky' : '') },
    h('div', { class: 'bar' },
      h('button', { class: 'ib', onclick: () => { history.back(); } }, close === 'back' ? svg('back') : null),
      h('div', { class: 't' }, title),
      h('button', { class: 'ib', onclick: () => history.back() }, close === 'x' ? svg('close') : close === 'done' ? '完成' : null)),
    h('div', { class: 'body' }, body));
  return el;
}

// 记录
function historySheet() {
  const body = h('div', { class: 'rows' });
  const fill = () => {
    if (!S.readings.length) { rc(body, h('div', { class: 'empty' }, '还没抽过牌')); return; }
    rc(body, ...S.readings.map((r) => {
      const sp = spreadOf(r.spread);
      return h('button', { class: 'row glass', onclick: () => openSheet(sheet({ title: dateText(r.ts), sky: true, close: 'back' },
        readingView(r, { onDelete: async () => { await store.deleteReading(r.id); await reloadReadings(); history.back(); setTimeout(fill, 50); toast('删了'); } }))) },
        h('div', { class: 'fan' }, r.cards.slice(0, 3).map((d) => cardFace(d.id, { reversed: d.reversed, width: 34 }))),
        h('div', { class: 'rc' },
          h('div', { class: 'rt' }, dateText(r.ts), h('span', { class: 'sp' }, sp.name),
            r.by === 'him' || r.asked_by === 'him' ? h('span', { class: 'tag gold', style: 'font-size:9px' }, r.by === 'him' ? '他抽的' : '他出的題') : null,
            r.reply ? h('span', { style: 'color:var(--gold);font-size:9px' }, '●') : null),
          h('div', { class: 'rq' }, r.question || r.cards.map((d) => CARD_BY_ID[d.id]?.name).filter(Boolean).join(' · '))),
        h('span', { class: 'chev', html: ICON.chev }));
    }));
  };
  fill();
  reloadReadings().then(fill);
  const paste = h('button', { class: 'gbtn quiet small', style: 'margin:0 auto 12px;display:flex', onclick: async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { /* 不给读 */ }
    if (!text || !/\[TAROT_(CARD|OFFER)\]/.test(text)) text = prompt(`把${homeLabel()}抽的那张卡（[TAROT_CARD]…[/TAROT_CARD]）贴这里`, '') || '';
    const data = parseMessage(text);
    if (!data || !Array.isArray(data.cards) || !data.cards.length) { if (text) toast('这不是一张塔罗卡'); return; }
    try {
      const r = await store.importCard(data);
      await reloadReadings(); fill();
      toast(r ? `收下了${homeLabel()}抽的牌` : '这张已经在记录里了');
    } catch (e) { toast('收不下：' + (e.message || e)); }
  } }, `貼入${homeLabel()}抽的牌`);
  return sheet({ title: '占卜记录', sky: true, close: 'done' }, h('div', null, paste, body));
}

// 图鉴
function compendiumSheet() {
  const FILTERS = [['all', '全部'], ['major', '大牌'], ['cups', '聖杯'], ['wands', '權杖'], ['swords', '寶劍'], ['pents', '星幣']];
  let filter = 'all';
  const grid = h('div', { class: 'grid3' });
  const bar = h('div', { class: 'filters' });
  const fill = () => {
    rc(bar, ...FILTERS.map(([id, name]) => h('button', { class: 'pillbtn' + (filter === id ? ' on' : ''), onclick: () => { filter = id; fill(); } }, name)));
    const list = filter === 'all' ? CARDS : filter === 'major' ? CARDS.filter((c) => c.arcana === 'major') : CARDS.filter((c) => c.suit === filter);
    rc(grid, ...list.map((c) => h('button', { onclick: () => openSheet(cardDetailSheet(c)) }, cardFace(c.id, { width: 100 }), h('div', { class: 'n' }, c.name))));
  };
  fill();
  return sheet({ title: '牌義圖鑑', sky: true }, h('div', null, bar, grid));
}
function cardDetailSheet(card) {
  const block = (title, cls, rev) => h('div', { class: 'glass mblock' },
    h('span', { class: 'tag ' + cls }, title),
    h('div', { class: 'pills' }, (rev ? card.keywordsRev : card.keywordsUp).map((k) => h('span', { class: 'pill' }, k))),
    h('div', { class: 'mean' }, rev ? card.meaningRev : card.meaningUp));
  return sheet({ title: card.name, sky: true, close: 'back' }, h('div', { class: 'detail' },
    cardFace(card.id, { width: 190, lazy: false }),
    h('div', null, h('div', { class: 'nm' }, card.name), h('div', { class: 'en' }, card.en.toUpperCase())),
    block('正位', 'tint', false), block('逆位', 'gold', true)));
}

// 装修
function decorSheet() {
  const body = h('div', { class: 'decor' });
  const sw = (on, cb, disabled) => h('button', { class: 'switch' + (on ? ' on' : ''), disabled, onclick: () => cb(!on) });
  const swatches = (presets, currentHex, set) => h('div', { class: 'swatches' }, presets.map(([name, hex]) =>
    h('button', { class: hex.toLowerCase() === currentHex.toLowerCase() ? 'on' : '', onclick: () => set(hex) }, h('i', { style: `background:${hex}` }), name)));
  const colorRow = (title, presets, currentHex, set) => h('div', { class: 'sec', style: 'margin-top:14px;gap:8px' },
    h('div', { class: 'colorrow' }, title, h('input', { type: 'color', value: currentHex, oninput: (e) => set(e.target.value) })),
    swatches(presets, currentHex, set));
  const resetBtn = (disabled, cb) => h('button', { class: 'gbtn quiet small', style: 'width:100%;font-family:var(--serif)', disabled, onclick: cb }, '恢复默认');
  const fill = () => {
    const c = decor.current, g = decor.glass;
    const wpInput = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { await decor.setWallpaper(f); toast('换上了'); } catch (err) { toast('这张图读不了'); }
      fill();
    } });
    rc(body, 
      h('h2', null, '占星室裝修', h('span', { class: 'tag gold', style: 'font-family:var(--sans);font-size:10px;font-weight:600' }, decor.dark ? '夜里这套' : '白天这套')),
      h('div', { class: 'sec' }, h('div', { class: 'lab' }, '日夜'),
        h('div', { class: 'cats' }, [['system', '跟系統'], ['dark', '夜'], ['light', '日']].map(([id, name]) =>
          h('button', { class: 'pillbtn' + (decor.appearance === id ? ' on' : ''), style: 'font-size:12px;padding:6px 14px', onclick: () => { decor.setAppearance(id); fill(); } }, name))),
        h('div', { class: 'muted' }, '选了夜或日，手机的深浅色模式怎么切它都不动。')),
      h('div', { class: 'sec' }, h('div', { class: 'lab' }, '壁纸'),
        h('div', { class: 'wprow' },
          h('div', { class: 'wpthumb', style: decor.wallpaperURL ? `background-image:url("${decor.wallpaperURL}")` : '' }, decor.wallpaperURL ? '' : '代码画的天'),
          h('div', { style: 'display:flex;flex-direction:column;gap:10px;flex:1' },
            h('div', { class: 'muted' }, '整间屋全屏铺一张，选牌阵、抽牌、看结果都是它。夜里、白天各存一张。'),
            h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' },
              h('button', { class: 'gbtn small', onclick: () => wpInput.click() }, decor.wallpaperURL ? '换一张' : '去相册选一张'),
              decor.wallpaperURL ? h('button', { class: 'gbtn quiet small', onclick: async () => { await decor.clearWallpaper(); fill(); } }, '用回代码画的天') : null),
            h('div', { class: 'tog' }, '壁纸上面撒星星', sw(decor.stars, (v) => { decor.setStars(v); fill(); }, !decor.wallpaperURL)),
            wpInput))),
      h('div', { class: 'hr' }),
      h('div', { class: 'sec' },
        h('div', { class: 'sample' },
          h('div', { class: 'two' }, cardFace('major_17', { width: 84, lazy: false }), cardBack({ width: 84 })),
          h('div', { style: 'display:flex;flex-direction:column;gap:8px;flex:1' },
            h('div', { class: 'lab' }, '牌面染色'),
            h('div', { class: 'muted' }, '原图是彩色的老扫描件。浓度往左是原图，往右是整张刷成一个颜色。牌背的花纹跟着同一个颜色走。'),
            h('div', { class: 'sl' }, '染色浓度', h('span', { class: 'v' }, Math.round(c.strength * 100) + '%')),
            h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: c.strength, oninput: (e) => { decor.update((t) => { t.strength = +e.target.value; }); body.querySelector('.sl .v').textContent = Math.round(c.strength * 100) + '%'; } }),
            h('div', { class: 'tog' }, '没染到的部分用黑白', sw(c.mono, (v) => { decor.update((t) => { t.mono = v; }); fill(); })))),
        colorRow('染的颜色', TINT_PRESETS, decor.colorHex, (hex) => { decor.update((t) => { t.color = hex; }); fill(); }),
        resetBtn(decor.isDefault, () => { decor.resetTint(); fill(); })),
      h('div', { class: 'hr' }),
      h('div', { class: 'sec' }, h('div', { class: 'lab' }, '雾面玻璃'),
        h('div', { class: 'muted' }, '暗玻璃卡和胶囊的颜色。浓度越高越糊、越不透。默认夜里白、白天黑。'),
        h('div', { class: 'glass glasssample' }, '样子'),
        h('div', { class: 'sl' }, '浓度', h('span', { class: 'v g' }, Math.round(g.strength * 100) + '%')),
        h('input', { type: 'range', min: 0.05, max: 1, step: 0.01, value: g.strength, oninput: (e) => { decor.updateGlass((t) => { t.strength = +e.target.value; }); body.querySelector('.v.g').textContent = Math.round(g.strength * 100) + '%'; } }),
        colorRow('玻璃颜色', GLASS_PRESETS, decor.glassColorHex, (hex) => { decor.updateGlass((t) => { t.color = hex; }); fill(); }),
        resetBtn(decor.glassIsDefault, () => { decor.resetGlass(); fill(); })),
    );
  };
  fill();
  return sheet({ title: '', close: 'done' }, body);
}

// 设置：AI + 数据
function settingsSheet() {
  const cfg = loadAI();
  const f = (label, input, note) => h('div', { class: 'f' }, h('label', null, label), input, note ? h('div', { class: 'note' }, note) : null);
  const fmt = h('select', { value: cfg.format }, h('option', { value: 'openai' }, 'OpenAI 兼容（DeepSeek / 各家中转 / 本地）'), h('option', { value: 'anthropic' }, 'Anthropic Messages'));
  fmt.value = cfg.format;
  const base = h('input', { type: 'url', placeholder: 'https://api.deepseek.com', value: cfg.baseUrl, autocapitalize: 'off', autocomplete: 'off' });
  const key = h('input', { type: 'password', placeholder: 'sk-…', value: cfg.apiKey, autocomplete: 'off' });
  const model = h('input', { type: 'text', placeholder: 'deepseek-chat / claude-opus-5', value: cfg.model, autocapitalize: 'off', autocomplete: 'off' });
  const home = h('input', { type: 'text', placeholder: 'ta 的名字', value: cfg.homeName });
  const name = h('input', { type: 'text', placeholder: '模型 / 塔罗师', value: cfg.readerName });
  const persona = h('textarea', { placeholder: '写给 AI 的人设：ta 是谁、跟你什么关系、怎么说话、叫你什么。解牌的时候会照这个来。', value: cfg.persona });
  const relay = h('input', { type: 'url', placeholder: '留空 = 浏览器直连', value: cfg.relay, autocapitalize: 'off', autocomplete: 'off' });
  const save = () => { saveAI({ format: fmt.value, baseUrl: base.value.trim(), apiKey: key.value.trim(), model: model.value.trim(), readerName: name.value.trim(), homeName: home.value.trim(), persona: persona.value, relay: relay.value.trim() }); };
  for (const el of [fmt, base, key, model, name, home, persona, relay]) el.addEventListener('change', save);
  const testBtn = h('button', { class: 'gbtn quiet small', onclick: async () => {
    save();
    if (!aiReady()) { toast('地址、密钥、模型三样都要填'); return; }
    testBtn.textContent = '试着…';
    try { const { chat } = await import('./ai.js'); const t = await chat('你是测试。', '回一个字：好'); toast('通了：' + t.slice(0, 20)); }
    catch (e) { toast('没通：' + (e.message || e)); }
    testBtn.textContent = '试一下';
  } }, '试一下');
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { const n = await store.importAll(JSON.parse(await file.text())); await reloadReadings(); toast(`导进来 ${n} 条`); }
    catch (err) { toast('导不进去：' + (err.message || err)); }
  } });
  const body = h('div', { class: 'form' },
    h('div', { class: 'f' }, h('label', null, '自家機'),
      h('div', { class: 'note' }, '跟你过日子的那个 AI，跑在你自己电脑上的。结果页「複製給 ta」会把这次的牌（牌名、正逆位、位置、关键词、客观解读）复制成一段话，贴给 ta 就能解。ta 自己也能抽：仓库里 cli/ 有一条命令，给 ta 装上就会用。')),
    f('ta 叫什么', home, '按钮上会写「複製給 XX」。'),
    h('div', { class: 'hr', style: 'height:1px;background:var(--glass-line);margin:8px 0' }),
    h('div', { class: 'f' }, h('label', null, '接別的模型'),
      h('div', { class: 'note' }, '没有自家机、或者想要一个不认识你的塔罗师：填一个模型接口。「AI 細解」和「讓別的模型解牌」走这里，从你的手机直接连过去，密钥只存在这台设备上。')),
    f('接口格式', fmt),
    f('接口地址', base, 'OpenAI 兼容填到域名或 /v1 就行，后面的 /chat/completions 我来补。'),
    f('密钥', key),
    f('模型', model),
    f('叫它什么（可选）', name, '「讓別的模型解牌」的回复会标这个名字。'),
    f('人设（可选）', persona, '想让这个模型也有个身份就写；不写就是客观解。'),
    f('转发地址（可选）', relay, '有的接口不让网页直接连（CORS）。仓库里 proxy/relay.py 几十行，跑在自己机器上，把地址填这儿。'),
    testBtn,
    h('div', { class: 'hr', style: 'height:1px;background:var(--glass-line);margin:8px 0' }),
    h('div', { class: 'f' }, h('label', null, '数据'),
      h('div', { class: 'note' }, '记录只存在这个浏览器里。换手机、换浏览器之前先导出，到了那边再导入。清了浏览器数据记录就没了。'),
      h('div', { style: 'display:flex;gap:10px;margin-top:6px' },
        h('button', { class: 'gbtn quiet small', onclick: async () => {
          const data = await store.exportAll();
          const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
          await saveImage(blob, `chambre-${dateText(store.nowISO())}.json`).catch(() => toast('导不出来'));
        } }, '导出记录'),
        h('button', { class: 'gbtn quiet small', onclick: () => fileIn.click() }, '导入记录'), fileIn)),
    h('div', { class: 'muted', style: 'margin-top:10px' }, 'Chambre des Étoiles · 占星室 网页版 · 韦特牌公版扫描'),
  );
  return sheet({ title: '设置', close: 'done' }, body);
}

// —— 开工 ——
async function main() {
  startStars();
  await decor.loadWallpapers();
  decor.apply();
  await reloadReadings();
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
main();
