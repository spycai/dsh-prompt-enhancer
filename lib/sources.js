/**
 * Remote retrieval for the prompt library.
 *
 * The only supported source is a structured CSV published under a
 * redistribution-safe licence — no HTML scraping, no live crawling, no
 * authentication. That keeps the plugin honest about what it does to someone
 * else's server and keeps parsing deterministic.
 *
 * The design rule that matters: **this module never throws at the boundary.**
 * A failed refresh returns `{ ok: false, reason }` and the caller keeps the
 * built-in seed. Being offline is a normal state, not an error.
 */

import { normalizeLibrary } from './wishlist.js'

/**
 * The remote sources.
 *
 * **Chinese only, by explicit user request.** The English prompts.chat CSV was
 * removed on purpose: a Chinese user browsing English prompt bodies gets no
 * value from them, and they crowded the list. Keeping a single language also
 * makes `language` filtering below meaningful rather than decorative.
 *
 * The source is a structured JSON file under CC0, so the plugin never scrapes
 * HTML and never needs credentials.
 */
export const REMOTE_SOURCES = Object.freeze([
  {
    id: 'prompts-zh',
    label: 'prompts-zh',
    url: 'https://raw.githubusercontent.com/Vipuser2023/chatgpt-prompts-chinese/main/prompts-zh.json',
    license: 'CC0-1.0',
    format: 'json',
    /** Rows look like { cmd, act, prompt }. */
    columns: { title: 'act', body: 'prompt', id: 'cmd' },
    language: 'zh',
  },
])

/** The only language the library carries. */
export const LIBRARY_LANGUAGE = 'zh'

/**
 * Refuse absurd payloads rather than trying to parse them.
 *
 * `maxBytes` must stay above the largest declared source or that source is
 * silently dropped forever: prompts.csv is ~10.4 MB, so an 8 MB cap rejected it
 * every time. It never showed in tests because every fixture was a short mock
 * CSV. 16 MB leaves headroom without accepting an unbounded response.
 */
export const FETCH_LIMITS = {
  maxBytes: 16 * 1024 * 1024,
  maxRecords: 400,
  timeoutMs: 20000,
}

/**
 * Map a source's own `type` column onto our category vocabulary.
 *
 * The upstream file marks rows as `TEXT`/`IMAGE` and occasionally `DEV`. Anything
 * unrecognised becomes `general` rather than being dropped, because the prompt
 * body is still useful.
 *
 * @param {string} type - Raw type cell.
 * @param {string} forDevs - Raw for_devs cell ('TRUE'/'FALSE').
 * @returns {string} One of the library categories.
 */
export function categoryFromType(type, forDevs) {
  const normalized = String(type ?? '').trim().toUpperCase()
  const isDev = String(forDevs ?? '').trim().toUpperCase() === 'TRUE'
  if (isDev || normalized === 'DEV') return 'code'
  if (normalized === 'IMAGE') return 'design'
  return 'general'
}

/**
 * Split one CSV line into fields, honouring double-quoted cells.
 *
 * Hand written rather than pulled from a package: the plugin has no dependency
 * tree, and this is the only parsing it needs.
 *
 * @param {string} line - One CSV record.
 * @returns {string[]} Fields in order.
 */
export function splitCsvLine(line) {
  const fields = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        current += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields
}

/**
 * Parse a CSV document into rows of objects, using the header line.
 *
 * Quoted cells may contain newlines, so the document is scanned char by char
 * instead of being split on `\n` first: splitting naively would cut long prompt
 * bodies in half and produce garbage rows.
 *
 * @param {string} text - CSV text.
 * @returns {Array<Record<string, string>>} One object per data row.
 */
export function parseCsv(text) {
  if (typeof text !== 'string' || text.trim() === '') return []

  const rows = []
  let field = ''
  let row = []
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  if (rows.length === 0) return []
  const header = rows[0].map((cell) => cell.trim().toLowerCase())
  const dataRows = rows.slice(1).filter((cells) => cells.some((cell) => cell.trim() !== ''))

  return dataRows.map((cells) => {
    const record = {}
    for (let i = 0; i < header.length; i += 1) record[header[i]] = cells[i] ?? ''
    return record
  })
}

/**
 * Parse a JSON prompt collection into rows.
 *
 * Accepts the common shapes without guessing too hard: an array of objects is
 * the usual form (`[{ cmd, act, prompt }]`); a wrapper object with a `prompts`
 * array is also tolerated. Anything else yields an empty list rather than a
 * throw, so a changed upstream shape degrades to "no records from this source".
 *
 * @param {string} text - JSON text.
 * @returns {Array<Record<string, string>>} Rows ready for `rowsToRecords`.
 */
export function parseJsonPrompts(text) {
  if (typeof text !== 'string' || text.trim() === '') return []
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.prompts)
      ? parsed.prompts
      : []
  const rows = []
  for (const item of list) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const row = {}
    for (const [key, value] of Object.entries(item)) {
      if (typeof value === 'string') row[key] = value
    }
    if (Object.keys(row).length > 0) rows.push(row)
  }
  return rows
}

/**
 * Convert parsed upstream rows into library records.
 *
 * Licence is stamped from the SOURCE declaration, not from the row: the CSV has
 * no licence column, and the repository's LICENSE file dedicates this file to
 * CC0. That stamping is what makes each record traceable and gate-checkable.
 *
 * @param {Array<Record<string, string>>} rows - Output of `parseCsv`.
 * @param {object} source - One entry of `REMOTE_SOURCES`.
 * @param {string} fetchedAt - ISO timestamp for provenance.
 * @returns {object[]} Candidate records, not yet normalized.
 */
export function rowsToRecords(rows, source, fetchedAt) {
  if (!Array.isArray(rows) || rows.length === 0) return []
  const columns = source?.columns ?? { title: 'act', body: 'prompt', type: 'type' }
  const language = source?.language === 'zh' ? 'zh' : 'en'
  const records = []

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (row === null || typeof row !== 'object') continue
    const title = String(row[columns.title] ?? '').trim()
    const body = String(row[columns.body] ?? '').trim()
    if (body === '') continue
    // A source may publish a stable slug per row; using it keeps ids meaningful
    // across refreshes instead of shifting when the upstream order changes.
    const slug = columns.id === undefined ? '' : String(row[columns.id] ?? '').trim()

    records.push({
      id: `${source?.id ?? 'remote'}-${slug === '' ? String(index) : slug}`,
      title: title === '' ? `Prompt ${index + 1}` : title,
      category: categoryFromType(row[columns.type], row.for_devs),
      tags: [],
      body,
      language,
      source: source?.label ?? source?.id ?? 'remote',
      sourceUrl: source?.url ?? '',
      license: source?.license ?? '',
      fetchedAt,
    })
    if (records.length >= FETCH_LIMITS.maxRecords) break
  }
  return records
}

/**
 * Fetch and parse one source, never throwing.
 *
 * @param {object} source - One entry of `REMOTE_SOURCES`.
 * @param {object} [deps] - Injectable `fetch` and clock, for tests.
 * @returns {Promise<{ ok: boolean, records?: object[], rejected?: number, reason?: string }>}
 *   `ok: false` carries a short reason the panel shows next to the seed notice.
 */
export async function fetchSource(source, deps = {}) {
  // An explicit `null` means "no fetch is available here" and must NOT fall back
  // to the global one: the offline path and the tests both need that to be
  // observable, and a hidden fallback would make an offline build look online.
  const doFetch = 'fetch' in deps ? deps.fetch : globalThis.fetch
  const now = deps.now ?? (() => new Date().toISOString())
  const timeoutMs = deps.timeoutMs ?? FETCH_LIMITS.timeoutMs

  if (typeof doFetch !== 'function') return { ok: false, reason: 'no-fetch' }
  if (source === null || typeof source !== 'object' || typeof source.url !== 'string') {
    return { ok: false, reason: 'bad-source' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await doFetch(source.url, {
      signal: controller.signal,
      headers: { accept: 'text/csv,text/plain;q=0.9,*/*;q=0.5' },
    })
    if (response === null || typeof response !== 'object' || response.ok !== true) {
      return { ok: false, reason: 'http-error' }
    }
    const text = await response.text()
    if (typeof text !== 'string' || text === '') return { ok: false, reason: 'empty' }
    if (text.length > FETCH_LIMITS.maxBytes) return { ok: false, reason: 'too-large' }

    // The declared format decides the parser; a source that suddenly serves HTML
    // fails here as "no-rows" rather than producing garbage records.
    const rows = source.format === 'json' ? parseJsonPrompts(text) : parseCsv(text)
    if (rows.length === 0) return { ok: false, reason: 'no-rows' }

    const candidates = rowsToRecords(rows, source, now())
    const { records, rejected } = normalizeLibrary(candidates)
    if (records.length === 0) return { ok: false, reason: 'all-rejected' }

    return { ok: true, records, rejected }
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : 'network'
    return { ok: false, reason }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch every declared source, keeping whatever succeeded.
 *
 * A partial success is a success: if the Chinese source is down but the English
 * one answers, the library still grows. Only when every source fails does this
 * report failure, and even then the caller keeps the seed.
 *
 * @param {object[]} [sources] - Sources to fetch; defaults to REMOTE_SOURCES.
 * @param {object} [deps] - Injectable `fetch` and clock, for tests.
 * @returns {Promise<{ ok: boolean, records: object[], rejected: number, succeeded: string[], failed: string[] }>}
 */
export async function fetchAllSources(sources = REMOTE_SOURCES, deps = {}) {
  const list = Array.isArray(sources) ? sources : REMOTE_SOURCES
  const results = await Promise.all(list.map((source) => fetchSource(source, deps)))

  const records = []
  const succeeded = []
  const failed = []
  let rejected = 0

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index]
    const source = list[index]
    if (result?.ok === true) {
      succeeded.push(source.id)
      rejected += result.rejected ?? 0
      if (Array.isArray(result.records)) records.push(...result.records)
    } else {
      failed.push(source.id)
    }
  }

  return { ok: records.length > 0, records, rejected, succeeded, failed }
}

/**
 * Merge remote records over the seed for display.
 *
 * **Chinese only.** Every record whose `language` is not `zh` is dropped here,
 * which is the single choke point for the whole library — the seed, the remote
 * source and the on-disk cache all pass through it. A future English source
 * therefore cannot leak into the panel just by being added to `REMOTE_SOURCES`.
 *
 * The seed is kept first so the built-in entries — which are curated and
 * category-balanced — never disappear because a refresh returned a differently
 * shaped collection. Duplicate ids keep the first occurrence.
 *
 * @param {object[]} seedRecords - Built-in records.
 * @param {object[]} remoteRecords - Records from a successful refresh.
 * @returns {{ records: object[], rejected: number }} Combined library.
 */
export function mergeLibraries(seedRecords, remoteRecords) {
  const seed = Array.isArray(seedRecords) ? seedRecords : []
  const remote = Array.isArray(remoteRecords) ? remoteRecords : []
  const combined = normalizeLibrary([...seed, ...remote])

  // Filter AFTER normalizing so the licence gate and the language gate are both
  // applied, and count what the language gate removed so it is not silent.
  const records = combined.records.filter((record) => record.language === LIBRARY_LANGUAGE)
  const dropped = combined.records.length - records.length
  return { records, rejected: combined.rejected + dropped }
}

/**
 * Whether a refresh is due, given the last successful fetch time.
 *
 * @param {string} lastFetchedAt - ISO timestamp, or '' when never fetched.
 * @param {number} intervalMs - Minimum gap between refreshes.
 * @param {number} [nowMs] - Injectable clock.
 * @returns {boolean} True when a refresh may run.
 */
export function isRefreshDue(lastFetchedAt, intervalMs, nowMs = Date.now()) {
  if (typeof lastFetchedAt !== 'string' || lastFetchedAt.trim() === '') return true
  const parsed = Date.parse(lastFetchedAt)
  if (!Number.isFinite(parsed)) return true
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return false
  return nowMs - parsed >= intervalMs
}

/** How long to wait before retrying a set of sources that partially failed. */
export const PARTIAL_RETRY_MS = 10 * 60 * 1000

/**
 * Decide whether the library should be refreshed now.
 *
 * Two conditions trigger a fetch, and the second one matters: a cache whose
 * `sources` list is shorter than the declared set means some source failed last
 * time. Waiting the full interval for a transient blip would leave the library
 * short for hours, so a partial cache retries much sooner.
 *
 * @param {{ fetchedAt?: string, sources?: string[] }} [cache] - Cached metadata.
 * @param {number} intervalMs - Full interval for a complete cache.
 * @param {number} [nowMs] - Injectable clock.
 * @param {string[]} [declared] - Ids of every declared source.
 * @returns {{ due: boolean, reason: 'never' | 'stale' | 'partial' | 'fresh' }}
 */
export function refreshDecision(cache, intervalMs, nowMs = Date.now(), declared = REMOTE_SOURCES.map((s) => s.id)) {
  const fetchedAt = typeof cache?.fetchedAt === 'string' ? cache.fetchedAt : ''
  if (fetchedAt === '') return { due: true, reason: 'never' }
  if (isRefreshDue(fetchedAt, intervalMs, nowMs)) return { due: true, reason: 'stale' }

  const have = Array.isArray(cache?.sources) ? cache.sources : []
  const declaredList = Array.isArray(declared) ? declared : []
  const incomplete = declaredList.some((id) => !have.includes(id))
  if (incomplete && isRefreshDue(fetchedAt, PARTIAL_RETRY_MS, nowMs)) {
    return { due: true, reason: 'partial' }
  }
  return { due: false, reason: 'fresh' }
}
