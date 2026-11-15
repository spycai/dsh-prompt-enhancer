/**
 * Prompt library: record shape, licence gate, search and favourites.
 *
 * The library is the part of "许愿树" that turns a vague wish into a well-shaped
 * request by showing what a good prompt for that kind of work looks like.
 *
 * Two rules are load-bearing and both are enforced here rather than in the UI:
 *
 *  - **Licence gate.** Only content that may be redistributed enters the
 *    library. A record whose licence is missing or not on the allow-list is
 *    dropped, never displayed. This is a legal constraint, not a preference.
 *  - **Provenance is mandatory.** Every record carries `source`, `sourceUrl`
 *    and `license`, so any entry can be traced back to where it came from.
 *
 * Everything here is pure so the whole module is testable without a Host.
 */

/** Licences that permit redistribution inside this plugin. */
export const ALLOWED_LICENSES = Object.freeze([
  'CC0-1.0',
  'MIT',
  'Apache-2.0',
  'BSD-3-Clause',
  'ISC',
])

/** Categories the panel offers; `all` is a view, not a stored value. */
export const CATEGORIES = Object.freeze([
  'general',
  'writing',
  'code',
  'analysis',
  'design',
  'learning',
])

/** Hard caps so a corrupt or hostile source cannot bloat memory or the UI. */
export const LIBRARY_LIMITS = {
  maxRecords: 500,
  maxBodyChars: 4000,
  maxTitleChars: 120,
  maxTags: 8,
  maxSaved: 200,
}

/**
 * Whether a licence string permits redistribution.
 *
 * Case and surrounding whitespace are ignored, and a trailing "+" (as in
 * `Apache-2.0+`) is tolerated, because sources are inconsistent about it.
 *
 * @param {unknown} license - Declared licence identifier.
 * @returns {boolean} True when the record may be stored and shown.
 */
export function isAllowedLicense(license) {
  if (typeof license !== 'string') return false
  const normalized = license.trim().replace(/\+$/, '')
  if (normalized === '') return false
  return ALLOWED_LICENSES.some((allowed) => allowed.toLowerCase() === normalized.toLowerCase())
}

/**
 * Coerce a value into a bounded, control-character-free string.
 *
 * @param {unknown} value - Candidate.
 * @param {number} max - Character cap.
 * @returns Trimmed string, or '' when unusable.
 */
function cleanText(value, max) {
  if (typeof value !== 'string') return ''
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

/**
 * Validate and normalize one library record.
 *
 * Returns `undefined` for anything that must not enter the library: a missing
 * body, a missing licence, or a licence outside the allow-list. Callers count
 * rejections instead of guessing why a record vanished.
 *
 * @param {unknown} raw - Untrusted record from a seed file or a remote source.
 * @returns {object | undefined} A clean record.
 */
export function normalizeRecord(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined

  const id = cleanText(raw.id, 80)
  const body = cleanText(raw.body, LIBRARY_LIMITS.maxBodyChars)
  const license = cleanText(raw.license, 40)

  // Identity, content and licence are all mandatory. Anything less is not a
  // record we can show or attribute.
  if (id === '' || body === '' || license === '') return undefined
  if (!isAllowedLicense(license)) return undefined

  const title = cleanText(raw.title, LIBRARY_LIMITS.maxTitleChars) || id
  const rawCategory = cleanText(raw.category, 40)
  const category = CATEGORIES.includes(rawCategory) ? rawCategory : 'general'

  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.map((tag) => cleanText(tag, 40)).filter((tag) => tag !== ''))].slice(
        0,
        LIBRARY_LIMITS.maxTags,
      )
    : []

  return {
    id,
    title,
    category,
    tags,
    body,
    language: raw.language === 'zh' ? 'zh' : 'en',
    source: cleanText(raw.source, 80) || 'unknown',
    sourceUrl: cleanText(raw.sourceUrl, 300),
    license,
    fetchedAt: cleanText(raw.fetchedAt, 40),
  }
}

/**
 * Normalize a whole collection, dropping invalid records.
 *
 * Duplicate ids keep the FIRST occurrence: a seed entry then wins over a remote
 * record with a colliding id, which keeps the built-in library stable across
 * refreshes.
 *
 * @param {unknown} list - Candidate array.
 * @returns {{ records: object[], rejected: number }} Clean records and how many
 *   were dropped (missing body, missing licence, or a licence outside the list).
 */
export function normalizeLibrary(list) {
  if (!Array.isArray(list)) return { records: [], rejected: 0 }
  const records = []
  const seen = new Set()
  let rejected = 0

  for (const raw of list) {
    const record = normalizeRecord(raw)
    if (record === undefined || seen.has(record.id)) {
      rejected += 1
      continue
    }
    seen.add(record.id)
    records.push(record)
    if (records.length >= LIBRARY_LIMITS.maxRecords) break
  }
  return { records, rejected }
}

/**
 * Match one record against a query.
 *
 * Deliberately simple substring matching over title, body and tags: it needs no
 * index, works offline and is predictable. Semantic search is a later version.
 *
 * @param {object} record - Library record.
 * @param {string} query - Already-lowercased, trimmed query.
 * @returns {boolean} True on a match.
 */
function matchesQuery(record, query) {
  if (query === '') return true
  const haystack = `${record.title}\n${record.body}\n${record.tags.join(' ')}`.toLowerCase()
  return query.split(/\s+/).every((word) => haystack.includes(word))
}

/**
 * Search and filter the library.
 *
 * @param {object[]} records - Clean records.
 * @param {{ query?: string, category?: string, saved?: string[], savedOnly?: boolean }} [options] -
 *   `category: 'all'` or a category key; `savedOnly` restricts to favourite ids.
 * @returns {object[]} Matching records in source order, so results stay stable
 *   between renders.
 */
export function searchLibrary(records, options = {}) {
  if (!Array.isArray(records)) return []
  const query = typeof options.query === 'string' ? options.query.trim().toLowerCase() : ''
  const category = typeof options.category === 'string' ? options.category : 'all'
  const savedOnly = options.savedOnly === true
  const saved = Array.isArray(options.saved) ? new Set(options.saved) : new Set()

  return records.filter((record) => {
    if (record === null || typeof record !== 'object') return false
    if (category !== 'all' && record.category !== category) return false
    if (savedOnly && !saved.has(record.id)) return false
    return matchesQuery(record, query)
  })
}

/**
 * Find one record by id.
 *
 * @param {object[]} records - Clean records.
 * @param {string} id - Record id.
 * @returns {object | undefined} The record.
 */
export function findRecord(records, id) {
  if (!Array.isArray(records) || typeof id !== 'string') return undefined
  return records.find((record) => record !== null && typeof record === 'object' && record.id === id)
}

/**
 * Toggle one favourite id, keeping the list bounded.
 *
 * @param {string[]} saved - Current favourites.
 * @param {string} id - Record id to toggle.
 * @returns {string[]} New favourites list.
 */
export function toggleSaved(saved, id) {
  const current = Array.isArray(saved) ? saved.filter((value) => typeof value === 'string') : []
  if (typeof id !== 'string' || id.trim() === '') return current
  if (current.includes(id)) return current.filter((value) => value !== id)
  // Newest first, so a just-favourited entry is easy to find again, and capped so
  // repeated tapping cannot grow the stored list without bound.
  return [id, ...current].slice(0, LIBRARY_LIMITS.maxSaved)
}

/**
 * Count records per category, for the panel's category chips.
 *
 * @param {object[]} records - Clean records.
 * @returns {Record<string, number>} Counts keyed by category, plus `all`.
 */
export function countByCategory(records) {
  const counts = { all: 0 }
  for (const category of CATEGORIES) counts[category] = 0
  if (!Array.isArray(records)) return counts
  for (const record of records) {
    if (record === null || typeof record !== 'object') continue
    counts.all += 1
    if (typeof record.category === 'string' && record.category in counts) {
      counts[record.category] += 1
    }
  }
  return counts
}
