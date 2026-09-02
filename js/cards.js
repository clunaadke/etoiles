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

// 备用图源：GitHub Pages 在有些地方（尤其国内）时好时坏，一张图拉不下来就换 jsDelivr 的镜像再试。
// fork 了仓库的人把这里改成自己的 用户名/仓库名，或者在页面里设 window.CHAMBRE_CDN。
export const CDN_BASE = (typeof window !== 'undefined' && window.CHAMBRE_CDN) || 'https://cdn.jsdelivr.net/gh/clunaadke/etoiles@main/';
export function cardImageSources(id) {
  const rel = `assets/cards/${id}.webp`;
  const list = [assetBase + rel, assetBase + rel + '?r=1', CDN_BASE + rel];
  return [...new Set(list)];
}
/// 给 <img> 装上「失败就换下一个源」的手
function armFallback(img, sources) {
  let i = 0;
  img.onerror = () => {
    i++;
    if (i >= sources.length) { img.onerror = null; img.classList.add('broken'); return; }
    setTimeout(() => { img.src = sources[i]; }, i === 1 ? 800 : 0);
  };
}

/// 牌背位图：decor.js 把当前颜色的牌背画成一张图塞进来（--back-img），牌背就不用每张都叠两层 mask + 混合，
/// iPhone 上牌带滑起来才不卡。没给的时候（比如聊天卡零件单独用）还是走 CSS 那套。
let backBitmap = null;
export function setBackBitmap(url) { backBitmap = url; }

export function cardFace(id, { reversed = false, width = 120, lazy = true } = {}) {
  const el = document.createElement('div');
  el.className = 'tarot-face' + (reversed ? ' reversed' : '');
  el.style.width = width + 'px';
  el.style.height = Math.round(width * CARD_RATIO) + 'px';
  el.style.setProperty('--w', width + 'px');
  const img = document.createElement('img');
  const sources = cardImageSources(id);
  armFallback(img, sources);
  img.src = sources[0];
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
  if (backBitmap) {
    el.classList.add('bmp');     // 图在 CSS 变量 --back-img 里，所有牌背共用一张
    return el;
  }
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
  for (const id of ids) { const i = new Image(); const srcs = cardImageSources(id); armFallback(i, srcs); i.src = srcs[0]; }
}

/// 加载一张牌面（给 canvas 用），同样会换源重试
export function loadCardImage(id) {
  const sources = cardImageSources(id);
  return new Promise((res, rej) => {
    let i = 0;
    const tryNext = () => {
      if (i >= sources.length) return rej(new Error('图片没加载出来'));
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = () => { i++; setTimeout(tryNext, i === 1 ? 800 : 0); };
      img.src = sources[i];
    };
    tryNext();
  });
}
