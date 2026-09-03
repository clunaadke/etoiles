// 客观解读：不认识提问者、只看牌的那份。全是查表拼的，不花钱、秒出、永远一样。
// 一比一移植自 Alcove 后端 tarot_reading.py（2026-09-03）。表在 data/text.js，框架在这里。
//
//   build(reading, category?) -> interp   给页面画分段
//   render(interp) -> string              给 AI / 人读的纯文本
//   detectCategory(question, explicit?)   问题分类

import { CARD_BY_ID, SPREADS } from './data/deck.js';
import { CARD_TEXT } from './data/text.js';
import { lookup, lookupRelation, positionKey, isRelationSpread } from './library.js';

export const CATEGORIES = { love: '感情', work: '事业', self: '自我', daily: '日常' };

const LOVE = /他|她|喜欢|爱|恋|关系|在一起|分手|暧昧|想我|吵架|表白|复合|老公|老婆|男朋友|女朋友|伴侣|婚|我们|我俩|两个人|感情|对象|想念|见面|亲/;
const WORK = /工作|事业|项目|老板|同事|考试|学习|钱|收入|面试|上线|升职|离职|生意|投资|赚|合作|作业|论文|课/;
const SELF = /我自己|状态|情绪|焦虑|该不该|内心|性格|在想什么|迷茫|坚持|放弃|改变|选择|决定|方向|我是/;

export const DAILY_QUESTION = '每日一牌';
export const WEEKLY_QUESTION = '本周运势';

export function detectCategory(question, explicit) {
  if (explicit && explicit in CATEGORIES) return explicit;
  const q = (question || '').trim();
  if (!q || q === DAILY_QUESTION || q === WEEKLY_QUESTION) return 'daily';
  if (LOVE.test(q)) return 'love';
  if (WORK.test(q)) return 'work';
  if (SELF.test(q)) return 'self';
  return 'daily';
}

// 牌位前缀：这张牌落在这个位置上，先说这个位置在问什么
export const POSITION_INTRO = {
  answer: '单张牌阵，这张牌就是对问题最直接的回应，不分过去未来，说的是当下这件事的核心。',
  past: '过去位说的是这件事的来处：已经发生、已经定型、还在往现在施加影响的那部分。',
  present: '现在位说的是此刻的局面：正在起作用的力量，也是最能着手改变的地方。',
  future: '未来位说的是照现在的走法会去到哪里。它不是判决，是趋势，改了现在就改了它。',
  axis: '本周主轴是这一周的底色，其他事都会被它染上颜色。',
  action: '行动建议位说的是这周该主动做的那件事，是动作，不是心情。',
  gentle: '温柔提醒位说的是容易被忽略的那一点，通常是该放松而不是该用力的地方。',
  me: '「我」位是提问者自己在这段关系里的状态和姿态，不是对方眼里的你，是牌看见的你。',
  him: '「他」位是对方此刻的状态和态度。牌只描述他的位置，不替他表态。',
  between: '「我们之间」说的是两个人中间那股力：关系本身的质地，不属于任何一方。',
  block: '「阻碍」位点出卡住这件事的东西。逆位在这里反而常常说明阻力正在松。',
  toward: '「走向」是这段关系照现在的样子往前走的方向，是趋势，不是结局。',
};

const SUIT_THEME = {
  wands: ['权杖', '火', '行动、热情、意志'],
  cups: ['圣杯', '水', '情感、关系、直觉'],
  swords: ['宝剑', '风', '思考、冲突、真相'],
  pents: ['星币', '土', '现实、身体、金钱'],
};
const MAJOR_INTRO = '大阿卡那说的是人生层面的大课题，不是日常小事，也不太由个人意志左右。';
const CLASH = new Set(['fire|water', 'water|fire', 'air|earth', 'earth|air']);
const ELEMENT = { wands: 'fire', cups: 'water', swords: 'air', pents: 'earth' };

function entry(cid, rev, cat) {
  const e = CARD_TEXT[cid] || {};
  const side = e[rev ? 'rev' : 'up'] || {};
  return [side[cat] || side.daily || '', side.advice || ''];
}

// 时态（0903 她抓的：日常那套文案全是「今天……」，落在过去 / 未来 / 本周 / 关系位上就不对）。
// 表里的话按「今天」写，这里按牌位把「今天」换成对的时间词；过去位的建议不给（对过去提建议没意义）。
const SCOPE = {
  past: '之前', present: '眼下', future: '接下来',
  axis: '这周', action: '这周', gentle: '这周',
  me: '这段时间', him: '这段时间', between: '这段时间', block: '这段时间', toward: '接下来',
};
const PAST_VERBS = [['会好', '好过'], ['会来', '来过'], ['会发', '发过'], ['会乱', '乱过'], ['会比', '比'], ['会更', '更'], ['会很', '很'], ['会到', '到了'], ['会轻', '轻了'], ['会软', '软了'], ['会被', '被'], ['会觉', '觉得'], ['会踏', '踏'], ['会因', '因']];
export function tense(text, position, question) {
  if (!text) return text;
  const isDaily = !question || question === DAILY_QUESTION;
  if (position === 'answer' || !position) {
    if (isDaily) return text;                      // 每日一牌：就是说今天
    return text.replace(/今天|今日/g, '眼下').replace(/明天/g, '过两天').replace(/昨天/g, '之前');
  }
  const scope = SCOPE[position] || '这段时间';
  let t = text.replace(/今天|今日/g, scope);
  if (position === 'past') {
    t = t.replace(/明天/g, '后来').replace(/昨天/g, '更早').replace(/适合/g, '一直在').replace(/会有/g, '有过');
    for (const [a, b] of PAST_VERBS) t = t.split(a).join(b);   // 「会好」→「好过」这类，过去位不说将来话
  } else if (position === 'future' || position === 'toward') {
    t = t.replace(/明天/g, '再往后').replace(/昨天/g, '现在');
  } else {
    t = t.replace(/明天/g, '过两天').replace(/昨天/g, '之前');
  }
  return t;
}
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
    notes.push('全是大阿卡那。这件事的分量比问题本身重，走向多半不在提问者手里，能做的是认清阶段、别硬拧。');
  } else if (majors.length >= Math.max(2, Math.floor(n / 2) + 1)) {
    notes.push(`${n} 张里 ${majors.length} 张大阿卡那，说明这不是琐事，是一段会留下痕迹的经历，小牌只是它的细节。`);
  } else if (!majors.length) {
    notes.push('没有大阿卡那，全是小牌：这件事在日常尺度上，靠具体的动作和态度就能推动，不用等命运表态。');
  }

  const suitKeys = Object.keys(suits);
  if (suitKeys.length) {
    let top = suitKeys[0];
    for (const k of suitKeys) if (suits[k] > suits[top]) top = k;
    if (suits[top] >= 2 && suits[top] >= Math.floor(n / 2)) {
      const [zh, el, theme] = SUIT_THEME[top];
      notes.push(`${zh}压阵（${suits[top]} 张）。${el}元素说的是${theme}，这件事的重心在这里，别在别的层面找答案。`);
    }
    const elems = suitKeys.map((s) => ELEMENT[s]);
    let clash = false;
    for (const a of elems) for (const b of elems) if (a !== b && CLASH.has(a + '|' + b)) clash = true;
    if (clash) notes.push('牌里同时有相克的元素，说明这件事里有两股拧着的力：一边想动、一边想稳，或者一边讲理、一边讲情。冲突本身就是主题。');
  }

  if (revs.length === n && n >= 2) {
    notes.push('全部逆位。不是全坏，是每一股力量都在往内收、往回走，这段时间适合停、适合收拾，不适合推。');
  } else if (revs.length >= Math.floor((n + 1) / 2) + (n >= 4 ? 1 : 0)) {
    notes.push(`逆位占了 ${revs.length} 张，阻力比推力多，很多事会比预想的慢，慢是正常的。`);
  } else if (!revs.length) {
    notes.push('全部正位，能量顺着走，牌说的事大体会照它本来的样子发生，少折腾就是最好的策略。');
  }

  if (courts.length >= 2) {
    notes.push(`出了 ${courts.length} 张宫廷牌，这件事里「人」的因素很重：不是事情本身难，是几个人的立场和脾气在起作用。`);
  }

  const nums = cards.filter((c) => suitOf(c.id) !== 'major' && numOf(c.id) >= 1 && numOf(c.id) <= 10).map((c) => numOf(c.id));
  const REPEAT = {
    1: '重复出现的一：好几件事同时在起头。', 2: '重复的二：处处都在二选一或两两配对。',
    3: '重复的三：事情正在长出第一批结果。', 4: '重复的四：多处停滞，求稳过了头。',
    5: '重复的五：多处摩擦和损失，是过渡期的样子。', 6: '重复的六：多处在修复、在回望。',
    7: '重复的七：多处在评估、在守。', 8: '重复的八：多处在赶工、在挣脱。',
    9: '重复的九：多处接近完成，也接近临界点。', 10: '重复的十：多处到头了，该收尾。',
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
        ? '这是一张大牌，说明问的事比表面上重，答案在阶段和方向上，不在细节上。'
        : '这是一张小牌，答案落在具体的日常动作上，做得到、也看得见。');
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
  const [raw] = entry(key.id, key.reversed, category);
  const text = fromLib || tense(raw, cards.length > 1 ? key.position : 'answer', question);
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
    const [rawText, rawAdvice] = entry(cid, rev, cat);
    const pos = sp.positions.length > 1 ? (c.position || '') : 'answer';
    // 先查固定解牌库（牌名 + 正逆 + 主题 + 牌位；关系牌阵不叠主题），那格没写再退老表 + 时态替换
    const libKey = positionKey(sp.id, c.position, reading.question);
    const fromLib = isRelationSpread(sp.id) ? lookupRelation(cid, rev, libKey) : lookup(cid, rev, cat, libKey);
    const text = fromLib || tense(rawText, pos, reading.question);
    const advice = pos === 'past' ? '' : tense(rawAdvice, pos, reading.question);
    const intro = sp.positions.length > 1 ? (POSITION_INTRO[c.position || ''] || '') : POSITION_INTRO.answer;
    const suit = suitOf(cid);
    const nature = suit === 'major' ? MAJOR_INTRO
      : `${SUIT_THEME[suit][0]}牌，${SUIT_THEME[suit][1]}元素，讲的是${SUIT_THEME[suit][2]}。`;
    outCards.push({
      id: cid, name: card.name || cid, reversed: rev,
      position: c.position || '', position_name: posname[c.position || ''] || '',
      intro, nature, text, advice, source: fromLib ? 'library' : 'fallback',
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
