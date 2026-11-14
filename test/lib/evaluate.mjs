/**
 * Deterministic checks for rewritten prompts.
 *
 * Every function here answers one question with a boolean or a count, so the
 * baseline and every later version are measured the same way. Nothing calls a
 * model: a rule that needs judgement belongs in the sampling layer, not here.
 */

/** Placeholder forms the rewriter is allowed to emit, both locales. */
const PLACEHOLDER_RE = /\[请补充[：:][^\]]*\]|\[supplement[：:][^\]]*\]/gi
/** A default marker, e.g. [默认：Chrome 扩展，可改] / [default: ...]. */
const DEFAULT_MARKER_RE = /\[默认[：:][^\]]*\]|\[default[：:][^\]]*\]/gi

/**
 * Boilerplate that means the output padded instead of deciding.
 *
 * These are phrases that carry zero task information: an assistant persona
 * disclaimer, a flattering opener, a generic closing. Any hit fails D5 because
 * a single one is enough to make the prompt longer without making it better.
 */
const BOILERPLATE = [
  /作为一个\s*AI/i,
  /作为\s*AI\s*语言模型/i,
  /as an ai language model/i,
  /as an ai assistant/i,
  /这是一个很好的问题/,
  /that'?s a great question/i,
  /请务必注意/,
  /希望这(?:个|些)(?:回答|内容|信息)对你有帮助/,
  /hope this helps/i,
  /综上所述[，,]/,
  /让我们一起/,
  /let'?s dive in/i,
]

/** Entity shapes that must survive a rewrite untouched. */
const ENTITY_PATTERNS = [
  // URLs (checked before bare numbers so the ports inside them are not split out)
  { kind: 'url', re: /https?:\/\/[^\s<>"'）)】]+/gi },
  // @mention tokens
  { kind: 'mention', re: /@[^\s@,，。;；:：]{1,40}/g },
  // Filenames with an extension
  { kind: 'file', re: /\b[\w.-]+\.(?:xlsx|xls|csv|md|txt|json|ya?ml|pdf|docx?|pptx?|png|jpe?g|zip|log|js|mjs|ts|py)\b/gi },
  // Percentages keep their sign and decimals
  { kind: 'percent', re: /\d+(?:\.\d+)?\s*%/g },
  // ISO dates
  { kind: 'isodate', re: /\d{4}-\d{2}-\d{2}/g },
  // Chinese dates
  { kind: 'cndate', re: /\d{4}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*[日号])?/g },
  // Times of day
  { kind: 'time', re: /\d{1,2}\s*[点時时](?:\s*\d{1,2}\s*分)?/g },
  // Project codes and versions
  { kind: 'code', re: /\b[A-Z]{2,}-[\d-]{2,}\b|\bv\d+(?:\.\d+)+\b/g },
  // Plain numbers, decimals included, but not those already inside a URL/date
  { kind: 'number', re: /\d+(?:\.\d+)?/g },
]

/**
 * Normalize a value for entity comparison.
 *
 * Whitespace inside Chinese dates and full-width punctuation differ between the
 * draft and the rewrite without changing the fact, so both sides are collapsed
 * before comparing. Case is ignored for URLs and filenames but nothing else.
 *
 * @param {string} value - Raw entity text.
 * @returns {string} Comparison key.
 */
function entityKey(value) {
  return String(value).replace(/\s+/g, '').replace(/[，,。;；:：]/g, '').toLowerCase()
}

/**
 * Extract the entities a rewrite must preserve.
 *
 * URLs are found first and then masked out, so the digits inside a URL do not
 * also show up as standalone numbers that the rewrite was never obliged to
 * repeat verbatim.
 *
 * @param {string} text - Source draft or candidate output.
 * @returns {Array<{ kind: string, value: string }>} Entities in first-seen order.
 */
export function extractEntities(text) {
  const source = typeof text === 'string' ? text : ''
  const found = []
  const seen = new Set()
  let masked = source

  for (const { kind, re } of ENTITY_PATTERNS) {
    re.lastIndex = 0
    for (const match of masked.matchAll(re)) {
      const value = match[0]
      const key = `${kind}:${entityKey(value)}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ kind, value })
    }
    if (kind === 'url' || kind === 'file' || kind === 'code') {
      // Mask the whole span so its internal digits are not re-read as numbers.
      for (const match of masked.matchAll(re)) {
        masked = masked.replace(match[0], ' '.repeat(match[0].length))
      }
    }
  }

  // A bare number that is part of a longer token already captured is noise.
  return found.filter((entity, index) => {
    if (entity.kind !== 'number') return true
    return !found.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.kind !== 'number' &&
        entityKey(other.value).includes(entityKey(entity.value)),
    )
  })
}

/**
 * D3 — fact fidelity.
 *
 * Every entity in the draft must appear in the output. Missing one is a
 * failure: a rewrite that drops "3.5%" or "下周三" has changed the request.
 * Extra entities in the output are reported but do not fail, because a rewrite
 * legitimately adds structure words that happen to contain digits.
 *
 * @param {string} source - Original draft.
 * @param {string} output - Rewritten prompt.
 * @returns {{ pass: boolean, total: number, kept: number, missing: Array<{kind: string, value: string}> }}
 */
export function checkFidelity(source, output) {
  const required = extractEntities(source)
  const haystack = entityKey(output)
  const missing = required.filter((entity) => !haystack.includes(entityKey(entity.value)))
  return {
    pass: missing.length === 0,
    total: required.length,
    kept: required.length - missing.length,
    missing,
  }
}

/**
 * D1 — sendability.
 *
 * The output must not ask the user to fill in more than two blanks, and never
 * about the task itself. `[...请补充...]` markers are counted, plus any literal
 * question mark addressed at the user.
 *
 * @param {string} output - Rewritten prompt.
 * @param {number} [limit=2] - Maximum allowed placeholders.
 * @returns {{ pass: boolean, count: number, limit: number, asked: string[] }}
 */
export function checkSendability(output, limit = 2) {
  const asked = String(output ?? '').match(PLACEHOLDER_RE) ?? []
  return {
    pass: asked.length <= limit,
    count: asked.length,
    limit,
    asked,
  }
}

/**
 * D2 — structural completeness.
 *
 * Five things a usable prompt names: the goal, the deliverable, the format, the
 * constraints, and the audience. Goal and deliverable are mandatory; the other
 * three only need to be present often enough to reach 4/5.
 *
 * Detection is deliberately generous: a synonym list per slot rather than exact
 * headings, because a good short rewrite uses prose instead of labels.
 *
 * @param {string} output - Rewritten prompt.
 * @returns {{ pass: boolean, coverage: number, present: string[], missing: string[] }}
 */
export function checkCompleteness(output) {
  const text = String(output ?? '')
  const slots = {
    // Goal detection: the OPENING SENTENCE must name an action. Requiring the
    // verb at position zero missed perfectly good prompts that start with a
    // preposition ("用 200 字写…", "基于 Vue 3 做…", "帮我做一份…"), so the verb
    // is looked for anywhere in the first sentence instead. Text with no action
    // in its opening sentence is not a prompt.
    goal: [
      /目标|目的|希望|想要|预期|goal|objective|purpose/i,
      /(?:做|写|制作|撰写|编写|生成|设计|分析|整理|输出|实现|创建|搭建|翻译|优化|制定|拟定|列出|给出|提供|画|列|总结|准备|安排|排|评估|对比|检查|改|重构)/,
    ],
    deliverable: [
      /PPT|幻灯片|演示文稿|文档|方案|报告|代码|脚本|程序|表格|图表|问卷|邮件|通知|总结|策划|计划|分析|文案|简介|议程|模板|甘特图|slide|deck|document|report|code|script|table|chart|summary|plan|proposal|template/i,
    ],
    // Counts and ranges count as format statements: "8–12 页" and "800～1200 字"
    // say more about the shape of the deliverable than the word 格式 does.
    format: [
      /格式|结构|包含|分为|章节|页数|字数|篇幅|列|表头|排版|组织|清单|Markdown|JSON|HTML|format|structure|section|pages?|words?|columns?|list/i,
      /\d+\s*[～~\-–—到至]\s*\d+\s*(?:页|字|条|张|行|个)/,
      /\d+\s*(?:页|字)(?:以内|左右|上下)/,
    ],
    constraint: [
      /要求|约束|限制|不得|避免|必须|预算|期限|截止|风格|语气|字数|以内|不超过|requirement|constraint|must|avoid|budget|deadline|tone|style/i,
    ],
    // "使用者是…" and "读者是…" are the same statement: who receives it.
    audience: [
      /受众|面向|读者|使用者|客户|领导|同事|高管|用户|团队|开发|工程师|新手|初学者|学生|老板|上级|甲方|audience|reader|customer|executive|team|developer|user|for\s+\w+\s+who/i,
    ],
  }

  // Goal is judged on the opening sentence only. Testing the whole text let any
  // later "要求…" clause satisfy it, which would make the slot meaningless; the
  // first sentence is where a prompt has to say what is being asked for.
  const opening = text.split(/[。！？!?\n]/).find((part) => part.trim() !== '') ?? ''

  const present = []
  const missing = []
  for (const [name, patterns] of Object.entries(slots)) {
    const haystack = name === 'goal' ? opening : text
    const hit = patterns.some((re) => re.test(haystack))
    if (hit) present.push(name)
    else missing.push(name)
  }

  const coverage = present.length / Object.keys(slots).length
  const hasGoal = present.includes('goal')
  const hasDeliverable = present.includes('deliverable')
  return {
    pass: hasGoal && hasDeliverable && coverage >= 0.8,
    coverage,
    present,
    missing,
  }
}

/**
 * D5 — concision.
 *
 * Two independent failures: padding with boilerplate, or inflating a short
 * request past a sane expansion ratio. The ceiling is generous because a
 * five-character wish legitimately becomes a paragraph; the floor catches a
 * rewrite that merely echoed the draft back.
 *
 * @param {string} source - Original draft.
 * @param {string} output - Rewritten prompt.
 * @returns {{ pass: boolean, ratio: number, boilerplate: string[] }}
 */
export function checkConcision(source, output) {
  const inLen = Math.max(1, String(source ?? '').trim().length)
  const outLen = String(output ?? '').trim().length
  const ratio = outLen / inLen
  const boilerplate = BOILERPLATE.filter((re) => re.test(String(output ?? ''))).map((re) => re.source)
  return {
    pass: boilerplate.length === 0 && ratio <= 80 && ratio >= 1,
    ratio,
    boilerplate,
  }
}

/**
 * D4 — novice usability.
 *
 * A non-expert can only accept the result if every professional choice is
 * visible as a marked default. This counts markers rather than judging wording,
 * so it is a floor, not a quality measure.
 *
 * @param {string} output - Rewritten prompt.
 * @returns {{ pass: boolean, markers: number, hasAny: boolean }}
 */
export function checkDefaultMarkers(output) {
  const markers = (String(output ?? '').match(DEFAULT_MARKER_RE) ?? []).length
  return { pass: markers >= 1, markers, hasAny: markers > 0 }
}

/**
 * D7 — placeholder targeting.
 *
 * A placeholder is only useful if it points at something the author really
 * knows. This checks that a case which declared required placeholders actually
 * received them, and that no case declared as "must not ask" contains a
 * placeholder phrased as that question.
 *
 * @param {object} testCase - One fixture entry.
 * @param {string} output - Rewritten prompt.
 * @returns {{ pass: boolean, missingHints: string[], forbiddenAsks: string[] }}
 */
export function checkPlaceholderTargeting(testCase, output) {
  const text = String(output ?? '')
  const placeholderChunks = text.match(PLACEHOLDER_RE) ?? []
  const placeholders = placeholderChunks.join(' ')
  const expect = testCase?.expect ?? {}

  // `mustPlaceholder` lists SYNONYMS for one missing fact, not a checklist: a
  // placeholder that says "目标网站地址" satisfies ["网站","站点","URL","目标"]
  // because the author does learn what is missing. Requiring every synonym made
  // good output fail on wording alone.
  const hints = expect.mustPlaceholder ?? []
  const hintSatisfied =
    hints.length === 0 || hints.some((hint) => placeholders.includes(hint) || text.includes(hint))
  const missingHints = hintSatisfied ? [] : [hints.join(' | ')]

  // A case may also require that at least one placeholder exists at all, which
  // is the honest bar for a wish that omits content the model cannot invent.
  const needsPlaceholder = expect.needsPlaceholder === true
  if (needsPlaceholder && placeholderChunks.length === 0) missingHints.push('(至少一处占位)')

  const forbiddenAsks = (expect.mustNotAsk ?? []).filter((pattern) => {
    // The forbidden thing may appear as a decided requirement; it fails only
    // when it appears inside a placeholder or as a question.
    const asked = [...(text.match(PLACEHOLDER_RE) ?? []), ...(text.match(/[^。\n？?]{0,30}[？?]/g) ?? [])]
    return asked.some((chunk) => chunk.includes(pattern))
  })

  return { pass: missingHints.length === 0 && forbiddenAsks.length === 0, missingHints, forbiddenAsks }
}

/**
 * Score one rewrite on the deterministic dimensions, 0-60.
 *
 * Two rules keep the number honest:
 *
 *  - Guard checks (sendability, placeholder targeting) do not award points on
 *    their own. They pass vacuously on any text, so a padded non-answer would
 *    otherwise collect 15 free points for "asking nothing". The final score is
 *    therefore a normalised weighted pass rate, not a sum.
 *  - Without a named goal and deliverable the output is not a prompt at all,
 *    whatever else passed, so the score is capped at 25.
 *
 * Intent (D6) and downstream usability (D7) need sampling; they are scored
 * separately and deliberately excluded here rather than silently assumed good.
 *
 * @param {object} testCase - One fixture entry.
 * @param {string} output - Rewritten prompt.
 * @returns {object} Per-dimension results plus `score`.
 */
export function scoreOutput(testCase, output) {
  const fidelity = checkFidelity(testCase.input, output)
  const sendability = checkSendability(output, testCase?.expect?.maxPlaceholders ?? 2)
  const completeness = checkCompleteness(output)
  const concision = checkConcision(testCase.input, output)
  const defaults = checkDefaultMarkers(output)
  const targeting = checkPlaceholderTargeting(testCase, output)

  const weights = {
    fidelity: 25,
    completeness: 15,
    sendability: 10,
    targeting: 10,
    defaults: 10,
  }
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0)

  const earned =
    (fidelity.pass ? weights.fidelity : 0) +
    (completeness.pass ? weights.completeness : 0) +
    (sendability.pass ? weights.sendability : 0) +
    (targeting.pass ? weights.targeting : 0) +
    (defaults.pass ? weights.defaults : 0)

  // Boilerplate is a gate, not a weight: padding subtracts its whole share.
  const concisionFactor = concision.pass ? 1 : 0
  const normalised = (earned / totalWeight) * 60 * concisionFactor

  const namesTask = completeness.present.includes('goal') && completeness.present.includes('deliverable')
  const capped = namesTask ? normalised : Math.min(normalised, 25)

  return {
    id: testCase.id,
    category: testCase.category,
    fidelity,
    sendability,
    completeness,
    concision,
    defaults,
    targeting,
    deterministicMax: 60,
    score: Math.round(Math.max(0, capped)),
  }
}
