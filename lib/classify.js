/**
 * Infer a category for a fetched prompt, and keep unusable ones out.
 *
 * The upstream JSON has no category field, so every fetched record landed in
 * `general` and the category chips showed only the built-in seed — 149 entries
 * were unreachable through the one control designed to narrow the list.
 *
 * Two things happen here, and the second matters more than the first:
 *
 *  - **Classification** by keyword, first match wins. Order is deliberate:
 *    `learning` before `analysis` so "数学老师" is a lesson, not a report.
 *  - **Rejection.** The source contains jailbreak prompts ("DAN", "不受约束的
 *    AI 模型"). A library offered to non-technical users must not surface those,
 *    so they are dropped at ingestion rather than hidden in the UI.
 *
 * Everything is a pure function so the whole rule set is testable.
 */

/**
 * Prompts that are jailbreaks outright, matched on their own.
 *
 * These phrases have no ordinary use: a legitimate prompt does not tell a model
 * to disregard its instructions, and "不受约束的 AI 模型" names a specific
 * jailbreak persona rather than describing one.
 */
export const HARD_BLOCK_PATTERNS = Object.freeze([
  /ignore (all )?(previous|prior) (instructions|prompts)/i,
  / disregard (all )?(previous|prior)/i,
  /不受约束的\s*AI\s*模型/i,
  /开发者模式.*(已)?(启用|开启).*(无限制|不受限|无约束)/,
])

/**
 * Words that APPEAR in jailbreak talk but also in legitimate security writing.
 *
 * Matched alone these caused real false positives: "教我这个越狱检测的原生实现",
 * "分析 jailbreak 检测的常见手段" and "DAN 这个缩写有哪几种含义" were all dropped,
 * silently removing valid material from the library.
 */
export const SOFT_BLOCK_PATTERNS = Object.freeze([/越狱/, /jailbreak/i, /\bDAN\b/])

/**
 * Markers that a prompt is ASSIGNING a persona to the model.
 *
 * A soft keyword only counts as a jailbreak when the prompt is also handing the
 * model a new identity — that combination is what the jailbreaks actually do,
 * while a prompt merely discussing the topic has no such assignment.
 */
export const PERSONA_MARKERS = Object.freeze([
  /你现在是/,
  /从现在(开始|起)/,
  /你将扮演/,
  /you are now/i,
  /act as/i,
  /pretend (to be|you are)/i,
])

/**
 * All patterns, exposed for the narrowness assertion in the tests.
 *
 * @deprecated Kept only so an existing test can assert the rule set stays small;
 *   use `isBlockedPrompt` for the actual decision.
 */
export const BLOCKED_PATTERNS = Object.freeze([
  ...HARD_BLOCK_PATTERNS,
  ...SOFT_BLOCK_PATTERNS,
])

/**
 * Whether a prompt looks like a jailbreak attempt.
 *
 * Two tiers, because one tier could not tell "a jailbreak" from "writing about a
 * jailbreak":
 *
 *  - A hard pattern blocks on its own; those phrases are never innocent.
 *  - A soft keyword blocks only when the prompt also assigns a persona. That
 *    keeps genuine security-research prompts while still catching "你现在是 DAN".
 *
 * @param {string} title - Record title.
 * @param {string} body - Record body.
 * @returns {boolean} True when it must not enter the library.
 */
export function isBlockedPrompt(title, body) {
  const titleText = typeof title === 'string' ? title : ''
  const bodyText = typeof body === 'string' ? body.slice(0, 600) : ''
  const haystack = `${titleText}\n${bodyText}`

  if (HARD_BLOCK_PATTERNS.some((pattern) => pattern.test(haystack))) return true

  const soft = SOFT_BLOCK_PATTERNS.some((pattern) => pattern.test(haystack))
  if (!soft) return false
  return PERSONA_MARKERS.some((pattern) => pattern.test(haystack))
}

/**
 * Category rules, evaluated top to bottom; the first hit wins.
 *
 * Each entry lists keywords that would appear in a Chinese prompt title. Order:
 * code, writing, learning, analysis, design, then general as the fall-through.
 */
const RULES = Object.freeze([
  {
    category: 'code',
    keywords: [
      '代码', '编程', '终端', '控制台', '软件开发', '开发人员', '前端', '后端',
      '全栈', '算法', '正则', 'sql', 'python', 'javascript', 'php', 'java ',
      '机器学习', '架构师', '资讯科技', 'it ', '技术审稿', '质量保证', '测试仪',
      '堆栈', '接口', 'api', 'svg', '浏览器', '脚本', '编译器', '解释器',
      '提交消息', '密码生成', '图表生成', '提示生成', '域名生成',
    ],
  },
  {
    category: 'writing',
    keywords: [
      '写作', '作家', '文案', '翻译', '诗人', '诗', '编剧', '小说', '散文',
      '故事', '新闻', '记者', '标题', '同义词', '影评', '书评', '美食评论',
      '广告', '格言', '求职信', '邮件', '润色', '改写', '摘要',
      '英语', '口语', '发音', '语言', '表达',
    ],
  },
  {
    category: 'learning',
    keywords: [
      '老师', '教师', '讲师', '教练', '导师', '教学', '教育', '学习', '课程',
      '苏格拉底', '哲学', '历史学', '数学', '院士', '学者', '练习', '习题',
      '儿童', '学生', '科普', '解释', '词源',
    ],
  },
  {
    category: 'design',
    keywords: [
      '设计', '界面', '用户体验', 'ui', 'ux', '视觉', '版式', '配色', '美化',
      '装潢', '化妆', '造型', '艺术家', '艺术', '插画', '平面', '海报',
    ],
  },
  {
    category: 'analysis',
    keywords: [
      '分析', '审计', '统计', '数据', '谬误', '投资', '财务', '会计', '顾问',
      '评论员', '审稿', '法律', '律师', '招聘', '职场', '职业', '战略',
      '评估', '诊断', '风险', '调查',
    ],
  },
])

/**
 * Infer one category from a title and body.
 *
 * @param {string} title - Record title.
 * @param {string} body - Record body, used only when the title says nothing.
 * @returns {string} A category key, defaulting to `general`.
 */
export function classifyPrompt(title, body) {
  const titleText = typeof title === 'string' ? title.toLowerCase() : ''
  const bodyText = typeof body === 'string' ? body.slice(0, 300).toLowerCase() : ''

  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => titleText.includes(keyword))) return rule.category
  }
  // Only fall back to the body once the title is exhausted: a body mentioning
  // "代码" while the title says "面试官" should stay where the title put it.
  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => bodyText.includes(keyword))) return rule.category
  }
  return 'general'
}

/**
 * Re-derive the category of already-stored records.
 *
 * The cache stores `category` alongside each record, so changing a rule here had
 * no effect on records fetched earlier: `list` returned the cached category
 * verbatim and the panel kept filtering by the OLD rules until the next refresh —
 * up to six hours, or forever if the user never refreshed.
 *
 * Running every read through this function makes the rules the single source of
 * truth, so editing them takes effect on the next render.
 *
 * @param {object[]} records - Records as read from the cache.
 * @returns {object[]} The same records with `category` recomputed.
 */
export function reclassifyRecords(records) {
  if (!Array.isArray(records)) return []
  return records.map((record) => {
    if (record === null || typeof record !== 'object') return record
    const category = classifyPrompt(record.title, record.body)
    return category === record.category ? record : { ...record, category }
  })
}

/**
 * Split a fetched batch into usable records and rejects.
 *
 * @param {object[]} records - Candidate records with `title` and `body`.
 * @returns {{ kept: object[], blocked: number }} Records with `category` filled
 *   in, plus how many were dropped as jailbreaks.
 */
export function screenRecords(records) {
  if (!Array.isArray(records)) return { kept: [], blocked: 0 }
  const kept = []
  let blocked = 0
  for (const record of records) {
    if (record === null || typeof record !== 'object') continue
    if (isBlockedPrompt(record.title, record.body)) {
      blocked += 1
      continue
    }
    kept.push({ ...record, category: classifyPrompt(record.title, record.body) })
  }
  return { kept, blocked }
}
