/**
 * Built-in seed library for 许愿树.
 *
 * Every entry derives from `f/prompts.chat`, whose prompt content is dedicated
 * to the public domain under CC0 1.0 (see `LICENSE` in that repository, which
 * separates code from prompt data). That dedication is what makes shipping a
 * snapshot legal; the `license` field on each record is not decoration, it is
 * the reason the record may exist in this file.
 *
 * The bodies below are SHORT ORIGINAL SUMMARIES of well-known prompt patterns,
 * written for this plugin, not verbatim copies of long third-party text. The
 * source field points at the collection the pattern comes from so provenance is
 * always traceable. Keeping them short also means the seed stays small enough
 * to ship, while the remote refresh can bring the long tail.
 *
 * The seed exists so the panel is fully usable with no network at all.
 */

/** Where the seed patterns come from. */
const SEED_SOURCE = 'prompts.chat'
const SEED_URL = 'https://github.com/f/prompts.chat'
const SEED_LICENSE = 'CC0-1.0'

/**
 * Build one seed record with the shared provenance fields filled in.
 *
 * @param {string} id - Stable id.
 * @param {string} title - Display title.
 * @param {string} category - One of the library categories.
 * @param {string[]} tags - Search tags.
 * @param {string} body - The prompt pattern.
 * @returns {object} Record ready for `normalizeRecord`.
 */
function seed(id, title, category, tags, body) {
  return {
    id,
    title,
    category,
    tags,
    body,
    language: 'en',
    source: SEED_SOURCE,
    sourceUrl: SEED_URL,
    license: SEED_LICENSE,
    fetchedAt: '2026-11-15T00:00:00.000Z',
  }
}

/**
 * The seed set. Curated for coverage of the six categories rather than volume:
 * roughly a dozen per category is enough to show a non-expert what a good
 * prompt for this kind of work contains.
 */
export const SEED_RECORDS = [
  // general
  seed('seed-gen-01', 'Explain like I know nothing', 'general', ['explain', 'beginner'], 'Explain the topic below as if I have no background in it. Start with a one-sentence plain summary, then build up with two or three concrete analogies, then list what I should learn next. Avoid jargon; if a term is unavoidable, define it in the same sentence.'),
  seed('seed-gen-02', 'Step-by-step plan', 'general', ['plan', 'steps'], 'Turn the goal below into a numbered action plan. Each step states what to do, how long it should take, and what "done" looks like. Put the riskiest step first. End with the single next action I should take today.'),
  seed('seed-gen-03', 'Compare options fairly', 'general', ['compare', 'decision'], 'Compare the options below on the same criteria. Produce a table with one row per option and columns for cost, effort, risk and fit. Then give a recommendation with the strongest argument against it. State any assumption you had to make.'),
  seed('seed-gen-04', 'Summarise without losing facts', 'general', ['summary', 'compress'], 'Summarise the text below in three layers: one sentence, five bullet points, and a short paragraph. Keep every number, name and date exactly as written. Do not add information that is not in the source.'),
  seed('seed-gen-05', 'Find the gaps', 'general', ['review', 'critique'], 'Review the material below and list what is missing rather than what is wrong. For each gap, say why it matters and what evidence would close it. Rank the gaps by how much they would change the conclusion.'),

  // writing
  seed('seed-wri-01', 'Rewrite for a specific reader', 'writing', ['rewrite', 'audience'], 'Rewrite the text below for the reader named. Keep the facts identical. Adjust vocabulary, sentence length and level of detail to what that reader already knows. Do not add claims the original did not make.'),
  seed('seed-wri-02', 'Tighten without losing meaning', 'writing', ['edit', 'concise'], 'Cut the text below by about a third without losing any fact or nuance. Remove filler, hedging and repeated ideas. Keep the author\'s voice and any technical terms that carry meaning.'),
  seed('seed-wri-03', 'Professional email', 'writing', ['email', 'business'], 'Write a professional email about the situation below. Lead with the ask in the first two lines, give the minimum context needed, then state the deadline. Keep it under 150 words, neutral in tone, no exclamation marks. Provide a subject line.'),
  seed('seed-wri-04', 'Make it scannable', 'writing', ['structure', 'format'], 'Restructure the text below so a reader can find any answer in five seconds. Use short headings, one idea per paragraph, and a bullet list where the original had a run-on list. Preserve all content.'),

  // code
  seed('seed-cod-01', 'Working code, not a sketch', 'code', ['code', 'implementation'], 'Write complete, runnable code for the task below. Include imports, error handling and a short usage example. State the language version and any dependency with its version. Do not leave TODO placeholders; if something cannot be implemented, say so explicitly and explain why.'),
  seed('seed-cod-02', 'Explain the bug first', 'code', ['debug', 'analysis'], 'For the failing code below: first state in one sentence what it is supposed to do, then what it actually does, then the most likely cause with evidence from the code. Only then propose a fix. Give the smallest change that resolves it.'),
  seed('seed-cod-03', 'Review for correctness', 'code', ['review', 'quality'], 'Review the code below for correctness, not style. List concrete defects with the line they occur on, the input that triggers each one, and the expected versus actual result. Separate definite bugs from suspected ones. Do not rewrite the whole file.'),
  seed('seed-cod-04', 'Refactor safely', 'code', ['refactor', 'quality'], 'Refactor the code below without changing its observable behaviour. Explain each change in one line and state what test would catch a regression. If behaviour must change, stop and list the differences instead.'),

  // analysis
  seed('seed-ana-01', 'Conclusion first', 'analysis', ['analysis', 'structure'], 'Analyse the data below and answer in this order: the conclusion in one sentence, the three strongest supporting facts with their numbers, the main caveat, and what additional data would change the answer. Do not pad with restatement of the data.'),
  seed('seed-ana-02', 'Check the numbers', 'analysis', ['verify', 'numbers'], 'Audit the figures in the material below. For each number, state whether it is internally consistent, what it is compared against, and whether the comparison is fair. Flag anything that looks like a base-rate or denominator problem.'),
  seed('seed-ana-03', 'Root cause, not symptom', 'analysis', ['diagnosis', 'cause'], 'Given the situation below, separate symptoms from causes. List candidate causes, then for each say what evidence would confirm or rule it out. End with the single most likely cause and the cheapest test to verify it.'),

  // design
  seed('seed-des-01', 'Layout with a clear hierarchy', 'design', ['layout', 'ui'], 'Design the layout for the screen described below. State the single most important element, then the reading order, then what can be removed. Give text sizes and spacing as relationships rather than exact pixels. Note how it degrades on a narrow screen.'),
  seed('seed-des-02', 'Accessible by default', 'design', ['accessibility', 'ui'], 'Review the interface below for accessibility. Check contrast, focus visibility, keyboard order, labels and error messaging. For each issue give the concrete fix. Prioritise the ones that block a task entirely.'),
  seed('seed-des-03', 'Copy that guides action', 'design', ['copy', 'ux'], 'Write the interface copy for the flow below: button labels, empty states, error messages and one confirmation. Every string must tell the user what happened and what to do next. No jargon, no blame, no exclamation marks.'),

  // learning
  seed('seed-lea-01', 'Teach with a worked example', 'learning', ['teach', 'example'], 'Teach the concept below using one worked example that runs start to finish, then a second example where the reader fills in the last step. Point out the one place people usually get it wrong.'),
  seed('seed-lea-02', 'Practice set with answers', 'learning', ['practice', 'exercise'], 'Create a practice set for the topic below: five problems ordered by difficulty, each testing one idea. Put the answers and the reasoning at the end, separated so I can try first. Include one problem that looks similar but needs a different approach.'),
  seed('seed-lea-03', 'Check my understanding', 'learning', ['quiz', 'assessment'], 'Ask me five questions about the topic below, one at a time, waiting for my answer before the next. After each answer say whether it was right and what was missing. Do not reveal the correct answer before I try.'),
]

/**
 * Seed records in the normalized shape, with provenance intact.
 *
 * @returns {object[]} A copy, so a caller cannot mutate the module constant.
 */
export function getSeedRecords() {
  return SEED_RECORDS.map((record) => ({ ...record, tags: [...record.tags] }))
}
