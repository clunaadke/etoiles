// 固定解牌库（0903 她定的结构）：按「牌名 + 正逆位 + 主题 + 牌位」读一段。
//
//   普通牌位：single 单张 / daily 每日运势 / weekly 每周运势 / past 过去 / present 现在 / future 未来
//   主题：daily 日常 / love 感情 / work 事业 / self 自我
//   → 78 × 2 × 4 × 6 = 3744 条，文件 data/library/normal/{majors,wands,cups,swords,pents}.json
//
//   关系牌阵单独一套，不叠主题：me 我 / him 他 / between 我们之间 / block 阻碍 / toward 走向
//   → 78 × 2 × 5 = 780 条，文件 data/library/relation.json
//
// 文件是纯 JSON，空字符串 = 还没写。读的时候没写的那格自动退回老表（data/text.js，按主题一段 + 时态替换），
// 所以可以一格一格慢慢填，填一格生效一格。coverage() 报进度。
//
// 用法：
//   await loadLibrary(base)                 页面 / 零件启动时拉一次（base = 资源根，如 './'）
//   loadLibraryFrom(obj)                    Node / 测试：直接塞进来 {normal:{...合并后...}, relation:{...}}
//   lookup(cardId, reversed, theme, pos)    普通牌位 → 文本或 ''
//   lookupRelation(cardId, reversed, pos)   关系牌位 → 文本或 ''
//   positionKey(spreadId, positionKey, question) 把牌阵里的位置换算成库里的牌位键

export const THEMES = ['daily', 'love', 'work', 'self'];
export const THEME_NAMES = { daily: '日常', love: '感情', work: '事业', self: '自我' };
export const NORMAL_POSITIONS = ['single', 'daily', 'weekly', 'past', 'present', 'future'];
export const NORMAL_POSITION_NAMES = { single: '单张', daily: '每日运势', weekly: '每周运势', past: '过去', present: '现在', future: '未来' };
export const RELATION_POSITIONS = ['me', 'him', 'between', 'block', 'toward'];
export const RELATION_POSITION_NAMES = { me: '我', him: '他', between: '我们之间', block: '阻碍', toward: '走向' };
export const NORMAL_FILES = ['majors', 'wands', 'cups', 'swords', 'pents'];

const lib = { normal: {}, relation: {}, loaded: false };
let loading = null;

/// 牌阵里的位置 → 库里的牌位键。单张牌阵：问题是「每日一牌」算 daily，其他算 single；
/// 本周牌阵三个位（主轴 / 行动 / 提醒）目前都读 weekly；三张牌阵按 past / present / future；关系牌阵原样。
export function positionKey(spreadId, position, question) {
  if (spreadId === 'relation') return RELATION_POSITIONS.includes(position) ? position : 'me';
  if (spreadId === 'one') return question === '每日一牌' ? 'daily' : 'single';
  if (spreadId === 'week') return 'weekly';
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
