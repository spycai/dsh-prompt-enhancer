/**
 * Placeholder extraction and filling.
 *
 * Generated prompts deliberately carry two kinds of annotation: `[请补充：…]` for
 * facts only the author knows, and `[默认：…, 可改]` for assumptions the model
 * made. Both are useful in the text, but the first kind is a **task left for the
 * reader** — until now the only way to fill it was to copy the prompt somewhere
 * and hunt for the brackets by hand.
 *
 * This module turns those brackets into a form. `[请补充：X]` becomes a labelled
 * input; `[默认：…]` stays in the text untouched, because it is information
 * rather than a blank.
 */

/**
 * Matches `[请补充：…]`. The colon may be full-width or half-width, and the
 * label is whatever sits between it and the closing bracket.
 *
 * Kept tolerant because the model writes these itself; a strict pattern would
 * silently miss a real placeholder and leave the user hunting again.
 */
const PLACEHOLDER_PATTERN = /\[请补充[：:]\s*([^\]\n]{1,60})\]/g

/** Matches a default marker, so it can be left alone deliberately. */
const DEFAULT_PATTERN = /\[默认[：:][^\]]{0,200}\]/g

/**
 * Extract the fill-in-the-blank placeholders from a prompt.
 *
 * Identical labels are merged: two occurrences of `[请补充：日期]` are one blank
 * to fill, not two, and filling it should replace both.
 *
 * @param {string} text - Generated prompt.
 * @returns {Array<{ label: string, token: string }>} Placeholders in first-seen
 *   order, deduplicated by label.
 */
export function extractPlaceholders(text) {
  if (typeof text !== 'string' || text === '') return []
  const seen = new Set()
  const found = []
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const label = match[1].trim()
    if (label === '' || seen.has(label)) continue
    seen.add(label)
    found.push({ label, token: match[0] })
  }
  return found
}

/**
 * Replace placeholders with the values the user typed.
 *
 * A blank left empty keeps its original bracket, so an unfilled form degrades to
 * exactly the text the model produced rather than dropping the marker and
 * leaving a hole in the sentence.
 *
 * @param {string} text - Generated prompt.
 * @param {Record<string, string>} values - Label to replacement value.
 * @returns {string} The prompt with filled blanks, or the input unchanged.
 */
export function fillPlaceholders(text, values) {
  if (typeof text !== 'string' || text === '') return text
  const source = values !== null && typeof values === 'object' ? values : {}
  return text.replace(PLACEHOLDER_PATTERN, (whole, rawLabel) => {
    const label = String(rawLabel).trim()
    const value = source[label]
    if (typeof value !== 'string') return whole
    const trimmed = value.trim()
    return trimmed === '' ? whole : trimmed
  })
}

/**
 * Count how many placeholders are still unfilled.
 *
 * Used to tell the user whether the prompt is ready to copy: copying a prompt
 * that still says `[请补充：日期]` defeats the purpose.
 *
 * @param {string} text - Prompt text.
 * @returns {number} Remaining blank count.
 */
export function countPlaceholders(text) {
  return extractPlaceholders(text).length
}

/**
 * Inspect a prompt for the four elements every rewrite must name.
 *
 * The generator is instructed to name the goal, the deliverable and its format,
 * the audience and the main constraint (rule 6). This is a cheap, honest check on
 * the OUTPUT, so the panel can show what is missing instead of asking the user to
 * trust it. It is a heuristic: it looks for the shapes those elements take, not
 * for meaning.
 *
 * @param {string} text - Prompt text.
 * @returns {{ goal: boolean, format: boolean, audience: boolean, constraint: boolean, missing: string[] }}
 *   Presence flags and the Chinese names of what is missing.
 */
export function checkPromptElements(text) {
  const source = typeof text === 'string' ? text : ''
  const has = (pattern) => pattern.test(source)

  // Goal: an action verb, or the plain "I want X" phrasing people actually use.
  // The verb list used to miss 要/需要/来, so 「要一份周报」was reported as having
  // no goal — a false negative that tells the user their prompt is broken when
  // it is merely short.
  const goal = has(
    /请?(帮我|为我|给我)?\s*(制作|写|做|设计|整理|分析|翻译|生成|规划|拆解|检查|审查|总结|列出|给出|要|需要|来一?[份篇个张]|出)/,
  )
  // Format: a concrete deliverable, an output shape, or a countable size.
  // Countable units (200字, 8页, 一段) are formats in ordinary speech, and
  // leaving them out produced the same kind of false negative.
  const format = has(
    /\.(pptx?|docx?|xlsx?|md|txt|json|html|py|js)|PPT|Word|Excel|Markdown|表格|文档|邮件|周报|日报|方案|大纲|清单|一段|一份|一篇|一条|一张|\d+\s*(字|页|行|条|段|分钟|秒)|页数|字数|行数|格式|输出为/i,
  )
  // Audience: who it is for.
  const audience = has(/面向|给.{1,12}(看|用|听|读)|受众|读者|听众|用户是|供.{1,10}使用|同事|客户|领导|大众/)
  // Constraint: a limit or requirement.
  const constraint = has(/不超过|控制在|要?求[：:]|必须|不要|避免|最多|至少|限制|只|仅|左右|以内/)

  const missing = []
  if (!goal) missing.push('目标')
  if (!format) missing.push('交付格式')
  if (!audience) missing.push('受众')
  if (!constraint) missing.push('主要约束')

  return { goal, format, audience, constraint, missing }
}

/**
 * Remove the default markers once the user is copying the prompt out.
 *
 * `[默认：简体中文, 16:9]` is there so the author can review the assumptions. Once
 * they are happy, leaving it in the prompt makes the text look like a template.
 * Stripping it yields a clean prompt with the same instructions.
 *
 * @param {string} text - Prompt text.
 * @returns {string} Text without default markers, whitespace tidied.
 */
export function stripDefaultMarkers(text) {
  if (typeof text !== 'string' || text === '') return text
  return text
    .replace(DEFAULT_PATTERN, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([，。；：、])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
