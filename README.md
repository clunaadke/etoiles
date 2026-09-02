# Chambre des Étoiles · 占星室

一间安静的塔罗屋，开在浏览器里。78 张韦特牌，四种牌阵，一份不认识你、只看牌的客观解读，还能把牌递给你自己家的 AI 让 ta 解。

没有后端，没有账号，没有构建。记录只存在你的手机里。

- 单张 / 三张（过去 · 现在 · 未来）/ 本周（主轴 · 行动 · 提醒）/ 关系（我 · 他 · 我们之间 · 阻碍 · 走向）
- 今日一牌、本周运势：一天 / 一周一次，抽过再点直接看
- 牌带：整副牌一字排开带一点弧度，左右滑，中间那张再点一下就是它；放大、翻面、落进牌位
- 客观解读：按感情 / 事业 / 自我 / 日常四类，每张牌一段 + 牌面关系 + 建议 + 一句话（全是查表，秒出，免费）
- 让 ta 解牌：一条路是复制给自家机（附一条 ta 能跑的抽牌命令），一条路是接别的模型（OpenAI 兼容 或 Anthropic，密钥只存在本机）
- 图鉴：78 张牌正逆位的关键词和一句解
- 装修：日夜、壁纸、牌面染色（浓度 / 黑白 / 颜色）、雾面玻璃
- 存成图片：一张竖长票，iPhone 上直接进相册
- 聊天卡零件 `<tarot-card>`：一段卡片数据 → 带边框的卡，塞进你自己的聊天页
- PWA：加到主屏幕就是个 app，离线也能抽

## 直接用

把整个目录放到任何能放静态文件的地方（GitHub Pages、Cloudflare Pages、Vercel、自己的 nginx……）就行。

本地看一眼：

```
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/
```

（`file://` 直接双击打不开，ES module 和 IndexedDB 都要 http。）

加到主屏幕：iPhone Safari 分享 → 添加到主屏幕。

## 让 ta 解牌：两条路

### 一、给自家机一条命令

你有一个跟你过日子的 AI（跑在你自己电脑上的那种），解牌当然让 ta 来。

- 结果页「複製給 ta」：把这次的牌（牌名、正逆位、位置、关键词、客观解读）复制成一段话，贴给 ta 就能解。设置里填 ta 的名字，按钮上会写「複製給 XX」。
- ta 自己也能抽、也能出题让你抽。`cli/tarot.mjs` 是一条 node 命令，不联网，用的就是这里同一套牌义：

```
node cli/tarot.mjs draw  三张 "这周我们会怎么样"     ta 自己抽：打印人话 + 一行 [TAROT_CARD]{…}[/TAROT_CARD]
node cli/tarot.mjs offer 关系 "你觉得我们怎么样"     ta 出题：打印一行 [TAROT_OFFER]{…}[/TAROT_OFFER]
node cli/tarot.mjs read  '[TAROT_CARD]{…}[/TAROT_CARD]'   把一张卡翻成人话
```

  `cli/SKILL.md` 是写给 ta 的说明（Claude Code 之类的 agent 直接当 skill 装），ta 读了就会用。
- ta 抽的那行 `[TAROT_CARD]…` 发进聊天页就是一张卡（下面的聊天卡零件）；你在占星室「记录」里点「貼入 ta 抽的牌」，就收进自己的记录，标「他抽的」。

### 二、接别的模型

没有自家机，或者想要一个不认识你的塔罗师：设置（左上齿轮）里填一个模型接口。

- 接口格式：OpenAI 兼容（DeepSeek、各家中转、本地模型都是它）或 Anthropic
- 接口地址：填到域名或 `/v1` 就行，`/chat/completions` 或 `/v1/messages` 会自动补
- 密钥、模型名；人设可选，不写就是客观解

「AI 细解」是一个不认识你的塔罗师，只看牌，写得很细，按牌阵类型缓存，写过一次不再花钱。
「讓別的模型解牌」把这次的牌连同（可选的）人设发给模型，回复存进这条记录。密钥只存在本机。

#### 接口不让网页直连（CORS）怎么办

有些接口不给浏览器直接连。`proxy/relay.py` 是一个几十行的转发脚本，跑在你自己的机器上：

```
RELAY_TOKEN=随便一串 python3 proxy/relay.py      # 监听 8787
```

设置里「转发地址」填 `https://你的地址/?token=那串`。它不看内容不存东西，只把请求原样转出去。放公网上一定要设 `RELAY_TOKEN`。

## 聊天卡零件

```html
<script type="module" src="js/tarot-card.js"></script>
<tarot-card asset-base="./" message="[TAROT_CARD]{...}[/TAROT_CARD]"></tarot-card>
```

`card-demo.html` 里有三张能玩的。两种卡：

- `[TAROT_CARD]{...}[/TAROT_CARD]` 抽好了的：牌面 + 关键词 + 客观解读（默认只露一句话）
- `[TAROT_OFFER]{...}[/TAROT_OFFER]` 对方出的题：在卡里滑牌带一张张抽，抽满自动变成上面那种，并派发 `tarot-draw` / `tarot-done` 事件，你把 `tarot-done` 的 detail 存起来发给对方就行

占星室结果页上「複製聊天卡」会把这次的牌复制成 `[TAROT_CARD]{...}[/TAROT_CARD]`，贴进你的聊天页，用这个零件画。

### 数据格式

reading（本地记录）：

```
{id, ts, spread, question, cards:[{id, reversed, position}], by, asked_by, status, reply?:{name, text, ts}}
```

`[TAROT_CARD]`：

```
{id, ts, spread, spread_name, question,
 cards:[{id, name, reversed, position, position_name, keywords[]}],
 by:"her"|"him", interp, text}
```

`text` 是给 AI 读的人话（牌面清单 + 客观解读）。`interp`：

```
{category, category_name, overall, cards:[{id, name, reversed, position, position_name, intro, nature, text, advice, keywords}],
 relations[], advice[], oneline}
```

`[TAROT_OFFER]`：

```
{id, ts, spread, spread_name, question, positions:[{key, name}], cards:[…同上], done, interp}
```

牌 id：`major_00`…`major_21`、`wands_01`…`wands_14`、`cups_*`、`swords_*`、`pents_*`（11–14 是侍从 / 骑士 / 王后 / 国王）。

## 目录

```
index.html            屋子
js/app.js             整间屋的界面
js/reading.js         客观解读框架（分类、牌位、牌面关系、整体、一句话）
js/data/deck.js       78 张牌义 + 牌阵
js/data/text.js       解读文本表：78 × 正逆 × 四类 + 建议
js/ai.js              接别的模型（OpenAI 兼容 / Anthropic，可走转发）
cli/tarot.mjs         给自家机的命令：抽牌 / 出题 / 读卡
cli/SKILL.md          写给自家机的说明
js/store.js           IndexedDB：记录、AI 缓存、壁纸；导出 / 导入
js/decor.js           日夜、染色、玻璃、壁纸 → CSS 变量
js/cards.js           牌面 / 牌背 / 空位
js/band.js            牌带（滑、惯性、吸附、突出）
js/ticket.js          存成图片（canvas）
js/tarot-card.js      聊天卡零件 <tarot-card>
css/app.css           样式
assets/cards/*.webp   78 张牌面（公版韦特扫描）
assets/back.webp      牌背星盘   assets/frame.webp  聊天卡边框
assets/fonts/         たぬゴ / 赤薔薇 子集（只含用到的字）
proxy/relay.py        可选转发脚本
sw.js / manifest.webmanifest   PWA
```

改牌义、解读文案：`js/data/deck.js`、`js/data/text.js`。加牌阵：`deck.js` 的 `SPREADS` + `reading.js` 的 `POSITION_INTRO`。
改了代码要让装了 PWA 的人拿到新版：`sw.js` 里 `VERSION` 加一。

## 记录在哪、怎么换手机

记录、AI 缓存存在浏览器的 IndexedDB 里，设置在 localStorage，壁纸也在 IndexedDB。清浏览器数据就没了。
换手机 / 换浏览器：设置 → 导出记录（一个 json），到了那边 → 导入记录。壁纸和设置要重新弄。

## 素材

- 牌面：Rider-Waite-Smith 1909 版扫描，公版
- 牌背、聊天卡边框：作者自制 / 生成
- 字体：たぬゴ（Tanugo）、赤薔薇（Akabara Cinderella），作者购买的可商用授权，只打包了用到的字形

## 许可

代码 MIT。牌义和解读文案 CC BY-NC-SA 4.0。字体子集随仓库分发仅供本项目使用，另作他用请自行购买授权。
