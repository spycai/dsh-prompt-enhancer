/**
 * Structured (three-section) output for the "wish mode" rewrite.
 *
 * The model is asked to return, in ONE call:
 *
 *   ### PROMPT
 *   <the rewritten prompt body>
 *   ### DECISIONS
 *   [{"slot":"audience","label":"受众","value":"同事","options":["同事","客户"]}]
 *   ### PLACEHOLDERS
 *   [{"slot":"topic","label":"主题","hint":"这份 PPT 讲什么"}]
 *
 * Everything here is a pure function so it can be tested without a Host, a
 * page, or a model. The single most important property: **parsing can never
 * break the rewrite**. Any missing section, malformed JSON or hostile content
 * degrades to "treat the whole output as the prompt body", which is exactly the
 * v1.5.x behaviour. Structure is an enhancement, never a dependency.
 */

/** Section headers recognised in the model output. */
const SECTION_RE = /^###\s+(PROMPT|DECISIONS|PLACEHOLDERS)\s*$/gim

/** Hard limits so a runaway model response cannot bloat the Client payload. */
const LIMITS = {
  maxDecisions: 8,
  maxPlaceholders: 4,
  maxOptionsPerDecision: 8,
  maxStringLength: 200,
  maxSections: 8,
}

/**
 * Clamp one string field, rejecting non-strings and control characters.
 *
 * @param value - Candidate value.
 * @returns A safe string, or `undefined` when unusable.
 */
function safeString(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (trimmed === '') return undefined
  return trimmed.slice(0, LIMITS.maxStringLength)
}

/**
 * Validate and clamp one DECISIONS entry.
 *
 * @param raw - Untrusted object from model JSON.
 * @returns A clean entry, or `undefined`.
 */
function cleanDecision(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const slot = safeString(raw.slot)
  const label = safeString(raw.label)
  const value = safeString(raw.value)
  if (slot === undefined || label === undefined || value === undefined) return undefined

  const options = Array.isArray(raw.options)
    ? raw.options
        .map(safeString)
        .filter((item) => item !== undefined)
        .slice(0, LIMITS.maxOptionsPerDecision)
    : []

  return { slot, label, value, options }
}

/**
 * Validate and clamp one PLACEHOLDERS entry.
 *
 * @param raw - Untrusted object from model JSON.
 * @returns A clean entry, or `undefined`.
 */
function cleanPlaceholder(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const slot = safeString(raw.slot)
  const label = safeString(raw.label)
  const hint = safeString(raw.hint)
  if (slot === undefined || label === undefined || hint === undefined) return undefined
  return { slot, label, hint }
}

/**
 * Parse one JSON array section, never throwing.
 *
 * A fenced code block is tolerated because models often wrap JSON in ```json.
 * Malformed JSON yields an empty array plus a warning, not a failure.
 *
 * @param text - Raw section body.
 * @param cleaner - Entry validator.
 * @param max - Maximum number of entries.
 * @param label - Section name for warnings.
 * @param warnings - Accumulator.
 * @returns Cleaned entries.
 */
function parseArraySection(text, cleaner, max, label, warnings) {
  const body = text.trim()
  if (body === '') return []

  const unfenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(body)
  const json = unfenced !== null ? unfenced[1] : body

  let parsed
  try {
    parsed = JSON.parse(json)
  } catch {
    warnings.push(`${label}: not valid JSON, treated as empty`)
    return []
  }
  if (!Array.isArray(parsed)) {
    warnings.push(`${label}: expected an array, treated as empty`)
    return []
  }
  return parsed.map(cleaner).filter((item) => item !== undefined).slice(0, max)
}

/**
 * Split the raw model output into named sections.
 *
 * Only PROMPT / DECISIONS / PLACEHOLDERS count as section headers, so a
 * Markdown `### 标题` inside the prompt body does not split it. Text before the
 * first header is preamble and is discarded when a PROMPT section exists.
 *
 * @param raw - Full model output.
 * @returns `{ sections, order }` where sections is a name -> body map.
 */
function splitSections(raw) {
  const sections = {}
  const order = []
  SECTION_RE.lastIndex = 0
  const matches = [...raw.matchAll(SECTION_RE)].slice(0, LIMITS.maxSections)

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]
    const name = match[1].toUpperCase()
    const start = match.index + match[0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length
    // A repeated header keeps the first occurrence to avoid a later duplicate
    // silently replacing a good PROMPT body.
    if (sections[name] === undefined) {
      sections[name] = raw.slice(start, end)
      order.push(name)
    }
  }
  return { sections, order }
}

/**
 * Parse a structured model response.
 *
 * Guarantees:
 *  - `text` is non-empty whenever the raw output is non-empty;
 *  - `structured === false` means the whole output was used as the body
 *    (the v1.5.x-compatible path), and decisions/placeholders are empty;
 *  - a valid PROMPT with broken DECISIONS/PLACEHOLDERS still keeps the PROMPT.
 *
 * @param {string} raw - Raw accumulated model text.
 * @returns {{
 *   structured: boolean,
 *   degraded: boolean,
 *   text: string,
 *   decisions: Array<{slot: string, label: string, value: string, options: string[]}>,
 *   placeholders: Array<{slot: string, label: string, hint: string}>,
 *   warnings: string[]
 * }}
 */
export function parseStructuredOutput(raw) {
  const original = typeof raw === 'string' ? raw.trim() : ''
  const warnings = []

  if (original === '') {
    return { structured: false, degraded: true, text: '', decisions: [], placeholders: [], warnings }
  }

  const { sections } = splitSections(original)
  if (sections.PROMPT === undefined) {
    warnings.push('no ### PROMPT section, whole output used as body')
    return {
      structured: false,
      degraded: true,
      text: original,
      decisions: [],
      placeholders: [],
      warnings,
    }
  }

  const text = sections.PROMPT.trim()
  if (text === '') {
    warnings.push('empty ### PROMPT section, whole output used as body')
    return {
      structured: false,
      degraded: true,
      text: original,
      decisions: [],
      placeholders: [],
      warnings,
    }
  }

  const decisions = parseArraySection(
    sections.DECISIONS ?? '',
    cleanDecision,
    LIMITS.maxDecisions,
    'DECISIONS',
    warnings,
  )
  const placeholders = parseArraySection(
    sections.PLACEHOLDERS ?? '',
    cleanPlaceholder,
    LIMITS.maxPlaceholders,
    'PLACEHOLDERS',
    warnings,
  )

  return { structured: true, degraded: false, text, decisions, placeholders, warnings }
}

/**
 * Append the three-section output protocol to a base rewrite prompt.
 *
 * The base prompt is used verbatim; the appended block explicitly overrides its
 * "output only the prompt" rule, so a single system prompt serves both modes
 * without maintaining two drifting rule sets.
 *
 * @param {string} basePrompt - `SYSTEM_PROMPTS.rewrite` or an equivalent.
 * @returns The structured-mode system prompt.
 */
export function buildStructuredSystemPrompt(basePrompt) {
  const base = typeof basePrompt === 'string' ? basePrompt : ''
  return [
    base,
    '',
    '=== OUTPUT FORMAT (overrides rule 1 above) ===',
    'Your response MUST consist of exactly these three sections, in this order, with no text before the first header:',
    '',
    '### PROMPT',
    'The rewritten prompt body. This is the only part the user sends. It follows every rule above, including at least one [默认：…] marker and at most two [请补充：…] placeholders.',
    '',
    '### DECISIONS',
    'A JSON array of the professional choices you made under rule 4. Each item: {"slot": short key, "label": short Chinese label, "value": chosen value, "options": [2-4 alternatives including the chosen one]}. At most 3 items, only for choices that materially change the result. Output [] when none.',
    '',
    '### PLACEHOLDERS',
    'A JSON array of facts only the author can supply. Each item: {"slot": short key, "label": short Chinese label, "hint": what to fill in}. Only for facts that appear as [请补充：…] in the PROMPT. At most 2 items. Output [] when none.',
    '',
    'Rules for the format: DECISIONS and PLACEHOLDERS must be valid JSON arrays (no comments, no trailing commas, no prose). Nothing else may appear after the last section. If you cannot produce the sections, output only the rewritten prompt as plain text with no headers at all.',
  ].join('\n')
}

/**
 * Decide whether a parse result should be used or discarded in favour of the
 * plain path. A structured result is kept whenever its body is non-empty; the
 * caller may additionally require at least one decision, but that is a policy
 * choice, not a correctness one.
 *
 * @param {ReturnType<typeof parseStructuredOutput>} parsed - Parse result.
 * @returns True when the body can be written back to the composer.
 */
export function hasUsableBody(parsed) {
  return typeof parsed?.text === 'string' && parsed.text.trim() !== ''
}
