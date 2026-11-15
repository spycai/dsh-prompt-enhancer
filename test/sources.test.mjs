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
  REMOTE_SOURCES,
  categoryFromType,
  fetchSource,
  isRefreshDue,
  mergeLibraries,
  parseCsv,
  rowsToRecords,
  splitCsvLine,
} from '../lib/sources.js'
import { getSeedRecords, SEED_RECORDS } from '../lib/seed.js'

const SOURCE = REMOTE_SOURCES[0]

/** Build a fake fetch that resolves with the given text. */
function okFetch(text) {
  return async () => ({ ok: true, text: async () => text })
}

test('the declared source is a structured file under a redistribution-safe licence', () => {
  assert.equal(SOURCE.license, 'CC0-1.0')
  assert.match(SOURCE.url, /^https:\/\/raw\.githubusercontent\.com\//)
  assert.equal(SOURCE.format, 'csv')
  // No scraping: the URL must point at a data file, not an HTML page.
  assert.match(SOURCE.url, /\.csv$/)
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
  assert.equal(records[0].source, 'prompts.chat')
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
  const result = await fetchSource(SOURCE, { fetch: okFetch('act,prompt\nTranslator,Translate this') })
  assert.equal(result.ok, true)
  assert.equal(result.records.length, 1)
  assert.equal(result.records[0].title, 'Translator')
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
  assert.equal((await fetchSource(SOURCE, { fetch: okFetch('act,prompt\n') })).reason, 'no-rows')
})

test('fetchSource refuses a payload that is too large', async () => {
  const huge = 'act,prompt\n' + 'A,' + 'x'.repeat(FETCH_LIMITS.maxBytes + 10)
  assert.equal((await fetchSource(SOURCE, { fetch: okFetch(huge) })).reason, 'too-large')
})

test('fetchSource rejects a source whose rows all fail the licence gate', async () => {
  // A source that declares no licence cannot contribute anything.
  const noLicence = { ...SOURCE, license: '' }
  const result = await fetchSource(noLicence, {
    fetch: okFetch('act,prompt\nA,body text here'),
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
      body: 'remote body',
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
