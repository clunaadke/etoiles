// 存成图片：一次占卜画成一张竖长票（宽 390 逻辑像素、3x 出图），移植自 TarotTicketView。
// 底是壁纸（没有就是代码画的天）；牌面在 canvas 上照样染色（saturate + multiply）。

import { CARD_BY_ID } from './data/deck.js';
import { spreadOf } from './reading.js';
import { decor } from './decor.js';
import { loadCardImage } from './cards.js';

const W = 390;
const SCALE = 3;

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('图片没加载出来')); i.src = src; });
}

/// 按宽度折行（中文按字、英文按词）
function wrap(ctx, text, maxW) {
  const lines = [];
  for (const raw of String(text).split('\n')) {
    let line = '';
    const units = raw.match(/[A-Za-z0-9'’]+|\s+|./gu) || [];
    for (const u of units) {
      const test = line + u;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line.trimEnd()); line = u.trimStart(); }
      else line = test;
    }
    lines.push(line);
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

async function drawFace(ctx, img, x, y, w, reversed) {
  const h = w * 1.72;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (reversed) ctx.rotate(Math.PI);
  ctx.translate(-w / 2, -h / 2);
  roundRect(ctx, 0, 0, w, h, w * 0.07);
  ctx.clip();
  const sat = parseFloat(cssVar('--card-sat')) || 0;
  ctx.filter = `saturate(${sat})`;
  // cover
  const k = Math.max(w / img.width, h / img.height);
  const dw = img.width * k, dh = img.height * k;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = cssVar('--card-mult');
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = cssVar('--gold'); ctx.globalAlpha = 0.55; ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, w * 0.07); ctx.stroke();
  ctx.restore();
}

export async function renderTicket(reading, interp) {
  const sp = spreadOf(reading.spread);
  const n = reading.cards.length;
  const cardW = n === 1 ? 170 : n <= 3 ? 100 : 62;
  const ink = cssVar('--ink'), gold = cssVar('--gold'), dim = cssVar('--dim'), tint = cssVar('--tint'), faint = cssVar('--faint'), line = cssVar('--glass-line');
  const hand = "'Tanugo', 'PingFang TC', system-ui, sans-serif";
  const serif = "'Songti SC', 'Noto Serif CJK SC', Georgia, serif";
  const sans = "-apple-system, 'PingFang SC', 'Noto Sans CJK SC', system-ui, sans-serif";
  const images = await Promise.all(reading.cards.map((c) => loadCardImage(c.id)));
  try { await document.fonts.load(`20px 'Tanugo'`); } catch { /* 没字体就系统的 */ }

  // 先量高度：用一张临时 canvas 走一遍排版
  const measure = document.createElement('canvas').getContext('2d');
  const blocks = [];   // [type, ...]
  let y = 34;
  const add = (hgt, draw) => { blocks.push({ y, draw }); y += hgt; };

  add(48, (ctx) => {
    ctx.textAlign = 'center'; ctx.fillStyle = ink; ctx.font = `20px ${hand}`; ctx.fillText('Chambre des Étoiles', W / 2, 20);
    ctx.fillStyle = gold; ctx.font = `9px ${hand}`; ctx.letterSpacing = '3px'; ctx.fillText('占星室', W / 2 + 1.5, 38); ctx.letterSpacing = '0px';
  });
  add(30, (ctx) => {
    ctx.textAlign = 'center'; ctx.font = `500 15px ${serif}`; ctx.fillStyle = ink;
    const dt = (reading.ts || '').slice(0, 10);
    const dw = ctx.measureText(dt).width;
    ctx.font = `600 10px ${sans}`; const pw = ctx.measureText(sp.name).width + 16;
    const total = dw + 8 + pw; const x0 = W / 2 - total / 2;
    ctx.textAlign = 'left'; ctx.font = `500 15px ${serif}`; ctx.fillText(dt, x0, 14);
    ctx.strokeStyle = tint; ctx.globalAlpha = .7; roundRect(ctx, x0 + dw + 8, 2, pw, 18, 9); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = tint; ctx.font = `600 10px ${sans}`; ctx.fillText(sp.name, x0 + dw + 16, 14.5);
  });
  if (reading.question) {
    measure.font = `500 14px ${serif}`;
    const ls = wrap(measure, `「${reading.question}」`, W - 60);
    add(ls.length * 20 + 12, (ctx) => { ctx.textAlign = 'center'; ctx.fillStyle = ink; ctx.font = `500 14px ${serif}`; ls.forEach((l, i) => ctx.fillText(l, W / 2, 14 + i * 20)); });
  }
  // 一排牌
  const gap = n > 3 ? 8 : 14;
  add(cardW * 1.72 + (n > 1 ? 18 : 0) + 22, (ctx) => {
    const total = n * cardW + (n - 1) * gap; let x = W / 2 - total / 2;
    reading.cards.forEach((c, i) => {
      drawFace(ctx, images[i], x, 0, cardW, c.reversed);
      if (n > 1) { ctx.textAlign = 'center'; ctx.fillStyle = gold; ctx.font = `600 9.5px ${sans}`; ctx.fillText(sp.positions.find((p) => p.key === c.position)?.name || '', x + cardW / 2, cardW * 1.72 + 12); }
      x += cardW + gap;
    });
  });
  add(22, (ctx) => { ctx.fillStyle = line; ctx.fillRect(40, 10, W - 80, 1); });
  for (const c of reading.cards) {
    const card = CARD_BY_ID[c.id] || {};
    const pos = n > 1 ? (sp.positions.find((p) => p.key === c.position)?.name || '') + ' · ' : '';
    measure.font = `12px ${serif}`;
    const mean = wrap(measure, c.reversed ? card.meaningRev || '' : card.meaningUp || '', W - 52);
    add(22 + 16 + mean.length * 18 + 12, (ctx) => {
      ctx.textAlign = 'center';
      ctx.font = `500 15px ${serif}`;
      const nm = card.name || c.id; const rv = c.reversed ? '逆位' : '正位';
      const wPos = pos ? (ctx.font = `13px ${serif}`, ctx.measureText(pos).width) : 0;
      ctx.font = `500 15px ${serif}`; const wNm = ctx.measureText(nm).width;
      ctx.font = `600 9.5px ${sans}`; const wRv = ctx.measureText(rv).width;
      let x = W / 2 - (wPos + wNm + 6 + wRv) / 2; ctx.textAlign = 'left';
      if (pos) { ctx.fillStyle = gold; ctx.font = `13px ${serif}`; ctx.fillText(pos, x, 14); x += wPos; }
      ctx.fillStyle = ink; ctx.font = `500 15px ${serif}`; ctx.fillText(nm, x, 14); x += wNm + 6;
      ctx.fillStyle = c.reversed ? gold : tint; ctx.font = `600 9.5px ${sans}`; ctx.fillText(rv, x, 13);
      ctx.textAlign = 'center'; ctx.fillStyle = dim; ctx.font = `10.5px ${sans}`;
      ctx.fillText((c.reversed ? card.keywordsRev : card.keywordsUp || []).join(' · '), W / 2, 32);
      ctx.fillStyle = ink; ctx.globalAlpha = .9; ctx.font = `12px ${serif}`;
      mean.forEach((l, i) => ctx.fillText(l, W / 2, 50 + i * 18)); ctx.globalAlpha = 1;
    });
  }
  const ip = interp || reading.interp;
  if (ip) {
    add(22, (ctx) => { ctx.fillStyle = line; ctx.fillRect(40, 10, W - 80, 1); });
    measure.font = `12px ${serif}`; const ov = wrap(measure, ip.overall, W - 52);
    measure.font = `500 12px ${serif}`; const ol = wrap(measure, ip.oneline, W - 52);
    add(18 + ov.length * 18 + 8 + ol.length * 17 + 10, (ctx) => {
      ctx.textAlign = 'center'; ctx.fillStyle = gold; ctx.font = `10px ${hand}`; ctx.letterSpacing = '2px'; ctx.fillText(`客觀解讀 · ${ip.category_name}`, W / 2, 10); ctx.letterSpacing = '0px';
      ctx.fillStyle = ink; ctx.font = `12px ${serif}`; ov.forEach((l, i) => ctx.fillText(l, W / 2, 30 + i * 18));
      ctx.fillStyle = gold; ctx.font = `500 12px ${serif}`; ol.forEach((l, i) => ctx.fillText(l, W / 2, 30 + ov.length * 18 + 8 + i * 17));
    });
  }
  add(40, (ctx) => { ctx.textAlign = 'center'; ctx.fillStyle = faint; ctx.font = `9px ${hand}`; ctx.letterSpacing = '3px'; ctx.fillText('CHAMBRE · TAROT', W / 2 + 1.5, 20); ctx.letterSpacing = '0px'; });
  const H = y + 10;

  const cv = document.createElement('canvas');
  cv.width = W * SCALE; cv.height = H * SCALE;
  const ctx = cv.getContext('2d');
  ctx.scale(SCALE, SCALE);
  // 底
  if (decor.wallpaperURL) {
    const wp = await loadImage(decor.wallpaperURL);
    const k = Math.max(W / wp.width, H / wp.height);
    ctx.drawImage(wp, (W - wp.width * k) / 2, (H - wp.height * k) / 2, wp.width * k, wp.height * k);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, cssVar('--sky-top')); g.addColorStop(.5, cssVar('--sky-mid')); g.addColorStop(1, cssVar('--sky-bottom'));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const neb = (x, yy, r, col) => { const rg = ctx.createRadialGradient(x, yy, 0, x, yy, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); };
    neb(W * .2, H * .25, 320, cssVar('--nebula-a')); neb(W * .85, H * .7, 300, cssVar('--nebula-b'));
  }
  ctx.textBaseline = 'alphabetic';
  for (const b of blocks) { ctx.save(); ctx.translate(0, b.y); await b.draw(ctx); ctx.restore(); }
  return new Promise((res, rej) => cv.toBlob((blob) => (blob ? res(blob) : rej(new Error('canvas 出不了图'))), 'image/png'));
}

/// 存图：能分享就走系统分享面板（iPhone 上能直接「存储图像」），不能就下载
export async function saveImage(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
