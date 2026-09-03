# 固定解牌库

按「牌名 + 正逆位 + 主题 + 牌位」读一段。一共 4524 格，空字符串 = 还没写；没写的格页面会自动退回老表（`js/data/text.js`，按主题一段 + 按牌位换时态），所以可以一格一格慢慢填，填一格生效一格。

## 普通牌位（3744 格）

文件：`normal/majors.json`、`normal/wands.json`、`normal/cups.json`、`normal/swords.json`、`normal/pents.json`（一个花色一个文件，大牌单独一个）。

```
{
  "major_00": {
    "_name": "愚人",                ← 只是给人看的，程序不读
    "up":  { "daily": { "single": "", "daily": "", "weekly": "", "past": "", "present": "", "future": "" },
             "love":  { ...同上六个牌位... },
             "work":  { ... },
             "self":  { ... } },
    "rev": { ...跟 up 一样... }
  },
  ...
}
```

- 正逆位：`up` 正位 / `rev` 逆位
- 主题：`daily` 日常 / `love` 感情 / `work` 事业 / `self` 自我
- 牌位：`single` 单张 / `daily` 每日运势 / `weekly` 每周运势 / `past` 过去 / `present` 现在 / `future` 未来

78 × 2 × 4 × 6 = 3744。

## 关系牌阵（780 格）

文件：`relation.json`。关系牌阵不叠主题，只按牌位。

```
{
  "major_00": {
    "_name": "愚人",
    "up":  { "me": "", "him": "", "between": "", "block": "", "toward": "" },
    "rev": { "me": "", "him": "", "between": "", "block": "", "toward": "" }
  },
  ...
}
```

- 牌位：`me` 我 / `him` 他 / `between` 我们之间 / `block` 阻碍 / `toward` 走向

78 × 2 × 5 = 780。

## 牌阵怎么对到牌位

- 单张牌阵：问题是「每日一牌」→ `daily`；别的问题 → `single`
- 三张牌阵：`past` / `present` / `future`
- 本周牌阵：三张（主轴 / 行动 / 提醒）目前都读 `weekly`
- 关系牌阵：`me` / `him` / `between` / `block` / `toward`

主题由问题里的词猜（`js/reading.js` 的 `detectCategory`），结果页也能手动切。

## 工具

```
node cli/library.mjs stats      填了多少格
node cli/library.mjs check      查结构（牌 id、键名、类型、放错文件）
node cli/library.mjs todo 50    列 50 个还没写的格
```

## 写文案的约定

- 一格一段，两到四句，说这张牌在这个牌位、这个主题下的意思，别复述牌名。
- 牌位的时态要对：过去位说已经发生的，现在位说眼下，未来位说趋势；每日说今天，每周说这周。
- 主题词不要越界：感情格不谈工作，事业格不谈恋爱。
- 不认识提问者，不猜背景，不鸡汤。
- 改完跑一遍 `check`，JSON 写坏了页面会整段退回老表。
