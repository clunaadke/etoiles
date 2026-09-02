// 牌面 / 牌背的 DOM 零件。颜色全走 decor.js 挂的 CSS 变量，拧一下当场重画。
//   cardFace(id, {reversed, width}) -> element
//   cardBack({width}) -> element
// 牌面 = 公版扫描 → saturate(--card-sat) → 乘一层 --card-mult（multiply）。逆位转 180。
// 牌背 = 压暗的渐变底 + 黑底白线的星盘按亮度当 mask、填 --back-line、叠两层 screen。

export const CARD_RATIO = 1.72;
let assetBase = '';
export function setAssetBase(p) { assetBase = p; }
export function cardImageURL(id) { return `${assetBase}assets/cards/${id}.webp`; }
export function backImageURL() { return `${assetBase}assets/back.webp`; }

export function cardFace(id, { reversed = false, width = 120, lazy = true } = {}) {
  const el = document.createElement('div');
  el.className = 'tarot-face' + (reversed ? ' reversed' : '');
  el.style.width = width + 'px';
  el.style.height = Math.round(width * CARD_RATIO) + 'px';
  el.style.setProperty('--w', width + 'px');
  const img = document.createElement('img');
  img.src = cardImageURL(id);
  img.alt = '';
  img.draggable = false;
  if (lazy) img.loading = 'lazy';
  img.decoding = 'async';
  const mult = document.createElement('div');
  mult.className = 'mult';
  el.append(img, mult);
  return el;
}

export function cardBack({ width = 120 } = {}) {
  const el = document.createElement('div');
  el.className = 'tarot-back';
  el.style.width = width + 'px';
  el.style.height = Math.round(width * CARD_RATIO) + 'px';
  el.style.setProperty('--w', width + 'px');
  const p1 = document.createElement('div'); p1.className = 'pat';
  const p2 = document.createElement('div'); p2.className = 'pat two';
  const inner = document.createElement('div'); inner.className = 'inner';
  el.append(p1, p2, inner);
  return el;
}

/// 空牌位（抽牌页 / 聊天卡）：淡牌背影子 + 虚线框；轮到的那格亮一点、呼吸
export function emptySlot({ width = 92, active = false } = {}) {
  const el = document.createElement('div');
  el.className = 'tarot-slot' + (active ? ' active' : '');
  el.style.width = width + 'px';
  el.style.height = Math.round(width * CARD_RATIO) + 'px';
  el.style.setProperty('--w', width + 'px');
  el.append(cardBack({ width }));
  const dash = document.createElement('div'); dash.className = 'dash';
  el.append(dash);
  return el;
}

/// 预热：把 78 张图全拉一遍（进图鉴 / 第一次抽牌前），失败不管
export function preloadAll(ids) {
  for (const id of ids) { const i = new Image(); i.src = cardImageURL(id); }
}
