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

// 备用图源：GitHub Pages 在有些地方（尤其国内）时好时坏，一张图拉不下来就换镜像再试，几轮都不行就歇几秒再来一轮。
// fork 了仓库的人把 GH_REPO 改成自己的 用户名/仓库名，或者在页面里设 window.CHAMBRE_MIRRORS = ['https://…/']。
export const GH_REPO = 'clunaadke/etoiles';
export const MIRRORS = (typeof window !== 'undefined' && window.CHAMBRE_MIRRORS) || [
  `https://cdn.jsdelivr.net/gh/${GH_REPO}@main/`,
  `https://fastly.jsdelivr.net/gh/${GH_REPO}@main/`,
  `https://gcore.jsdelivr.net/gh/${GH_REPO}@main/`,
  `https://raw.githubusercontent.com/${GH_REPO}/main/`,
];
export function cardImageSources(id) {
  const rel = `assets/cards/${id}.webp`;
  return [...new Set([assetBase + rel, ...MIRRORS.map((m) => m + rel), assetBase + rel + '?r=2'])];
}
const ROUNDS = 4;
/// 给 <img> 装上「失败就换下一个源，全失败歇一会儿再来一轮」的手
function armFallback(img, sources) {
  let i = 0, round = 0;
  img.onerror = () => {
    i++;
    if (i >= sources.length) {
      round++;
      if (round >= ROUNDS) { img.onerror = null; img.classList.add('broken'); return; }
      i = 0;
      setTimeout(() => { img.src = sources[0] + (sources[0].includes('?') ? '&' : '?') + 'r=' + round; }, 2500 * round);
      return;
    }
    setTimeout(() => { img.src = sources[i]; }, 300);
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
export function preloadAll(ids, { concurrency = 4 } = {}) {
  const queue = ids.slice();
  const next = () => {
    const id = queue.shift();
    if (!id) return;
    const i = new Image(); const srcs = cardImageSources(id); armFallback(i, srcs);
    const done = () => setTimeout(next, 60);
    i.onload = done;
    const orig = i.onerror; i.onerror = (e) => { orig?.(e); if (i.classList.contains('broken')) done(); };
    i.src = srcs[0];
  };
  for (let k = 0; k < concurrency; k++) next();
}

/// 加载一张牌面（给 canvas 用），同样会换源重试
export function loadCardImage(id) {
  const sources = cardImageSources(id);
  return new Promise((res, rej) => {
    let i = 0, round = 0;
    const tryNext = () => {
      if (i >= sources.length) {
        round++; i = 0;
        if (round >= ROUNDS) return rej(new Error('图片没加载出来，网络不给力'));
        return setTimeout(tryNext, 2500 * round);
      }
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = () => { i++; setTimeout(tryNext, 300); };
      img.src = sources[i];
    };
    tryNext();
  });
}
