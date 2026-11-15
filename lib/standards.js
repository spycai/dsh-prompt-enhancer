/**
 * Optional delivery standards for the rewrite.
 *
 * Why this exists: users reasonably expect a "professional" prompt to say who is
 * writing it, and the intuitive form is "you are an experienced X master". On
 * current models that phrase decides nothing — it excludes no candidate, and
 * "master" often pushes output toward visual flourish at the cost of information
 * density. It also collides with this plugin's own rules: `SYSTEM_PROMPTS.rewrite`
 * rule 9 forbids generic prompt-engineering boilerplate, and the evaluator counts
 * an assistant-persona disclaimer as a D5 failure.
 *
 * So the capability is offered in the form that actually works: a CHECKLIST of
 * observable properties. "Type scale ≤ 3, one idea per page, whitespace ≥ 30%" is
 * something a model can act on and a reviewer can verify. It carries the intent
 * of a persona with none of the performance.
 *
 * Design constraints, all deliberate:
 *  - Keys only cross the wire; the Host owns this wording, so a stolen or hostile
 *    Client cannot inject an arbitrary instruction.
 *  - Off by default. An unselected rewrite must stay byte-identical to v1.8.0.
 *  - The text never says "you are a ...". That is the whole point.
 */

/** Selectable standards, keyed. Order is the panel's display order. */
export const STANDARDS = Object.freeze([
  {
    key: 'deck',
    labelZh: '演示稿',
    labelEn: 'Deck',
    hint: '版式克制，每页一个结论，可核验的检查项',
    text: 'Deliverable standards for a deck: at most three type sizes; one idea per page, with the title stating that idea rather than naming a topic; body copy no longer than five lines; at least thirty percent of each page left empty as whitespace; no gradient fills, word-art or clip-art. State which standard you bent, and why, if any page requires it.',
  },
  {
    key: 'document',
    labelZh: '文档',
    labelEn: 'Document',
    hint: '结构先行，结论前置，可追溯',
    text: 'Deliverable standards for a document: open with a one-paragraph summary that stands alone; every heading answers a question the reader actually has; each claim carries its evidence or an explicit "unverified"; no section restates another. State which standard you bent, and why, if any section requires it.',
  },
  {
    key: 'code',
    labelZh: '代码',
    labelEn: 'Code',
    hint: '可运行、边界清晰、不留占位',
    text: 'Deliverable standards for code: it runs as given, with imports and a usage example; every input is validated at the boundary; failures raise a clear error rather than returning a sentinel; no TODO or ellipsis stands in for real logic. State any assumption about the environment that the code depends on.',
  },
  {
    key: 'writing',
    labelZh: '文案',
    labelEn: 'Copy',
    hint: '读者视角，删空话，可核对',
    text: 'Deliverable standards for copy: every sentence gives the reader information they did not have; no adjective that cannot be checked; the opening line carries the point rather than the setup; no sentence exceeds about forty characters in Chinese. State which standard you bent, and why, if any passage requires it.',
  },
])

/** Fast lookup by key. */
const BY_KEY = new Map(STANDARDS.map((standard) => [standard.key, standard]))

/**
 * Validate one standard key.
 *
 * @param {unknown} key - Candidate key from a request.
 * @returns {string} A known key, or '' when the key is not recognised.
 */
export function resolveStandardKey(key) {
  return typeof key === 'string' && BY_KEY.has(key) ? key : ''
}

/**
 * Normalise a list of requested keys: known keys only, deduplicated, in the
 * canonical order so the system prompt does not vary with click order.
 *
 * @param {unknown} keys - Candidate keys.
 * @returns {string[]} Valid keys.
 */
export function resolveStandardKeys(keys) {
  if (!Array.isArray(keys)) return []
  const wanted = new Set(keys.filter((key) => typeof key === 'string' && BY_KEY.has(key)))
  return STANDARDS.filter((standard) => wanted.has(standard.key)).map((standard) => standard.key)
}

/**
 * Build the addendum appended to the system prompt.
 *
 * Returns '' when nothing is selected, so an unadorned rewrite is byte-identical
 * to the previous release and the recorded quality baseline keeps its meaning.
 *
 * @param {unknown} keys - Requested standard keys.
 * @returns The addendum text, or ''.
 */
export function buildStandardsBlock(keys) {
  const resolved = resolveStandardKeys(keys)
  if (resolved.length === 0) return ''
  const lines = resolved.map((key) => `- ${BY_KEY.get(key).text}`)
  return [
    '',
    'Additional delivery standards for this request. Apply them to the result; they do not change what the task is:',
    ...lines,
  ].join('\n')
}

/**
 * Whether a string reads like a role-play persona.
 *
 * Exported so a test can assert the generated text never does this. It is a
 * guard against a future edit quietly reintroducing "you are a ..." wording.
 *
 * @param {string} text - Text to inspect.
 * @returns {boolean} True when persona phrasing is present.
 */
export function looksLikePersona(text) {
  if (typeof text !== 'string') return false
  return /你是一位|你是一名|你是一个|you are (an?|the) /i.test(text)
}
