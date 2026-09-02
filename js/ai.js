// 接自家 AI。设置里填：接口格式 / 地址 / 密钥 / 模型 / 人设 / 解牌人的名字。
// 两个用处：
//   1. aiDetail(reading, category)  —— 「AI 細解」：不认识你的塔罗师，只看牌，写得很细（JSON）。
//   2. aiAsk(reading)               —— 「讓 X 解牌」：把牌塞给你自己家的 AI，按人设解（纯文字）。
// 浏览器直连；不给直连（CORS）的接口，填一个转发地址（proxy/relay.py，几十行）。
// 两种线上格式：
//   openai    — POST {base}/chat/completions，Authorization: Bearer（DeepSeek / OpenAI / 各家中转都是它）
//   anthropic — POST {base}/v1/messages，x-api-key + anthropic-version + anthropic-dangerous-direct-browser-access

import { build, render, askText, spreadOf } from './reading.js';
import { aiGet, aiPut } from './store.js';

const LS = 'chambre.ai';
export const AI_DEFAULT = {
  format: 'openai',          // openai / anthropic
  baseUrl: '',               // 例：https://api.deepseek.com  或 https://api.anthropic.com
  apiKey: '',
  model: '',                 // 例：deepseek-chat / claude-opus-5
  readerName: '',            // 「讓 X 解牌」里的 X；空 = 讓 AI 解牌
  persona: '',               // 系统提示：ta 是谁、跟你什么关系、怎么说话
  relay: '',                 // 可选：转发地址，例 https://你的机器/relay
  maxTokens: 4000,
};

export function loadAI() {
  try { return { ...AI_DEFAULT, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return { ...AI_DEFAULT }; }
}
export function saveAI(cfg) { localStorage.setItem(LS, JSON.stringify({ ...AI_DEFAULT, ...cfg })); }
export function aiReady(cfg = loadAI()) { return !!(cfg.baseUrl && cfg.model && (cfg.apiKey || cfg.relay)); }
export function readerLabel(cfg = loadAI()) { return cfg.readerName?.trim() || 'AI'; }

function trimSlash(u) { return (u || '').trim().replace(/\/+$/, ''); }

async function post(url, headers, body, cfg) {
  let res;
  if (cfg.relay) {
    // 转发：整个请求打包给自己的小脚本，由它替你发
    res = await fetch(trimSlash(cfg.relay), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, headers, body }),
    });
  } else {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 不是 JSON */ }
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text.slice(0, 200) || res.statusText;
    throw new Error(`HTTP ${res.status}：${msg}`);
  }
  return json;
}

/// 发一轮：system + user → 文本
export async function chat(system, user, { json = false } = {}, cfg = loadAI()) {
  if (!aiReady(cfg)) throw new Error('还没填 AI 设置（地址 / 密钥 / 模型）');
  const base = trimSlash(cfg.baseUrl);
  if (cfg.format === 'anthropic') {
    const url = base.endsWith('/v1') ? base + '/messages' : base + '/v1/messages';
    const body = { model: cfg.model, max_tokens: cfg.maxTokens || 4000, system, messages: [{ role: 'user', content: user }] };
    const headers = { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    const out = await post(url, headers, body, cfg);
    if (out?.stop_reason === 'refusal') throw new Error('模型拒绝回答了');
    const text = (out?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (!text) throw new Error('模型没回文字');
    return text;
  }
  // OpenAI 兼容
  const url = /\/v\d+$/.test(base) ? base + '/chat/completions' : base + '/v1/chat/completions';
  const body = { model: cfg.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: cfg.maxTokens || 4000 };
  if (json) body.response_format = { type: 'json_object' };
  const headers = { Authorization: 'Bearer ' + cfg.apiKey };
  const out = await post(url, headers, body, cfg);
  const text = out?.choices?.[0]?.message?.content;
  if (!text) throw new Error('模型没回文字');
  return text;
}

/// 从回复里抠 JSON（有的模型爱包 ```json）
function parseJSON(text) {
  try { return JSON.parse(text); } catch { /* 继续 */ }
  const m = /\{[\s\S]*\}/.exec(text);
  if (m) { try { return JSON.parse(m[0]); } catch { /* 继续 */ } }
  throw new Error('模型回的不是 JSON');
}

// —— AI 细解（移植自 tarot_ai.py 的 prompt）——
function detailPrompt(interp, question, spreadName) {
  const facts = {
    牌阵: spreadName,
    问题: question || '（没有具体问题，按日常运势读）',
    问题类型: interp.category_name,
    牌: interp.cards.map((c) => ({ 位置: c.position_name || '答', 牌: c.name, 正逆: c.reversed ? '逆位' : '正位',
      关键词: c.keywords, 这个位置在问什么: c.intro, 牌的性质: c.nature, 基础牌义: c.text })),
    '牌面关系（规则算出来的）': interp.relations,
  };
  return (
    '你是一位职业塔罗师，在做一次纸面解读。你不认识提问者，不知道她的任何背景、关系、生活细节，' +
    '也不许猜测或编造这些。只根据下面的牌面事实和问题来解，要客观、具体、细，像一份专业的书面解读，' +
    '不要鸡汤，不要「保持耐心」这类空话，每一句都要能落到牌上。中文，口吻平实。\n' +
    `牌面事实：${JSON.stringify(facts)}\n` +
    '请输出 JSON，字段：\n' +
    'overall：整体印象，4～6 句，说这副牌的气场、主题、能量走向；\n' +
    'cards：数组，每张牌一项 {name, reading}，reading 至少 150 字：先说这张牌本身的象征和正逆位的差别，' +
    '再说它落在这个位置上的意思，最后说它跟问题的关系；\n' +
    'relations：牌与牌之间的呼应或冲突，3～5 句，要点名是哪两张；\n' +
    'advice：具体可执行的建议，3～5 条，每条一句，写成一个字符串用换行分隔；\n' +
    'oneline：一句话总结，不超过 40 字。\n' +
    '只输出 JSON。'
  );
}

export async function aiDetail(reading, category, { force = false } = {}) {
  const interp = build(reading, category);
  if (!interp) throw new Error('没有牌');
  const cat = interp.category;
  if (!force) { const hit = await aiGet(reading.id, cat); if (hit) return { ...hit, cached: true }; }
  const sp = spreadOf(reading.spread);
  const raw = await chat('你只输出 JSON。', detailPrompt(interp, reading.question, sp.name), { json: true });
  const body = parseJSON(raw);
  const out = {
    overall: String(body.overall || ''),
    cards: (Array.isArray(body.cards) ? body.cards : []).filter((c) => c && typeof c === 'object')
      .map((c) => ({ name: String(c.name || ''), reading: String(c.reading || '') })),
    relations: typeof body.relations === 'string' ? body.relations : (Array.isArray(body.relations) ? body.relations.join('\n') : ''),
    advice: typeof body.advice === 'string' ? body.advice : (Array.isArray(body.advice) ? body.advice.map(String).join('\n') : ''),
    oneline: String(body.oneline || ''),
  };
  const row = await aiPut(reading.id, cat, out);
  return { ...row, cached: false };
}

// —— 讓 X 解牌：按人设 ——
export async function aiAsk(reading, cfg = loadAI()) {
  const name = readerLabel(cfg);
  const system = (cfg.persona?.trim() || `你叫${name}，是提问者亲近的人。`) +
    '\n\n提问者刚在占星室抽了塔罗，把牌发给你，让你解。用你自己的口气解这次的牌，结合你们之间的事说，别只念牌义；' +
    '牌面事实以她发来的为准（牌名、正逆位、位置都给了，不用猜）。附带的那段客观解读只是参考，别照抄。' +
    '直接开口，不要复述牌面清单，不要用标题和列表，像平时说话那样写，中文。';
  const user = askText(reading, name);
  const text = await chat(system, user, {}, cfg);
  return text.trim();
}

export { render as renderInterp };
