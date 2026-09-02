// 牌带（移植自 TarotDeckBand）：整副牌一字排开、带一点弧度，手指左右拖整副牌跟着走，
// 滚到正中间的那张往前突出来放大；再点它 → onChoose(第几张)。两头到底停，首尾也能到正中间。
// 松手带一点惯性（最多再飞 6 张），然后吸到最近的一张。只画屏幕附近那十几张；两边渐隐。
//
//   const band = new DeckBand(container, { deck: [...ids], cardW, gap, arc, lift, pop, onChoose });
//   band.setDeck(ids) / band.destroy()

import { cardBack } from './cards.js';

export class DeckBand {
  constructor(host, opts) {
    this.host = host;
    this.deck = opts.deck.slice();
    this.cardW = opts.cardW ?? 84;
    this.gap = opts.gap ?? 46;
    this.arc = opts.arc ?? 1500;
    this.lift = opts.lift ?? 34;
    this.pop = opts.pop ?? 0.22;
    this.onChoose = opts.onChoose || (() => {});
    this.scroll = Math.floor(this.deck.length / 2);
    this.target = this.scroll;
    this.vel = 0;
    this.dragging = false;
    this.pool = new Map();       // index -> element
    this.enabled = true;

    host.classList.add('deck-band');
    this.glow = document.createElement('div');
    this.glow.className = 'band-glow';
    this.layer = document.createElement('div');
    this.layer.className = 'band-layer';
    host.append(this.glow, this.layer);

    this._onDown = this.onDown.bind(this);
    this._onMove = this.onMove.bind(this);
    this._onUp = this.onUp.bind(this);
    host.addEventListener('pointerdown', this._onDown);
    host.addEventListener('pointermove', this._onMove);
    host.addEventListener('pointerup', this._onUp);
    host.addEventListener('pointercancel', this._onUp);
    host.style.touchAction = 'pan-y';
    this._ro = new ResizeObserver(() => this.render());
    this._ro.observe(host);
    this._raf = 0;
    this.render();
  }

  get maxScroll() { return Math.max(0, this.deck.length - 1); }
  clamp(v) { return Math.min(Math.max(0, v), this.maxScroll); }

  setDeck(ids) {
    this.deck = ids.slice();
    this.scroll = this.clamp(this.scroll);
    this.target = this.clamp(Math.round(this.scroll));
    for (const el of this.pool.values()) el.remove();
    this.pool.clear();
    this.render();
  }

  destroy() {
    this._ro.disconnect();
    cancelAnimationFrame(this._raf);
    this.host.removeEventListener('pointerdown', this._onDown);
    this.host.removeEventListener('pointermove', this._onMove);
    this.host.removeEventListener('pointerup', this._onUp);
    this.host.removeEventListener('pointercancel', this._onUp);
    this.host.innerHTML = '';
    this.host.classList.remove('deck-band');
  }

  // —— 手势 ——
  onDown(e) {
    if (!this.enabled || this.deck.length === 0) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.dragging = true;
    this.pid = e.pointerId;
    this.host.setPointerCapture?.(e.pointerId);
    this.startX = e.clientX; this.startY = e.clientY;
    this.startScroll = this.scroll;
    this.lastX = e.clientX; this.lastT = performance.now(); this.vel = 0;
    this.moved = false;
    cancelAnimationFrame(this._raf);
  }
  onMove(e) {
    if (!this.dragging || e.pointerId !== this.pid) return;
    const dx = e.clientX - this.startX;
    if (Math.abs(dx) > 4 || Math.abs(e.clientY - this.startY) > 4) this.moved = true;
    const t = performance.now();
    const dt = Math.max(1, t - this.lastT);
    this.vel = 0.7 * this.vel + 0.3 * ((e.clientX - this.lastX) / dt);     // px/ms
    this.lastX = e.clientX; this.lastT = t;
    this.scroll = this.clamp(this.startScroll - dx / this.gap);
    this.render();
  }
  onUp(e) {
    if (!this.dragging || e.pointerId !== this.pid) return;
    this.dragging = false;
    const dist = Math.hypot(e.clientX - this.startX, e.clientY - this.startY);
    if (dist < 8) {
      // 点：正中间那张就选它；旁边的滚到中间
      const rect = this.host.getBoundingClientRect();
      const hit = (e.clientX - rect.left - rect.width / 2) / this.gap;
      const center = Math.round(this.scroll);
      if (Math.abs(hit) < 0.75 && Math.abs(this.scroll - center) < 0.05 && center < this.deck.length) {
        this.onChoose(center);
      } else {
        this.animateTo(this.clamp(Math.round(this.scroll + hit)));
      }
      return;
    }
    // 惯性：按预测落点，最多再飞 6 张，吸到最近一张
    const predicted = this.scroll - (this.vel * 220) / this.gap;
    const target = Math.min(Math.max(predicted, this.scroll - 6), this.scroll + 6);
    this.animateTo(this.clamp(Math.round(target)));
  }

  animateTo(target) {
    this.target = target;
    cancelAnimationFrame(this._raf);
    let last = performance.now();
    let v = 0;
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // 临界阻尼弹簧（response ≈ 0.4s）
      const k = 250, c = 2 * Math.sqrt(k) * 0.95;
      const a = -k * (this.scroll - this.target) - c * v;
      v += a * dt;
      this.scroll += v * dt;
      if (Math.abs(this.scroll - this.target) < 0.002 && Math.abs(v) < 0.01) {
        this.scroll = this.target; this.render(); return;
      }
      this.render();
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  // —— 画 ——
  render() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    const n = this.deck.length;
    const baseY = h * 0.58;
    const half = Math.ceil(w / 2 / this.gap) + 2;
    const s = Math.max(0, this.scroll);
    const c = Math.round(s);
    const lo = Math.max(0, c - half), hi = Math.min(n - 1, c + half);
    const cardH = this.cardW * 1.72;
    // 回收看不见的
    for (const [i, el] of this.pool) if (i < lo || i > hi || i >= n) { el.remove(); this.pool.delete(i); }
    if (n === 0 || lo > hi) { this.glow.style.display = 'none'; return; }
    for (let i = lo; i <= hi; i++) {
      let el = this.pool.get(i);
      if (!el) {
        el = cardBack({ width: this.cardW });
        el.classList.add('band-card');
        el.dataset.index = String(i);
        this.pool.set(i, el);
        this.layer.append(el);
      }
      const d = i - s;
      const dx = d * this.gap;
      const wgt = Math.max(0, 1 - Math.abs(d));
      const ang = Math.atan(dx / this.arc);
      const y = baseY + (dx * dx) / (2 * this.arc) - wgt * this.lift;
      const x = w / 2 + dx;
      el.style.transform = `translate(${x - this.cardW / 2}px, ${y - cardH / 2}px) rotate(${ang}rad) scale(${1 + this.pop * wgt})`;
      el.style.zIndex = String(1000 - Math.round(Math.abs(d) * 10));
      el.style.setProperty('--halo', wgt.toFixed(3));
    }
    // 背后那条跟弧走的光带：一段 SVG path，糊开
    const xMin = w / 2 + (lo - s) * this.gap - this.cardW / 2;
    const xMax = w / 2 + (hi - s) * this.gap + this.cardW / 2;
    const halfH = cardH / 2 - 2;
    const x0 = Math.max(0, xMin), x1 = Math.min(w, xMax);
    if (x1 <= x0) { this.glow.style.display = 'none'; return; }
    const yy = (x) => baseY + ((x - w / 2) ** 2) / (2 * this.arc);
    const steps = 24;
    let dPath = `M${x0.toFixed(1)},${(yy(x0) - halfH).toFixed(1)}`;
    for (let i = 1; i <= steps; i++) { const x = x0 + ((x1 - x0) * i) / steps; dPath += ` L${x.toFixed(1)},${(yy(x) - halfH).toFixed(1)}`; }
    for (let i = steps; i >= 0; i--) { const x = x0 + ((x1 - x0) * i) / steps; dPath += ` L${x.toFixed(1)},${(yy(x) + halfH).toFixed(1)}`; }
    dPath += 'Z';
    this.glow.style.display = '';
    this.glow.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${dPath}" fill="var(--card-glow)"/></svg>`;
  }
}
