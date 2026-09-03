// 聊天卡零件：<tarot-card>。一段卡片数据 → 画出带边框的塔罗卡，塞进任何聊天页。
// 两种：
//   · 亮牌面的（[TAROT_CARD]{…}）：抽好了，展示牌 + 关键词 + 客观解读（默认只露一句话，点「逐牌」展开）
//   · 能抽的（[TAROT_OFFER]{…}）：对方出了题，在卡里滑牌带一张张抽；抽满自动变成亮牌面的
// 用法：
//   <script type="module" src="js/tarot-card.js"></script>
//   <tarot-card data='{"id":…}' asset-base="./"></tarot-card>          直接给 JSON
//   <tarot-card message="[TAROT_CARD]{…}[/TAROT_CARD]"></tarot-card>  给整条消息也行
//   el.data = {...}  /  el.message = '...'                              JS 里设也行
// 事件（能抽的那种）：
//   'tarot-draw'  每抽一张 detail = {id, card:{id, name, reversed, position, position_name, keywords}, cards, done}
//   'tarot-done'  抽满     detail = 整份 [TAROT_CARD] 数据（含 interp 和给 AI 读的 text）
// 数据格式跟 Alcove 一样（README 里有）。牌义 / 解读表都在自己包里，不用后端。

import { CARDS, CARD_BY_ID } from './data/deck.js';
import { build, spreadOf } from './reading.js';
import { cardFace, cardBack, setAssetBase } from './cards.js';
import { DeckBand } from './band.js';
import { loadLibrary, libraryLoaded } from './library.js';

const STYLE = `
:host { display: block; --ink: #33294d; --dim: rgba(51,41,77,.62); --accent: #704ca8; --sub: rgba(255,255,255,.32);
  --card-sat: 0; --card-mult: #b899ff; --gold: #704ca8; --back-line: #c6b0ff; --back-deep-a: #37294d; --back-deep-b: #120e1a;
  --back-edge: rgba(184,153,255,.75); --back-edge2: rgba(184,153,255,.35); --card-glow: rgba(112,76,168,.45);
  font-family: -apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', system-ui, sans-serif; color: var(--ink); -webkit-user-select: none; user-select: none; }
.frame { position: relative; width: 372px; max-width: 100%; padding: 52px 44px 56px; box-sizing: border-box; }
.frame::before { content: ''; position: absolute; inset: 0; pointer-events: none; border: 82px 110px solid transparent;
  border-image: url('__FRAME__') 246 330 fill / 82px 110px stretch; }
.frame > * { position: relative; }
.body { display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; align-items: center; gap: 8px; font-family: 'Songti SC', 'Noto Serif CJK SC', Georgia, serif; font-size: 15px; font-weight: 600; }
.head .sp { font-family: inherit; font-size: 11px; font-weight: 400; color: var(--dim); }
.head .t { margin-left: auto; font-family: ui-monospace, Menlo, monospace; font-size: 8.5px; color: var(--dim); font-weight: 400; }
.head svg { width: 15px; height: 15px; color: var(--accent); }
.q { font-family: 'Songti SC', 'Noto Serif CJK SC', Georgia, serif; font-size: 14px; font-weight: 500; line-height: 1.5; text-align: center; }
.single { display: flex; align-items: center; gap: 14px; padding: 2px 0; }
.single .nm { display: flex; align-items: center; gap: 6px; font-family: 'Songti SC', 'Noto Serif CJK SC', Georgia, serif; font-size: 13.5px; font-weight: 500; }
.single .nm .rv { font-family: inherit; font-size: 9px; color: var(--dim); font-weight: 400; }
.single .kws { display: flex; flex-direction: column; gap: 5px; margin-top: 6px; }
.single .kws div { display: flex; gap: 5px; }
.row { display: flex; justify-content: center; align-items: flex-start; gap: 12px; }
.row.tight { gap: 6px; }
.rel { position: relative; }
.rel .cell { position: absolute; transform: translate(-50%, -50%); }
.cell { display: flex; flex-direction: column; align-items: center; gap: 3px; cursor: pointer; }
.cell .tarot-face { transition: transform .3s cubic-bezier(.2,.8,.3,1.2), box-shadow .3s; }
.cell.on .tarot-face { transform: translateY(-4px); box-shadow: 0 0 8px rgba(112,76,168,.35); }
.cell.on .tarot-face.reversed { transform: rotate(180deg) translateY(4px); }
.cell.on .tarot-face::after { box-shadow: inset 0 0 0 1.5px var(--accent); }
.cell .pn { display: flex; gap: 3px; align-items: baseline; white-space: nowrap; max-width: 100%; }
.cell .pn .p { font-size: 8.5px; font-weight: 600; color: var(--dim); }
.cell.on .pn .p { color: var(--accent); }
.cell .pn .n { font-family: 'Songti SC', 'Noto Serif CJK SC', Georgia, serif; font-size: 10px; font-weight: 500; }
.kwrow { display: flex; gap: 6px; align-items: center; overflow-x: auto; padding: 0 2px; scrollbar-width: none; }
.kwrow::-webkit-scrollbar { display: none; }
.kwrow .n { font-family: 'Songti SC', 'Noto Serif CJK SC', Georgia, serif; font-size: 10.5px; font-weight: 500; color: var(--accent); white-space: nowrap; }
.pill { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 500; background: var(--sub); border: .8px solid rgba(112,76,168,.35); white-space: nowrap; }
.interp { padding: 10px; border-radius: 12px; background: var(--sub); display: flex; flex-direction: column; gap: 8px; }
.interp .ih { display: flex; align-items: center; font-size: 9.5px; font-weight: 600; letter-spacing: .5px; color: var(--accent); }
.interp .ih button { margin-left: auto; font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; }
.interp .p { font-family: 'Songti SC', 'Noto Serif CJK SC', Georgia, serif; font-size: 11.5px; line-height: 1.6; }
.interp .c .h { font-family: 'Songti SC', 'Noto Serif CJK SC', Georgia, serif; font-size: 11px; font-weight: 600; margin-bottom: 3px; }
.interp .c .p { font-size: 11px; }
.interp .dimp { color: var(--dim); }
.interp .one { font-family: 'Songti SC', 'Noto Serif CJK SC', Georgia, serif; font-size: 11px; font-weight: 500; color: var(--accent); line-height: 1.5; }
.draw { display: flex; flex-direction: column; gap: 10px; }
.slots { display: flex; justify-content: center; gap: 14px; }
.slots.tight { gap: 8px; }
.slots > div { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.slots .pn { font-size: 9px; font-weight: 500; color: var(--dim); }
.slots .pn.on { color: var(--accent); }
.slots .tarot-face { animation: popin .4s cubic-bezier(.2,.8,.3,1.15); }
@keyframes popin { from { transform: scale(.3); opacity: 0; } }
.hint { text-align: center; }
.hint .t { font-family: 'Songti SC', 'Noto Serif CJK SC', Georgia, serif; font-size: 12px; font-weight: 500; }
.hint .s { font-size: 10px; color: var(--dim); margin-top: 4px; }
.band { height: 116px; transition: opacity .28s, transform .28s; transform-origin: bottom; }
.band.hide { opacity: 0; transform: scale(.92); pointer-events: none; }
.big { height: 130px; display: flex; align-items: center; justify-content: center; }
.flip { perspective: 700px; transform: scale(.4); }
.flip .inner { position: relative; transform-style: preserve-3d; transition: transform .55s ease-in-out; }
.flip .inner > * { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.flip .inner > .front { position: absolute; inset: 0; transform: rotateY(180deg); }
.flip .inner > .front.reversed { transform: rotateY(180deg) rotate(180deg); }
.flip.on .inner { transform: rotateY(180deg); }
.err { font-size: 10px; color: #b3383f; text-align: center; }

/* 牌面 / 牌背 / 牌带 / 空位（跟屋里同一套，颜色走变量）*/
.tarot-face { position: relative; overflow: hidden; border-radius: calc(var(--w) * .07); isolation: isolate; box-shadow: 0 calc(var(--w) * .05) calc(var(--w) * .08) rgba(0,0,0,.35); flex: none; }
.tarot-face img { display: block; width: 100%; height: 100%; object-fit: cover; filter: saturate(var(--card-sat)); }
.tarot-face .mult { position: absolute; inset: 0; background: var(--card-mult); mix-blend-mode: multiply; }
.tarot-face::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px rgba(112,76,168,.45); pointer-events: none; }
.tarot-face.reversed { transform: rotate(180deg); }
.tarot-back { position: relative; overflow: hidden; border-radius: calc(var(--w) * .07); flex: none; isolation: isolate; background: linear-gradient(var(--back-deep-a), var(--back-deep-b)); box-shadow: 0 calc(var(--w) * .04) calc(var(--w) * .06) rgba(0,0,0,.45); }
.tarot-back .pat { position: absolute; left: 3%; top: 3%; width: 94%; height: 94%; background: var(--back-line); -webkit-mask: url('__BACK__') center / contain no-repeat; mask: url('__BACK__') center / contain no-repeat; -webkit-mask-mode: luminance; mask-mode: luminance; mix-blend-mode: screen; }
.tarot-back .pat.two { opacity: .7; }
.tarot-back::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px var(--back-edge); pointer-events: none; }
.tarot-back .inner { position: absolute; inset: 6%; border-radius: calc(var(--w) * .05); box-shadow: inset 0 0 0 .8px var(--back-edge2); pointer-events: none; }
.tarot-slot { position: relative; flex: none; }
.tarot-slot .tarot-back { opacity: .16; box-shadow: none; }
.tarot-slot.active .tarot-back { opacity: .4; }
.tarot-slot .dash { position: absolute; inset: 0; border-radius: calc(var(--w) * .07); border: 1px dashed rgba(112,76,168,.3); }
.tarot-slot.active .dash { border-color: rgba(112,76,168,.8); }
.deck-band { position: relative; overflow: hidden; -webkit-mask: linear-gradient(90deg, transparent 0, #000 22%, #000 78%, transparent 100%); mask: linear-gradient(90deg, transparent 0, #000 22%, #000 78%, transparent 100%); }
.deck-band .band-glow { position: absolute; inset: 0; pointer-events: none; filter: blur(6px); }
.deck-band .band-layer { position: absolute; inset: 0; }
.deck-band .band-card { position: absolute; left: 0; top: 0; transform-origin: center; will-change: transform; }
`;

const SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/><path d="M5 3l.5 1.5L7 5l-1.5.5L5 7l-.5-1.5L3 5l1.5-.5z"/></svg>';

function h(tag, cls, ...kids) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
function timeText(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts || '').replace('T', ' ').slice(0, 16);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function parseMessage(text) {
  const m = /\[(TAROT_CARD|TAROT_OFFER)\]([\s\S]*?)\[\/\1\]/.exec(text || '');
  if (!m) return null;
  try { const data = JSON.parse(m[2]); data.__kind = m[1] === 'TAROT_OFFER' ? 'offer' : 'card'; return data; } catch { return null; }
}
function cardInfo(c, sp) {
  const card = CARD_BY_ID[c.id] || {};
  const rev = !!c.reversed;
  return { id: c.id, name: card.name || c.id, reversed: rev, position: c.position || '',
    position_name: sp.positions.find((p) => p.key === c.position)?.name || '', keywords: card[rev ? 'keywordsRev' : 'keywordsUp'] || [] };
}

export class TarotCardElement extends HTMLElement {
  static get observedAttributes() { return ['data', 'message', 'asset-base']; }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null; this._band = null; this._sel = 0;
    this._drawn = []; this._chosen = null; this._busy = false; this._deck = [];
  }
  connectedCallback() {
    this.render();
    if (!libraryLoaded()) loadLibrary(this.assetBase).then(() => this.isConnected && this.render());
  }
  disconnectedCallback() { if (this._band) { this._band.destroy(); this._band = null; } }
  attributeChangedCallback(name, _o, v) {
    if (name === 'data') { try { this._data = JSON.parse(v); } catch { this._data = null; } }
    if (name === 'message') this._data = parseMessage(v);
    if (name === 'asset-base') setAssetBase(v || '');
    if (this.isConnected) this.render();
  }
  get data() { return this._data; }
  set data(v) { this._data = v; this._drawn = []; this.render(); }
  set message(v) { this._data = parseMessage(v); this._drawn = []; this.render(); }
  get assetBase() { return this.getAttribute('asset-base') || ''; }

  // —— 画 ——
  render() {
    const root = this.shadowRoot;
    const base = this.assetBase;
    setAssetBase(base);
    if (this._band) { this._band.destroy(); this._band = null; }
    const style = h('style'); style.textContent = STYLE.replaceAll('__FRAME__', base + 'assets/frame.webp').replaceAll('__BACK__', base + 'assets/back.webp');
    const d = this._data;
    if (!d) { root.replaceChildren(style, h('div', 'frame', h('div', 'err', '没有卡片数据'))); return; }
    const isOffer = d.__kind === 'offer' || (Array.isArray(d.positions) && !('by' in d));
    const sp = spreadOf(d.spread);
    const cards = (this._drawn.length ? this._drawn : d.cards || []).map((c) => cardInfo(c, sp));
    const done = !isOffer || d.done || cards.length >= (d.positions || sp.positions).length;
    const body = h('div', 'body');
    const head = h('div', 'head');
    head.innerHTML = SPARK;
    if (isOffer) head.append(h('span', null, done ? '出的题，抽好了' : '出了题，你来抽'), h('span', 'sp', `· ${d.spread_name || sp.name}`));
    else head.append(h('span', null, d.by === 'him' ? '对方抽了牌' : '抽了牌'), h('span', 'sp', `· ${d.spread_name || sp.name}`), h('span', 't', timeText(d.ts)));
    body.append(head);
    if (d.question) body.append(h('div', 'q', `「${d.question}」`));
    if (done) {
      body.append(this.spreadView(cards, sp.id));
      const interp = d.interp || build({ spread: sp.id, question: d.question, cards }, null);
      if (interp) body.append(this.interpBlock(interp));
    } else {
      body.append(this.drawArea(d, sp, cards));
    }
    root.replaceChildren(style, h('div', 'frame', body));
  }

  spreadView(cards, spreadID) {
    const n = cards.length;
    if (n <= 1 && cards[0]) {
      const c = cards[0];
      const rows = []; for (let i = 0; i < c.keywords.length; i += 2) rows.push(h('div', null, c.keywords.slice(i, i + 2).map((k) => h('span', 'pill', k))));
      return h('div', 'single', cardFace(c.id, { reversed: c.reversed, width: 84, lazy: false }),
        h('div', null, h('div', 'nm', c.name, h('span', 'rv', c.reversed ? '逆位' : '正位')), h('div', 'kws', rows)));
    }
    const faceW = n <= 3 ? 56 : 44;
    const cellH = faceW * 1.72 + 18;
    const wrap = h('div', null);
    const kw = h('div', 'kwrow');
    const cells = cards.map((c, i) => {
      const cell = h('div', 'cell' + (i === this._sel ? ' on' : ''), cardFace(c.id, { reversed: c.reversed, width: faceW, lazy: false }),
        h('div', 'pn', h('span', 'p', c.position_name), h('span', 'n', c.name)));
      cell.style.width = faceW + 24 + 'px';
      cell.addEventListener('click', () => { this._sel = i; cells.forEach((x, j) => x.classList.toggle('on', j === i)); drawKw(); });
      return cell;
    });
    const drawKw = () => {
      const c = cards[this._sel] || cards[0];
      kw.replaceChildren(h('span', 'n', c.name + (c.reversed ? ' · 逆位' : ' · 正位')), ...c.keywords.map((k) => h('span', 'pill', k)));
    };
    if (spreadID === 'relation' && n === 5) {
      const rel = h('div', 'rel', cells);
      rel.style.height = cellH * 2 + 2 + 'px';
      const pos = [[22, 0], [78, 0], [50, 50], [22, 100], [78, 100]];
      cells.forEach((cell, i) => { cell.style.left = pos[i][0] + '%'; cell.style.top = `calc(${pos[i][1]}% + ${(50 - pos[i][1]) / 50 * cellH / 2}px)`; });
      // 上排中心在 cellH/2，下排在 h - cellH/2，中间在 h/2
      cells[0].style.top = cells[1].style.top = cellH / 2 + 'px';
      cells[2].style.top = '50%';
      cells[3].style.top = cells[4].style.top = `calc(100% - ${cellH / 2}px)`;
      wrap.append(rel);
    } else {
      wrap.append(h('div', 'row' + (n > 3 ? ' tight' : ''), cells));
    }
    drawKw();
    wrap.append(kw);
    wrap.style.display = 'flex'; wrap.style.flexDirection = 'column'; wrap.style.gap = '8px';
    return wrap;
  }

  interpBlock(ip) {
    let expanded = false;
    const box = h('div', 'interp');
    const draw = () => {
      const kids = [h('div', 'ih', `客观解读 · 按${ip.category_name}`, (() => { const b = h('button', null, expanded ? '收起' : '逐牌'); b.addEventListener('click', () => { expanded = !expanded; draw(); }); return b; })())];
      if (expanded) {
        kids.push(h('div', 'p', ip.overall));
        for (const c of ip.cards) kids.push(h('div', 'c', h('div', 'h', (c.position_name && ip.cards.length > 1 ? c.position_name + ' · ' : '') + c.name + (c.reversed ? ' 逆位' : ' 正位')), h('div', 'p', c.text)));
        if (ip.relations?.length) kids.push(h('div', 'p dimp', '牌面关系：' + ip.relations.join(' ')));
        if (ip.advice?.length) kids.push(h('div', 'p', '建议：' + ip.advice.join(' ')));
      }
      kids.push(h('div', 'one', ip.oneline));
      box.replaceChildren(...kids);
    };
    draw();
    return box;
  }

  // —— 能抽的 ——
  drawArea(d, sp, cards) {
    const positions = d.positions || sp.positions;
    const next = positions[cards.length];
    const slotW = positions.length <= 1 ? 56 : positions.length <= 3 ? 44 : 34;
    const slots = h('div', 'slots' + (positions.length > 3 ? ' tight' : ''), positions.map((pos) => {
      const c = cards.find((x) => x.position === pos.key);
      const cell = h('div', null);
      if (c) cell.append(cardFace(c.id, { reversed: c.reversed, width: slotW, lazy: false }));
      else {
        const slot = h('div', 'tarot-slot' + (pos.key === next?.key ? ' active' : ''), cardBack({ width: slotW }), h('div', 'dash'));
        slot.style.width = slotW + 'px'; slot.style.height = Math.round(slotW * 1.72) + 'px'; slot.style.setProperty('--w', slotW + 'px');
        cell.append(slot);
      }
      if (positions.length > 1) cell.append(h('div', 'pn' + (pos.key === next?.key ? ' on' : ''), pos.name));
      return cell;
    }));
    const area = h('div', 'draw', slots);
    if (this._chosen) {
      area.append(this.bigCard(this._chosen));
    } else {
      const hint = h('div', 'hint', h('div', 't', positions.length > 1 ? `为「${next.name}」抽一张` : '抽一张'), h('div', 's', this._busy ? '记着…' : '左右滑整副牌，中间那张再点一下'));
      const bandHost = h('div', 'band');
      area.append(hint, bandHost);
      if (!this._deck.length) {
        const taken = new Set(cards.map((c) => c.id));
        this._deck = CARDS.map((c) => c.id).filter((id) => !taken.has(id));
        for (let i = this._deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this._deck[i], this._deck[j]] = [this._deck[j], this._deck[i]]; }
      }
      requestAnimationFrame(() => {
        if (this._band) this._band.destroy();
        this._band = new DeckBand(bandHost, { deck: this._deck, cardW: 40, gap: 22, arc: 900, lift: 16, pop: 0.25, onChoose: (i) => this.choose(i, d, sp, cards) });
      });
    }
    if (this._error) area.append(h('div', 'err', this._error));
    return area;
  }

  bigCard(c) {
    const w = 68;
    const front = cardFace(c.id, { width: w, lazy: false }); front.classList.add('front'); if (c.reversed) front.classList.add('reversed');
    const inner = h('div', 'inner', cardBack({ width: w }), front);
    inner.style.width = w + 'px'; inner.style.height = Math.round(w * 1.72) + 'px';
    const flip = h('div', 'flip', inner);
    requestAnimationFrame(() => { flip.style.transition = 'transform .42s cubic-bezier(.2,.9,.3,1.15)'; flip.style.transform = 'scale(1)'; });
    setTimeout(() => flip.classList.add('on'), 420);
    return h('div', 'big', flip);
  }

  choose(index, d, sp, cards) {
    if (this._chosen || this._busy) return;
    const positions = d.positions || sp.positions;
    const pos = positions[cards.length];
    if (!pos || index >= this._deck.length) return;
    const id = this._deck.splice(index, 1)[0];
    const pick = { id, reversed: Math.random() < 0.5, position: pos.key };
    this._chosen = pick;
    this.render();
    setTimeout(() => {
      this._chosen = null;
      const all = [...cards.map((c) => ({ id: c.id, reversed: c.reversed, position: c.position })), pick];
      this._drawn = all;
      const done = all.length >= positions.length;
      const info = cardInfo(pick, sp);
      this.dispatchEvent(new CustomEvent('tarot-draw', { bubbles: true, composed: true, detail: { id: d.id, card: info, cards: all.map((c) => cardInfo(c, sp)), done } }));
      if (done) {
        const reading = { id: d.id, ts: d.ts, spread: sp.id, question: d.question || '', cards: all };
        const interp = build(reading, null);
        d.done = true; d.cards = all; d.interp = interp;
        this.dispatchEvent(new CustomEvent('tarot-done', { bubbles: true, composed: true, detail: {
          id: d.id, ts: d.ts, spread: sp.id, spread_name: sp.name, question: d.question || '',
          cards: all.map((c) => cardInfo(c, sp)), by: 'her', interp,
        } }));
      }
      this.render();
    }, 1900);
  }
}

if (!customElements.get('tarot-card')) customElements.define('tarot-card', TarotCardElement);
export { parseMessage };
