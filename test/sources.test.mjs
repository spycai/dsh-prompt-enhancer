/**
 * Tests for remote retrieval and its degradation behaviour.
 *
 * The property that matters: a refresh can fail in many ways (offline, timeout,
 * HTTP error, garbage payload, licence violations) and every one of them must
 * leave the panel usable. So each failure mode is asserted to return
 * `{ ok:false }` rather than throwing.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  FETCH_LIMITS,
  LIBRARY_LANGUAGE,
  PARTIAL_RETRY_MS,
  REMOTE_SOURCES,
  categoryFromType,
  fetchAllSources,
  fetchSource,
  isRefreshDue,
  mergeLibraries,
  parseCsv,
  parseJsonPrompts,
  refreshDecision,
  rowsToRecords,
  splitCsvLine,
} from '../lib/sources.js'
import { getSeedRecords, SEED_RECORDS } from '../lib/seed.js'

const SOURCE = REMOTE_SOURCES[0]

/** Build a fake fetch that resolves with the given text. */
function okFetch(text) {
  return async () => ({ ok: true, text: async () => text })
}

/** A minimal payload in the shape the Chinese source publishes. */
const GOOD_JSON = JSON.stringify([
  { cmd: 'translator', act: '翻译', prompt: '请把下面的内容翻译成英文，保持原意不变。' },
])

test('the declared source is a structured file under a redistribution-safe licence', () => {
  assert.equal(SOURCE.license, 'CC0-1.0')
  assert.match(SOURCE.url, /^https:\/\/raw\.githubusercontent\.com\//)
  assert.equal(SOURCE.format, 'json')
  assert.equal(SOURCE.language, 'zh', 'the library is Chinese only')
  // No scraping: the URL must point at a data file, not an HTML page.
  assert.match(SOURCE.url, /\.json$/)
})

test('splitCsvLine handles quotes, escaped quotes and commas inside cells', () => {
  assert.deepEqual(splitCsvLine('a,b,c'), ['a', 'b', 'c'])
  assert.deepEqual(splitCsvLine('"a,b",c'), ['a,b', 'c'])
  assert.deepEqual(splitCsvLine('"he said ""hi""",c'), ['he said "hi"', 'c'])
  assert.deepEqual(splitCsvLine('a,,c'), ['a', '', 'c'])
})

test('parseCsv reads the header and maps rows to objects', () => {
  const rows = parseCsv('act,prompt,for_devs,type\nTranslator,Translate this,FALSE,TEXT\n')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].act, 'Translator')
  assert.equal(rows[0].prompt, 'Translate this')
  assert.equal(rows[0].type, 'TEXT')
})

test('parseCsv keeps newlines inside quoted cells', () => {
  // A naive split on \n would cut this prompt in half and corrupt the row.
  const csv = 'act,prompt\nTitle,"line one\nline two"\n'
  const rows = parseCsv(csv)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].prompt, 'line one\nline two')
})

test('parseCsv tolerates CRLF, blank lines and empty input', () => {
  const rows = parseCsv('act,prompt\r\nA,a\r\n\r\nB,b\r\n')
  assert.equal(rows.length, 2)
  assert.equal(rows[1].act, 'B')
  assert.deepEqual(parseCsv(''), [])
  assert.deepEqual(parseCsv(undefined), [])
  assert.deepEqual(parseCsv('   '), [])
})

test('categoryFromType maps the upstream columns onto our vocabulary', () => {
  assert.equal(categoryFromType('TEXT', 'FALSE'), 'general')
  assert.equal(categoryFromType('IMAGE', 'FALSE'), 'design')
  assert.equal(categoryFromType('DEV', 'FALSE'), 'code')
  assert.equal(categoryFromType('TEXT', 'TRUE'), 'code')
  assert.equal(categoryFromType('', ''), 'general')
  assert.equal(categoryFromType(undefined, undefined), 'general')
})

test('rowsToRecords carries provenance and stamps the source licence', () => {
  const records = rowsToRecords(
    [{ act: 'Translator', prompt: 'Translate this', for_devs: 'FALSE', type: 'TEXT' }],
    SOURCE,
    '2026-11-15T00:00:00.000Z',
  )
  assert.equal(records.length, 1)
  assert.equal(records[0].license, 'CC0-1.0')
  assert.equal(records[0].source, 'prompts-zh')
  assert.equal(records[0].sourceUrl, SOURCE.url)
  assert.equal(records[0].fetchedAt, '2026-11-15T00:00:00.000Z')
})

test('rowsToRecords skips rows without a body and caps the count', () => {
  const rows = [{ act: 'x', prompt: '' }, { act: 'y', prompt: 'body' }]
  assert.equal(rowsToRecords(rows, SOURCE, 't').length, 1)

  const many = Array.from({ length: FETCH_LIMITS.maxRecords + 50 }, (_, i) => ({
    act: `t${i}`,
    prompt: `body ${i}`,
  }))
  assert.equal(rowsToRecords(many, SOURCE, 't').length, FETCH_LIMITS.maxRecords)
})

test('fetchSource returns records on a good response', async () => {
  const result = await fetchSource(SOURCE, { fetch: okFetch(GOOD_JSON) })
  assert.equal(result.ok, true)
  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].title, '翻译')
})

test('fetchSource reports a network failure instead of throwing', async () => {
  const result = await fetchSource(SOURCE, {
    fetch: async () => {
      throw new Error('ECONNREFUSED')
    },
  })
  assert.deepEqual(result, { ok: false, reason: 'network' })
})

test('fetchSource reports a timeout instead of throwing', async () => {
  const result = await fetchSource(SOURCE, {
    fetch: async () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    },
  })
  assert.deepEqual(result, { ok: false, reason: 'timeout' })
})

test('fetchSource reports an HTTP error', async () => {
  const result = await fetchSource(SOURCE, { fetch: async () => ({ ok: false, status: 503 }) })
  assert.deepEqual(result, { ok: false, reason: 'http-error' })
})

test('fetchSource reports an empty or unparseable payload', async () => {
  assert.equal((await fetchSource(SOURCE, { fetch: okFetch('') })).reason, 'empty')
  assert.equal((await fetchSource(SOURCE, { fetch: okFetch('[]') })).reason, 'no-rows')
})

test('fetchSource refuses a payload that is too large', async () => {
  const huge = 'act,prompt\n' + 'A,' + 'x'.repeat(FETCH_LIMITS.maxBytes + 10)
  assert.equal((await fetchSource(SOURCE, { fetch: okFetch(huge) })).reason, 'too-large')
})

test('fetchSource rejects a source whose rows all fail the licence gate', async () => {
  // A source that declares no licence cannot contribute anything.
  const noLicence = { ...SOURCE, license: '' }
  const result = await fetchSource(noLicence, {
    fetch: okFetch(GOOD_JSON),
  })
  assert.deepEqual(result, { ok: false, reason: 'all-rejected' })
})

test('fetchSource tolerates a missing fetch implementation', async () => {
  // `null` explicitly means "there is no fetch here"; the module must report it
  // rather than falling back to the global one, because tests and the offline
  // path both depend on that being observable.
  const result = await fetchSource(SOURCE, { fetch: null })
  assert.deepEqual(result, { ok: false, reason: 'no-fetch' })
})

test('mergeLibraries keeps the curated seed ahead of remote records', () => {
  const remote = [
    {
      id: 'remote-0',
      title: 'Remote',
      category: 'general',
      body: '这是远端返回的中文正文',
      language: 'zh',
      license: 'CC0-1.0',
      source: 'prompts.chat',
      sourceUrl: SOURCE.url,
      fetchedAt: 't',
    },
  ]
  const { records } = mergeLibraries(getSeedRecords(), remote)
  assert.equal(records.length, SEED_RECORDS.length + 1)
  assert.equal(records[0].id, SEED_RECORDS[0].id, 'seed comes first')
  assert.equal(records[records.length - 1].id, 'remote-0')
})

test('mergeLibraries tolerates a failed refresh by returning just the seed', () => {
  const { records } = mergeLibraries(getSeedRecords(), [])
  assert.equal(records.length, SEED_RECORDS.length)
})

test('mergeLibraries survives malformed input on both sides', () => {
  assert.deepEqual(mergeLibraries(undefined, undefined), { records: [], rejected: 0 })
  const { records } = mergeLibraries(getSeedRecords(), [null, 42, 'x'])
  assert.equal(records.length, SEED_RECORDS.length)
})

test('isRefreshDue respects the interval and treats a bad timestamp as due', () => {
  const now = Date.parse('2026-11-15T12:00:00.000Z')
  const hour = 3600000
  assert.equal(isRefreshDue('', hour, now), true)
  assert.equal(isRefreshDue('garbage', hour, now), true)
  assert.equal(isRefreshDue('2026-11-15T11:30:00.000Z', hour, now), false)
  assert.equal(isRefreshDue('2026-11-15T10:00:00.000Z', hour, now), true)
  assert.equal(isRefreshDue('2026-11-15T11:30:00.000Z', 0, now), false)
})


// --- v1.8.3: Chinese-only library -------------------------------------------

test('the library declares exactly one Chinese source', () => {
  // The English prompts.chat CSV was removed on request: English bodies are
  // useless to a Chinese user and crowded the list.
  assert.equal(REMOTE_SOURCES.length, 1)
  assert.equal(REMOTE_SOURCES[0].language, 'zh')
  assert.equal(LIBRARY_LANGUAGE, 'zh')
})

test('parseJsonPrompts reads the published array-of-objects shape', () => {
  const rows = parseJsonPrompts('[{"cmd":"a","act":"标题","prompt":"正文"}]')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].act, '标题')
  assert.equal(rows[0].prompt, '正文')
})

test('parseJsonPrompts tolerates a wrapper object and non-string fields', () => {
  const rows = parseJsonPrompts('{"prompts":[{"act":"t","prompt":"b","n":1}]}')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].n, undefined, 'non-string fields are dropped')
})

test('parseJsonPrompts returns nothing for malformed or unexpected input', () => {
  for (const bad of ['', 'not json', '{}', '[]', 'null', '42', undefined, null]) {
    assert.deepEqual(parseJsonPrompts(bad), [])
  }
})

test('a record carries the source language and a stable slug id', () => {
  const records = rowsToRecords([{ cmd: 'demo', act: '演示', prompt: '正文内容足够长' }], SOURCE, 't')
  assert.equal(records[0].language, 'zh')
  assert.equal(records[0].id, 'prompts-zh-demo')
})

test('fetchSource parses the declared JSON source', async () => {
  const result = await fetchSource(SOURCE, { fetch: okFetch(GOOD_JSON) })
  assert.equal(result.ok, true)
  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].title, '翻译')
})

test('a CSV payload fed to the JSON source fails cleanly', async () => {
  const result = await fetchSource(SOURCE, {
    fetch: async () => ({ ok: true, text: async () => 'act,prompt\nA,B' }),
  })
  assert.deepEqual(result, { ok: false, reason: 'no-rows' })
})

test('the byte cap is above the largest declared source', () => {
  // Regression guard for a real bug: the old English CSV was 10.4 MB while the
  // cap was 8 MB, so it was rejected on every refresh and never once succeeded.
  // The fixtures were all short mocks, so no test caught it.
  const TEN_POINT_FOUR_MB = 10_941_493
  assert.ok(
    FETCH_LIMITS.maxBytes > TEN_POINT_FOUR_MB,
    `maxBytes ${FETCH_LIMITS.maxBytes} must exceed the largest real payload`,
  )
})

test('the byte cap still bounds an abusive response', () => {
  assert.ok(FETCH_LIMITS.maxBytes <= 32 * 1024 * 1024, 'the cap must not be unbounded')
  assert.ok(FETCH_LIMITS.maxRecords <= 1000, 'stored records must stay bounded')
})

test('fetchAllSources reports success when the only source answers', async () => {
  const result = await fetchAllSources(REMOTE_SOURCES, { fetch: okFetch(GOOD_JSON) })
  assert.equal(result.ok, true)
  assert.deepEqual(result.succeeded, ['prompts-zh'])
  assert.deepEqual(result.failed, [])
  assert.equal(result.records.length, 1)
})

test('fetchAllSources reports failure when the only source is down', async () => {
  const result = await fetchAllSources(REMOTE_SOURCES, {
    fetch: async () => {
      throw new Error('offline')
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.records.length, 0)
  assert.deepEqual(result.failed, ['prompts-zh'])
})

test('an English record never reaches the library', () => {
  // The language gate is the choke point: even if a source started returning
  // English rows, they must not appear in the panel.
  const english = {
    id: 'en-1',
    title: 'English',
    category: 'general',
    tags: [],
    body: 'this body is in English and must be dropped',
    language: 'en',
    source: 'prompts.chat',
    sourceUrl: '',
    license: 'CC0-1.0',
    fetchedAt: 't',
  }
  const chinese = { ...english, id: 'zh-1', language: 'zh', body: '这是中文正文，应当保留' }
  const { records, rejected } = mergeLibraries([], [english, chinese])
  assert.deepEqual(records.map((record) => record.id), ['zh-1'])
  assert.equal(rejected, 1, 'the dropped English record is counted, not silent')
})

test('refreshDecision asks for a fetch when there is no cache', () => {
  assert.deepEqual(refreshDecision(undefined, 6 * 3600000, 0), { due: true, reason: 'never' })
  assert.deepEqual(refreshDecision({ fetchedAt: '' }, 6 * 3600000, 0), { due: true, reason: 'never' })
})

test('refreshDecision waits the full interval for a complete cache', () => {
  const now = Date.parse('2026-11-15T02:00:00.000Z')
  const complete = { fetchedAt: '2026-11-15T01:55:00.000Z', sources: ['prompts-zh'] }
  assert.equal(refreshDecision(complete, 6 * 3600000, now).reason, 'fresh')
  assert.equal(
    refreshDecision({ ...complete, fetchedAt: '2026-11-14T19:00:00.000Z' }, 6 * 3600000, now).reason,
    'stale',
  )
})

test('refreshDecision retries a cache that lost a source', () => {
  // Regression guard: a transient failure used to be cached as a complete
  // refresh, so the missing source was not retried for a full interval.
  const now = Date.parse('2026-11-15T02:00:00.000Z')
  const declared = ['a', 'b']
  const lost = { fetchedAt: '2026-11-15T01:40:00.000Z', sources: ['a'] }
  assert.equal(refreshDecision(lost, 6 * 3600000, now, declared).reason, 'partial')
  assert.equal(
    refreshDecision({ ...lost, fetchedAt: '2026-11-15T01:58:00.000Z' }, 6 * 3600000, now, declared).reason,
    'fresh',
    'two minutes is too soon to retry',
  )
  assert.ok(PARTIAL_RETRY_MS < 6 * 3600000, 'the partial retry must be shorter than the full interval')
})
