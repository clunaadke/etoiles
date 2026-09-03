// 固定解牌库（0903 她定的结构）：按「牌名 + 正逆位 + 主题 + 牌位」读一段。
//
//   普通牌位：single 单张 / day 每日 / week_main 本周主线 / week_caution 需要注意 / week_action 行动建议 / past 过去 / present 现在 / future 未来
//   主题：life 日常 / love 感情 / work 事业 / self 自我
//   → 78 × 2 × 4 × 8 = 4992 条，文件 data/library/normal/{majors,wands,cups,swords,pents}.json
//
//   关系牌阵单独一套，不叠主题：me 我 / him 他 / between 我们之间 / block 阻碍 / toward 走向
//   → 78 × 2 × 5 = 780 条，文件 data/library/relation.json
//
// 文件是纯 JSON，空字符串 = 还没写。开发期没写的格不退老表：页面上显示「缺失」提示并记下牌名 / 正逆 / 主题 / 牌位
// （missingLog()），5772 格全写完之前不算正式开放。coverage() 报进度。
//
// 用法：
//   await loadLibrary(base)                 页面 / 零件启动时拉一次（base = 资源根，如 './'）
//   loadLibraryFrom(obj)                    Node / 测试：直接塞进来 {normal:{...合并后...}, relation:{...}}
//   lookup(cardId, reversed, theme, pos)    普通牌位 → 文本或 ''
//   lookupRelation(cardId, reversed, pos)   关系牌位 → 文本或 ''
//   positionKey(spreadId, positionKey, question) 把牌阵里的位置换算成库里的牌位键

export const THEMES = ['life', 'love', 'work', 'self'];
export const THEME_NAMES = { life: '日常', love: '感情', work: '事业', self: '自我' };
export const NORMAL_POSITIONS = ['single', 'day', 'week_main', 'week_caution', 'week_action', 'past', 'present', 'future'];
export const NORMAL_POSITION_NAMES = { single: '单张', day: '每日', week_main: '本周主线', week_caution: '需要注意', week_action: '行动建议', past: '过去', present: '现在', future: '未来' };
/// 本周牌阵里的位置键（老的 axis / gentle / action，记录里存的就是它们）→ 库里的牌位
const WEEK_MAP = { axis: 'week_main', gentle: 'week_caution', action: 'week_action' };
export const RELATION_POSITIONS = ['me', 'him', 'between', 'block', 'toward'];
export const RELATION_POSITION_NAMES = { me: '我', him: 'ta', between: '我们之间', block: '阻碍', toward: '走向' };
export const NORMAL_FILES = ['majors', 'wands', 'cups', 'swords', 'pents'];

const lib = { normal: {}, relation: {}, loaded: false };
let loading = null;

/// 牌阵里的位置 → 库里的牌位键。单张牌阵：问题是「每日一牌」算 daily，其他算 single；
/// 本周牌阵三个位 → week_main / week_caution / week_action；三张牌阵按 past / present / future；关系牌阵原样。
export function positionKey(spreadId, position, question) {
  if (spreadId === 'relation') return RELATION_POSITIONS.includes(position) ? position : 'me';
  if (spreadId === 'one') return question === '每日一牌' ? 'day' : 'single';
  if (spreadId === 'week') return WEEK_MAP[position] || 'week_main';
  if (spreadId === 'three') return NORMAL_POSITIONS.includes(position) ? position : 'present';
  return NORMAL_POSITIONS.includes(position) ? position : 'single';
}
export const isRelationSpread = (spreadId) => spreadId === 'relation';

export function lookup(cardId, reversed, theme, pos) {
  const t = lib.normal[cardId]?.[reversed ? 'rev' : 'up']?.[theme]?.[pos];
  return typeof t === 'string' ? t.trim() : '';
}
export function lookupRelation(cardId, reversed, pos) {
  const t = lib.relation[cardId]?.[reversed ? 'rev' : 'up']?.[pos];
  return typeof t === 'string' ? t.trim() : '';
}
export const libraryLoaded = () => lib.loaded;

// —— 开发期缺失记录 ——
// 没写的格：页面显示这句提示，并把牌名 / 正逆 / 主题 / 牌位记进 missing（同一格只记一次），console 也打一行。
const missing = new Map();
export function missingNotice({ cardId, cardName, reversed, theme, position }) {
  const side = reversed ? '逆位' : '正位';
  const themeName = theme ? THEME_NAMES[theme] || theme : '';
  const posName = NORMAL_POSITION_NAMES[position] || RELATION_POSITION_NAMES[position] || position;
  const key = `${cardId}|${reversed ? 'rev' : 'up'}|${theme || 'relation'}|${position}`;
  if (!missing.has(key)) {
    missing.set(key, { cardId, cardName, reversed, theme: theme || null, position, at: new Date().toISOString() });
    if (typeof console !== 'undefined') console.warn('[解牌库缺失]', cardName, side, themeName || '关系', posName);
  }
  const where = theme ? `${themeName} · ${posName}` : `关系 · ${posName}`;
  return `【开发期缺失】${cardName}${side} · ${where}：这一格固定牌义还没写。`;
}
export const missingLog = () => [...missing.values()];
export const missingCount = () => missing.size;

export function loadLibraryFrom({ normal = {}, relation = {} } = {}) {
  lib.normal = normal; lib.relation = relation; lib.loaded = true;
  return lib;
}

/// 浏览器里：并行拉六个 JSON，坏了一个不影响别的（那部分就走老表）
export function loadLibrary(base = './') {
  if (loading) return loading;
  loading = (async () => {
    const get = async (rel) => { try { const r = await fetch(base + rel, { cache: 'no-cache' }); return r.ok ? await r.json() : {}; } catch { return {}; } };
    const parts = await Promise.all(NORMAL_FILES.map((f) => get(`data/library/normal/${f}.json`)));
    const normal = Object.assign({}, ...parts);
    const relation = await get('data/library/relation.json');
    return loadLibraryFrom({ normal, relation });
  })();
  return loading;
}

/// 进度：填了多少格
export function coverage() {
  let n = 0, filled = 0;
  const byTheme = Object.fromEntries(THEMES.map((t) => [t, 0]));
  const byPos = Object.fromEntries([...NORMAL_POSITIONS, ...RELATION_POSITIONS].map((p) => [p, 0]));
  for (const card of Object.values(lib.normal)) for (const side of ['up', 'rev']) for (const t of THEMES) for (const p of NORMAL_POSITIONS) {
    n++;
    if ((card?.[side]?.[t]?.[p] || '').trim()) { filled++; byTheme[t]++; byPos[p]++; }
  }
  let rn = 0, rfilled = 0;
  for (const card of Object.values(lib.relation)) for (const side of ['up', 'rev']) for (const p of RELATION_POSITIONS) {
    rn++;
    if ((card?.[side]?.[p] || '').trim()) { rfilled++; byPos[p]++; }
  }
  return { normal: { total: n, filled }, relation: { total: rn, filled: rfilled }, total: n + rn, filled: filled + rfilled, byTheme, byPos };
}
