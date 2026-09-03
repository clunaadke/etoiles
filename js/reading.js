// 客观解读：不认识提问者、只看牌的那份。全是查表拼的，不花钱、秒出、永远一样。
// 一比一移植自 Alcove 后端 tarot_reading.py（2026-09-03）。表在 data/text.js，框架在这里。
//
//   build(reading, category?) -> interp   给页面画分段
//   render(interp) -> string              给 AI / 人读的纯文本
//   detectCategory(question, explicit?)   问题分类

import { CARD_BY_ID, SPREADS } from './data/deck.js';
import { lookup, lookupRelation, positionKey, isRelationSpread, missingNotice, isDev, MISSING_PROD_SHORT } from './library.js';

export const CATEGORIES = { love: '感情', work: '事业', self: '自我', life: '日常' };

const LOVE = /他|她|喜欢|爱|恋|关系|在一起|分手|暧昧|想我|吵架|表白|复合|老公|老婆|男朋友|女朋友|伴侣|婚|我们|我俩|两个人|感情|对象|想念|见面|亲/;
const WORK = /工作|事业|项目|老板|同事|考试|学习|钱|收入|面试|上线|升职|离职|生意|投资|赚|合作|作业|论文|课/;
const SELF = /我自己|状态|情绪|焦虑|该不该|内心|性格|在想什么|迷茫|坚持|放弃|改变|选择|决定|方向|我是/;

export const DAILY_QUESTION = '每日一牌';
export const WEEKLY_QUESTION = '本周运势';

export function detectCategory(question, explicit) {
  if (explicit && explicit in CATEGORIES) return explicit;
  const q = (question || '').trim();
  if (!q || q === DAILY_QUESTION || q === WEEKLY_QUESTION) return 'life';
  if (LOVE.test(q)) return 'love';
  if (WORK.test(q)) return 'work';
  if (SELF.test(q)) return 'self';
  return 'life';
}

// 牌位前缀：这张牌落在这个位置上，先说这个位置在问什么
export const POSITION_INTRO = {
  answer: '单张牌阵用一张牌回应问题，重点是提供一个观察角度，不替现实下结论。',
  past: '过去位用来观察这件事可能的来处：哪些旧经验或模式仍在影响现在。',
  present: '现在位用来观察眼下较突出的力量，也是比较容易着手调整的地方。',
  future: '未来位说的是照当前走法可能形成的趋势，不是判决；现在改变，趋势也会改变。',
  axis: '本周主线提供这一周的核心观察角度，其他牌围绕它补充细节。',
  gentle: '需要注意位提示这周可能出现的阻碍或风险，提前看见会更容易应对。',
  action: '行动建议位说的是这周适合怎么做，是动作，不是心情。',
  me: '「我」位提供一个观察自己在关系中状态和姿态的角度，不代表 ta 眼里的你。',
  him: '「ta」位反映 ta 可能呈现的状态或姿态，不读取内心，也不替 ta 表态。',
  between: '「我们之间」用来观察关系目前可能呈现的互动模式，不替任何一方下定义。',
  block: '「阻碍」位提示可能卡住关系的模式；正逆位都需要结合真实互动判断。',
  toward: '「走向」是关系照当前模式可能形成的趋势，不是结局。',
};

const SUIT_THEME = {
  wands: ['权杖', '火', '行动、热情、意志'],
  cups: ['圣杯', '水', '情感、关系、直觉'],
  swords: ['宝剑', '风', '思考、冲突、真相'],
  pents: ['星币', '土', '现实、身体、金钱'],
};
const MAJOR_INTRO = '大阿卡那通常强调阶段、方向或重要主题，具体怎样落到现实仍取决于处境和选择。';
const CLASH = new Set(['fire|water', 'water|fire', 'air|earth', 'earth|air']);
const ELEMENT = { wands: 'fire', cups: 'water', swords: 'air', pents: 'earth' };

const suitOf = (cid) => cid.split('_')[0];
const numOf = (cid) => { const n = parseInt(cid.split('_')[1], 10); return Number.isNaN(n) ? -1 : n; };
const isCourt = (cid) => suitOf(cid) !== 'major' && numOf(cid) >= 11;

// 牌面关系：几条硬规则，凑成「整体印象」和「牌面关系」
export function relations(cards) {
  const n = cards.length;
  const notes = [];
  if (n <= 1) return notes;
  const majors = cards.filter((c) => suitOf(c.id) === 'major');
  const revs = cards.filter((c) => c.reversed);
  const suits = {};
  for (const c of cards) {
    const s = suitOf(c.id);
    if (s !== 'major') suits[s] = (suits[s] || 0) + 1;
  }
  const courts = cards.filter((c) => isCourt(c.id));

  if (majors.length === n) {
    notes.push('全是大阿卡那，牌面更强调阶段与方向。它不代表事情不受你控制，仍要结合现实处境和选择来判断。');
  } else if (majors.length >= Math.max(2, Math.floor(n / 2) + 1)) {
    notes.push(`${n} 张里有 ${majors.length} 张大阿卡那，牌面把重点放在阶段与方向上；小牌补充具体的情绪和行动。`);
  } else if (!majors.length) {
    notes.push('没有大阿卡那，全是小牌：牌面更关注日常尺度和具体行动，不需要把它理解成命运式的结论。');
  }

  const suitKeys = Object.keys(suits);
  if (suitKeys.length) {
    let top = suitKeys[0];
    for (const k of suitKeys) if (suits[k] > suits[top]) top = k;
    if (suits[top] >= 2 && suits[top] >= Math.floor(n / 2)) {
      const [zh, el, theme] = SUIT_THEME[top];
      notes.push(`${zh}较多（${suits[top]} 张）。${el}元素强调${theme}，可以优先从这个角度理解这组牌。`);
    }
    const elems = suitKeys.map((s) => ELEMENT[s]);
    let clash = false;
    for (const a of elems) for (const b of elems) if (a !== b && CLASH.has(a + '|' + b)) clash = true;
    if (clash) notes.push('牌里同时出现相克元素，可能提示两种需求正在拉扯：例如一边想动、一边想稳，或一边讲理、一边讲情。');
  }

  if (revs.length === n && n >= 2) {
    notes.push('全部逆位不等于全坏，更像是力量向内、受阻或需要调整。比起硬推，先复盘可能更合适。');
  } else if (revs.length >= Math.floor((n + 1) / 2) + (n >= 4 ? 1 : 0)) {
    notes.push(`逆位占了 ${revs.length} 张，牌面提示需要调整的地方较多，推进节奏可能比预想中慢。`);
  } else if (!revs.length) {
    notes.push('全部正位，牌义表达得较直接，但这仍然只是趋势，不代表结果已经确定。');
  }

  if (courts.length >= 2) {
    notes.push(`出了 ${courts.length} 张宫廷牌，可以多留意参与者的立场、沟通和分工，但不据此猜测任何人的内心。`);
  }

  const nums = cards.filter((c) => suitOf(c.id) !== 'major' && numOf(c.id) >= 1 && numOf(c.id) <= 10).map((c) => numOf(c.id));
  const REPEAT = {
    1: '重复出现的一强调开端与主动。', 2: '重复的二强调选择、配对与平衡。',
    3: '重复的三强调发展、协作与初步成果。', 4: '重复的四强调稳定，也提醒留意停滞。',
    5: '重复的五强调摩擦、损失或过渡。', 6: '重复的六强调修复、回望与重新平衡。',
    7: '重复的七强调评估、坚持与取舍。', 8: '重复的八强调推进、调整或挣脱。',
    9: '重复的九强调接近完成，也提醒留意压力。', 10: '重复的十强调阶段完成、负担与收尾。',
  };
  for (const k of new Set(nums)) {
    if (nums.filter((x) => x === k).length >= 2) { notes.push(REPEAT[k]); break; }
  }
  return notes;
}

// 整体印象：三四句，按牌的构成说气场
export function overall(cards, category) {
  const n = cards.length;
  const majors = cards.filter((c) => suitOf(c.id) === 'major').length;
  const revs = cards.filter((c) => c.reversed).length;
  const cat = CATEGORIES[category];
  if (n === 1) {
    const c = cards[0];
    const card = CARD_BY_ID[c.id] || {};
    const tone = c.reversed ? '逆位' : '正位';
    return `单张牌阵，按${cat}来读。抽到${card.name || ''}${tone}，` +
      (suitOf(c.id) === 'major'
        ? '这是一张大牌，解读重点放在阶段和方向上，再结合现实细节判断。'
        : '这是一张小牌，解读重点放在具体的日常感受和行动上。');
  }
  const parts = [`${n} 张牌，按${cat}来读。`];
  if (majors === 0) parts.push('整副没有大牌，气场是日常的、可操作的。');
  else if (majors === n) parts.push('整副全是大牌，气场很重，像在经历一个明显的阶段转换。');
  else parts.push(`${majors} 张大牌定方向，${n - majors} 张小牌讲细节。`);
  if (revs === 0) parts.push('没有逆位，力量顺着走。');
  else if (revs === n) parts.push('全逆位，力量都在往回收。');
  else parts.push(`${revs} 张逆位，有顺有阻。`);
  return parts.join('');
}

// 一句话：拿最重的那张（先大牌，再最后一张）说
export function oneline(cards, category, question, spreadId) {
  let key = cards.find((c) => suitOf(c.id) === 'major') || cards[cards.length - 1];
  const libKey = positionKey(spreadId || (cards.length > 1 ? 'three' : 'one'), key.position, question);
  const fromLib = isRelationSpread(spreadId) ? lookupRelation(key.id, key.reversed, libKey) : lookup(key.id, key.reversed, category, libKey);
  const name0 = (CARD_BY_ID[key.id] || {}).name || key.id;
  if (!fromLib) return `${name0}${key.reversed ? '逆位' : '正位'}定调：${isDev() ? '（这一格固定牌义还没写）' : MISSING_PROD_SHORT}`;
  const text = fromLib;
  const first = text.split(/[。！？]/, 1)[0];
  const name = (CARD_BY_ID[key.id] || {}).name || key.id;
  return `${name}${key.reversed ? '逆位' : '正位'}定调：${first}。`;
}

export function spreadOf(id) {
  return SPREADS.find((s) => s.id === id) || SPREADS[0];
}

export function build(reading, category) {
  const sp = spreadOf(reading.spread);
  const posname = Object.fromEntries(sp.positions.map((p) => [p.key, p.name]));
  const cards = reading.cards || [];
  if (!cards.length) return null;
  const cat = detectCategory(reading.question || '', category);
  const outCards = [];
  const advices = [];
  for (const c of cards) {
    const cid = c.id;
    const rev = !!c.reversed;
    const card = CARD_BY_ID[cid] || {};
    const pos = sp.positions.length > 1 ? (c.position || '') : 'answer';
    // 查固定解牌库（牌名 + 正逆 + 主题 + 牌位；关系牌阵不叠主题）。开发期没写的格不退老表，显示缺失提示并记下
    const libKey = positionKey(sp.id, c.position, reading.question);
    const fromLib = isRelationSpread(sp.id) ? lookupRelation(cid, rev, libKey) : lookup(cid, rev, cat, libKey);
    const text = fromLib || missingNotice({ cardId: cid, cardName: card.name || cid, reversed: rev, theme: isRelationSpread(sp.id) ? null : cat, position: libKey });
    // 固定模式只使用对应牌位的库文案，不再混入旧 CARD_TEXT 的通用建议。
    // 通用建议会跨牌位、跨时间复用，既重复，也可能与当前固定解读冲突。
    const advice = '';
    const intro = sp.positions.length > 1 ? (POSITION_INTRO[c.position || ''] || '') : POSITION_INTRO.answer;
    const suit = suitOf(cid);
    const nature = suit === 'major' ? MAJOR_INTRO
      : `${SUIT_THEME[suit][0]}牌，${SUIT_THEME[suit][1]}元素，讲的是${SUIT_THEME[suit][2]}。`;
    outCards.push({
      id: cid, name: card.name || cid, reversed: rev,
      position: c.position || '', position_name: posname[c.position || ''] || '',
      intro, nature, text, advice, source: fromLib ? 'library' : 'missing',
      keywords: card[rev ? 'keywordsRev' : 'keywordsUp'] || [],
    });
    if (advice) advices.push(advice);
  }
  return {
    category: cat, category_name: CATEGORIES[cat],
    overall: overall(cards, cat),
    cards: outCards,
    relations: relations(cards),
    advice: advices,
    oneline: oneline(cards, cat, reading.question, sp.id),
  };
}

export function render(interp) {
  if (!interp) return '';
  const lines = [`【客观解读 · 按${interp.category_name}】`, interp.overall];
  for (const c of interp.cards) {
    const head = c.position_name && interp.cards.length > 1 ? `〔${c.position_name}〕` : '';
    lines.push(`${head}${c.name}（${c.reversed ? '逆位' : '正位'}）：${c.text}`);
  }
  if (interp.relations.length) lines.push('牌面关系：' + interp.relations.join(' '));
  if (interp.advice.length) lines.push('建议：' + interp.advice.join(' '));
  lines.push('一句话：' + interp.oneline);
  return lines.join('\n');
}

// 「让 X 解牌」要塞给 AI 的那段人话（移植自 tarot.py ask_text，把「陈璟」换成可配置的名字）
export function askText(reading, readerName) {
  const sp = spreadOf(reading.spread);
  const posname = Object.fromEntries(sp.positions.map((p) => [p.key, p.name]));
  const lines = [`🔮 我在占星室抽了一次塔罗（${sp.name}牌阵）。`];
  if (reading.question) lines.push(`问的是：${reading.question}`);
  for (const c of reading.cards) {
    const card = CARD_BY_ID[c.id] || {};
    const rev = !!c.reversed;
    const kws = card[rev ? 'keywordsRev' : 'keywordsUp'] || [];
    const core = card[rev ? 'meaningRev' : 'meaningUp'] || '';
    const head = sp.positions.length > 1 ? `【${posname[c.position] || ''}】` : '';
    lines.push(`${head}${card.name || c.id}（${rev ? '逆位' : '正位'}）｜关键词：${kws.join('、')}｜${core}`);
  }
  const interp = reading.interp || build(reading);
  if (interp) { lines.push(''); lines.push(render(interp)); lines.push(''); }
  lines.push('帮我解一下这次的牌吧，结合我们的事儿说，别只念牌义。上面那段客观解读你参考着看，别照抄。');
  return lines.join('\n');
}

// 聊天卡数据（[TAROT_CARD] 那份 JSON，跟 Alcove 一模一样的格式）
export function cardData(reading, by = 'her') {
  const sp = spreadOf(reading.spread);
  const posname = Object.fromEntries(sp.positions.map((p) => [p.key, p.name]));
  const interp = reading.interp || build(reading);
  return {
    id: reading.id, ts: reading.ts, spread: sp.id, spread_name: sp.name,
    question: reading.question || '',
    cards: reading.cards.map((c) => {
      const card = CARD_BY_ID[c.id] || {};
      return { id: c.id, name: card.name || c.id, reversed: !!c.reversed, position: c.position || '',
        position_name: posname[c.position || ''] || '', keywords: card[c.reversed ? 'keywordsRev' : 'keywordsUp'] || [] };
    }),
    by, interp, text: askText(reading),
  };
}
