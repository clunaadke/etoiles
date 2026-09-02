// 屋子的颜色和装修：日夜、牌面染色、雾面玻璃、壁纸、星星。
// 移植自 Alcove TarotRoomView.swift 的 TarotInk / TarotDecor（2026-09-03）。
// 设置存 localStorage（chambre.*），壁纸存 IndexedDB（store.js）。
// 所有颜色算完写成 CSS 变量挂在 <html> 上，页面只认变量。

import { fileGet, filePut, fileDelete } from './store.js';
import { setBackBitmap, backImageURL } from './cards.js';

const LS = (k) => 'chambre.' + k;

function loadJSON(k, fallback) {
  // 每次都给一份新的拷贝：夜 / 日两套要是共用同一个对象，改夜的会把日的一起改了（0903 她抓的）
  try { const v = localStorage.getItem(LS(k)); return v == null ? { ...fallback } : { ...fallback, ...JSON.parse(v) }; }
  catch { return { ...fallback }; }
}
function saveJSON(k, v) { try { localStorage.setItem(LS(k), JSON.stringify(v)); } catch { /* 私密模式等 */ } }

const TINT_DEFAULT = { strength: 1, mono: true, color: null };
const GLASS_DEFAULT = { strength: 0.2, color: null };
const GLASS_DEFAULT_STRENGTH = 0.2;

// 夜 / 日两套固定色（TarotInk）
const NIGHT = {
  ink: [0.93, 0.90, 1.0], gold: [0.72, 0.62, 1.0], tint: [0.72, 0.60, 1.0],
  skyTop: [0.03, 0.02, 0.06], skyMid: [0.10, 0.05, 0.20], skyBottom: [0.06, 0.03, 0.11],
  nebulaA: [0.42, 0.18, 0.78, 0.46], nebulaB: [0.58, 0.16, 0.62, 0.34],
  star: [1, 1, 1], buttonGlow: [0.45, 0.25, 0.80, 0.42], toast: [0, 0, 0, 0.62],
  cardGlow: [1, 1, 1, 0.5], glassBase: [1, 1, 1],
  glass: 0.055, glassLine: 0.14, pill: 0.09,
};
const DAY = {
  ink: [0.17, 0.12, 0.27], gold: [0.47, 0.34, 0.78], tint: [0.60, 0.48, 0.90],
  skyTop: [0.95, 0.93, 0.98], skyMid: [0.90, 0.87, 0.96], skyBottom: [0.96, 0.94, 0.97],
  nebulaA: [0.62, 0.50, 0.90, 0.32], nebulaB: [0.90, 0.62, 0.80, 0.24],
  star: [0.40, 0.30, 0.65], buttonGlow: [0.55, 0.42, 0.85, 0.28], toast: [1, 1, 1, 0.82],
  cardGlow: [0.22, 0.12, 0.42, 0.45], glassBase: [0, 0, 0],
  glass: 0.045, glassLine: 0.10, pill: 0.06,
};

export const TINT_PRESETS = [
  ['薰衣草', '#b899ff'], ['玫瑰', '#ffa3cc'], ['金', '#f5cc80'], ['青', '#8fdbeb'],
  ['鼠尾草', '#add6b3'], ['胭脂', '#e06675'], ['霜', '#e0e6f7'],
];
export const GLASS_PRESETS = [
  ['白', '#ffffff'], ['黑', '#000000'], ['薰衣草', '#b899ff'], ['玫瑰', '#ffa3cc'],
  ['金', '#f5cc80'], ['青', '#8fdbeb'], ['墨', '#291a4d'],
];

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function rgbToHex([r, g, b]) {
  const h = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
const css = (c, a) => {
  const [r, g, b] = c;
  const alpha = a != null ? a : (c.length > 3 ? c[3] : 1);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${alpha})`;
};

// 默认壁纸（她给的图，压过）：夜一张、日一张，各管各的。用户自己选了就盖过默认。没有文件就用代码画的天。
export const DEFAULT_WALLPAPER = { night: null, day: null };

class Decor extends EventTarget {
  constructor() {
    super();
    this.appearance = localStorage.getItem(LS('appearance')) || 'system';   // system / dark / light
    this.tint = { night: loadJSON('tint.night', TINT_DEFAULT), day: loadJSON('tint.day', TINT_DEFAULT) };
    this.glassCfg = { night: loadJSON('glass.night', GLASS_DEFAULT), day: loadJSON('glass.day', GLASS_DEFAULT) };
    this.stars = localStorage.getItem(LS('stars')) !== '0';
    this.wallpaper = { night: null, day: null };   // object URL
    this._mql = window.matchMedia('(prefers-color-scheme: dark)');
    this._mql.addEventListener('change', () => this.appearance === 'system' && this.apply());
  }

  get dark() {
    if (this.appearance === 'dark') return true;
    if (this.appearance === 'light') return false;
    return this._mql.matches;
  }
  get mode() { return this.dark ? 'night' : 'day'; }
  get palette() { return this.dark ? NIGHT : DAY; }

  // —— 牌面染色 ——
  get current() { return this.tint[this.mode]; }
  get isDefault() { const c = this.current; return c.strength === 1 && c.mono === true && !c.color; }
  /// 刷的那层颜色（牌背线也是它）
  get color() { return hexToRgb(this.current.color) || this.palette.tint; }
  get colorHex() { return rgbToHex(this.color); }
  update(f) { f(this.tint[this.mode]); saveJSON('tint.' + this.mode, this.tint[this.mode]); this.apply(); }
  resetTint() { this.tint[this.mode] = { ...TINT_DEFAULT }; saveJSON('tint.' + this.mode, this.tint[this.mode]); this.apply(); }

  // —— 雾面玻璃 ——
  get glass() { return this.glassCfg[this.mode]; }
  get glassIsDefault() { const g = this.glass; return g.strength === GLASS_DEFAULT_STRENGTH && !g.color; }
  get glassColor() { return hexToRgb(this.glass.color) || this.palette.glassBase; }
  get glassColorHex() { return rgbToHex(this.glassColor); }
  updateGlass(f) { f(this.glassCfg[this.mode]); saveJSON('glass.' + this.mode, this.glassCfg[this.mode]); this.apply(); }
  resetGlass() { this.glassCfg[this.mode] = { ...GLASS_DEFAULT }; saveJSON('glass.' + this.mode, this.glassCfg[this.mode]); this.apply(); }

  setAppearance(v) { this.appearance = v; localStorage.setItem(LS('appearance'), v); this.apply(); }
  setStars(v) { this.stars = !!v; localStorage.setItem(LS('stars'), v ? '1' : '0'); this.apply(); }

  // —— 壁纸 ——
  async loadWallpapers() {
    for (const m of ['night', 'day']) {
      const blob = await fileGet('wallpaper-' + m);
      this.wallpaper[m] = blob ? URL.createObjectURL(blob) : null;
    }
    this.apply();
  }
  /// 当前这套的壁纸：自己选的 > 默认图 > 没有（代码画的天）
  get wallpaperURL() { return this.wallpaper[this.mode] || DEFAULT_WALLPAPER[this.mode] || null; }
  get wallpaperIsCustom() { return !!this.wallpaper[this.mode]; }
  async setWallpaper(file) {
    const blob = await downscale(file, 2400);
    await filePut('wallpaper-' + this.mode, blob);
    if (this.wallpaper[this.mode]) URL.revokeObjectURL(this.wallpaper[this.mode]);
    this.wallpaper[this.mode] = URL.createObjectURL(blob);
    this.apply();
  }
  async clearWallpaper() {
    await fileDelete('wallpaper-' + this.mode);
    if (this.wallpaper[this.mode]) URL.revokeObjectURL(this.wallpaper[this.mode]);
    this.wallpaper[this.mode] = null;
    this.apply();
  }

  // —— 算成 CSS 变量 ——
  apply() {
    const p = this.palette;
    const r = document.documentElement.style;
    const dark = this.dark;
    document.documentElement.dataset.mode = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    r.setProperty('--ink', css(p.ink));
    r.setProperty('--dim', css(p.ink, 0.62));
    r.setProperty('--faint', css(p.ink, 0.38));
    r.setProperty('--gold', css(p.gold));
    r.setProperty('--gold-a', css(p.gold, 0.75));
    r.setProperty('--tint', css(p.tint));
    r.setProperty('--sky-top', css(p.skyTop));
    r.setProperty('--sky-mid', css(p.skyMid));
    r.setProperty('--sky-bottom', css(p.skyBottom));
    r.setProperty('--nebula-a', css(p.nebulaA));
    r.setProperty('--nebula-b', css(p.nebulaB));
    r.setProperty('--star', css(p.star));
    r.setProperty('--button-glow', css(p.buttonGlow));
    r.setProperty('--toast', css(p.toast));
    r.setProperty('--card-glow', css(p.cardGlow));

    // 玻璃：浓度越高越糊；底色只跟着涨一点、封顶
    const g = this.glass;
    const k = g.strength / GLASS_DEFAULT_STRENGTH;
    const base = this.glassColor;
    r.setProperty('--glass', css(base, Math.min(0.30, p.glass * k)));
    r.setProperty('--glass-line', css(base, Math.min(0.55, p.glassLine * k)));
    r.setProperty('--pill', css(base, Math.min(0.40, p.pill * k)));
    // 磨砂档位：ultraThin / thin / regular / thick ≈ 模糊半径 + 一层底
    const blur = g.strength < 0.3 ? 12 : g.strength < 0.55 ? 18 : g.strength < 0.8 ? 26 : 36;
    const mat = g.strength < 0.3 ? 0.08 : g.strength < 0.55 ? 0.18 : g.strength < 0.8 ? 0.32 : 0.5;
    r.setProperty('--glass-blur', blur + 'px');
    r.setProperty('--glass-mat', css(dark ? [0.08, 0.05, 0.14] : [0.97, 0.95, 1], mat));

    // 牌面：saturate + multiply
    const c = this.current;
    const sat = c.mono ? 0 : 1 - c.strength;
    const col = this.color;
    const s = c.strength;
    const mult = s > 0.001 ? [1 - (1 - col[0]) * s, 1 - (1 - col[1]) * s, 1 - (1 - col[2]) * s] : [1, 1, 1];
    r.setProperty('--card-sat', String(sat));
    r.setProperty('--card-mult', css(mult));
    // 牌背：线 = 颜色往白里掺两成；底 = 颜色压暗
    const lighten = (x, kk) => x + (1 - x) * kk;
    r.setProperty('--back-line', css(col.map((x) => lighten(x, 0.22))));
    r.setProperty('--back-deep-a', css(col.map((x) => x * 0.30)));
    r.setProperty('--back-deep-b', css(col.map((x) => x * 0.10)));
    r.setProperty('--back-edge', css(col, 0.75));
    r.setProperty('--back-edge2', css(col, 0.35));

    this.renderBack(col);

    const wp = this.wallpaperURL;
    r.setProperty('--wallpaper', wp ? `url("${wp}")` : 'none');
    document.documentElement.dataset.wallpaper = wp ? '1' : '0';
    document.documentElement.dataset.stars = (!wp || this.stars) ? '1' : '0';
    this.dispatchEvent(new Event('change'));
  }
}

// —— 牌背位图 ——
// 跟 CSS 那套一样的配方：压暗的渐变底 + 黑底白线的星盘染成线色、叠两层 screen + 里外两圈细线。
// 画一次 300×516，所有牌背共用一张图，滑牌带的时候 iPhone 不用逐张算 mask 和混合。
let backSrc = null;
let backSrcLoading = null;
Decor.prototype.renderBack = function (col) {
  const key = col.map((x) => x.toFixed(3)).join(',');
  if (this._backKey === key) return;
  this._backKey = key;
  const draw = () => {
    if (!backSrc || this._backKey !== key) return;
    const W = 300, H = 516;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const rgb = (c, k = 1, a = 1) => `rgba(${Math.round(c[0] * 255 * k)},${Math.round(c[1] * 255 * k)},${Math.round(c[2] * 255 * k)},${a})`;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, rgb(col, 0.30)); g.addColorStop(1, rgb(col, 0.10));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 线：星盘（灰度）× 线色 → 得到「亮处是线色、暗处是黑」的一层
    const line = col.map((x) => x + (1 - x) * 0.22);
    const lc = document.createElement('canvas'); lc.width = W; lc.height = H;
    const lctx = lc.getContext('2d');
    const k = Math.min((W * 0.94) / backSrc.width, (H * 0.94) / backSrc.height);
    const dw = backSrc.width * k, dh = backSrc.height * k;
    lctx.fillStyle = '#000'; lctx.fillRect(0, 0, W, H);
    lctx.drawImage(backSrc, (W - dw) / 2, (H - dh) / 2, dw, dh);
    lctx.globalCompositeOperation = 'multiply'; lctx.fillStyle = rgb(line); lctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(lc, 0, 0);
    ctx.globalAlpha = 0.7; ctx.drawImage(lc, 0, 0); ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // 里圈细线（外圈留给 CSS 的 ::after，跟着圆角走）
    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    ctx.strokeStyle = rgb(col, 1, 0.35); ctx.lineWidth = 2;
    rr(W * 0.06, H * 0.06, W * 0.88, H * 0.88, W * 0.05); ctx.stroke();
    const url = cv.toDataURL('image/jpeg', 0.86);   // 不透明，jpeg 够了，比 png 小七八倍
    setBackBitmap(url);
    document.documentElement.style.setProperty('--back-img', `url("${url}")`);
    document.documentElement.dataset.backimg = '1';
    this.dispatchEvent(new Event('back'));
  };
  if (backSrc) { draw(); return; }
  if (!backSrcLoading) {
    backSrcLoading = new Promise((res) => { const i = new Image(); i.onload = () => { backSrc = i; res(); }; i.onerror = () => res(); i.src = backImageURL(); });
  }
  backSrcLoading.then(draw);
};

async function downscale(file, maxSide) {
  const bmp = await createImageBitmap(file);
  const longest = Math.max(bmp.width, bmp.height);
  const k = longest > maxSide ? maxSide / longest : 1;
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k);
  cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close?.();
  return new Promise((res) => cv.toBlob((b) => res(b), 'image/jpeg', 0.88));
}

export const decor = new Decor();
