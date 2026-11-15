/**
 * Tests for the library route decision, without an HTTP server.
 *
 * `libraryPayload` is the whole decision, so it is exercised directly: what the
 * panel receives on a plain list, on a successful refresh, and — the important
 * one — on every failure, where it must still get a usable list.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { libraryPayload } from '../index.js'
import { SEED_RECORDS } from '../lib/seed.js'
import { REMOTE_SOURCES } from '../lib/sources.js'

/** A fake fetch returning the given CSV. */
function okFetch(text) {
  return async () => ({ ok: true, text: async () => text })
}

const GOOD_CSV = [
  'act,prompt,for_devs,type',
  'Translator,"Translate the following text",FALSE,TEXT',
  'Code Helper,"Write working code for the task",TRUE,TEXT',
].join('\n')

test('a plain list returns the seed and needs no network', async () => {
  const payload = await libraryPayload('list', {})
  assert.equal(payload.ok, true)
  assert.equal(payload.source, 'seed')
  assert.equal(payload.records.length, SEED_RECORDS.length)
  assert.equal(payload.fetchedAt, '')
})

test('an unrecognised action is treated as a plain list', async () => {
  for (const action of ['', 'nonsense', undefined]) {
    const payload = await libraryPayload(action, {})
    assert.equal(payload.action, 'list')
    assert.equal(payload.records.length, SEED_RECORDS.length)
  }
})

test('a successful refresh merges remote records over the seed', async () => {
  const payload = await libraryPayload('refresh', {}, { fetch: okFetch(GOOD_CSV) })
  assert.equal(payload.ok, true)
  assert.equal(payload.source, 'remote')
  assert.ok(payload.records.length > SEED_RECORDS.length)
  assert.match(payload.fetchedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(payload.rejected, 0)
})

test('remote records keep the seed first so curated entries never vanish', async () => {
  const payload = await libraryPayload('refresh', {}, { fetch: okFetch(GOOD_CSV) })
  assert.equal(payload.records[0].id, SEED_RECORDS[0].id)
})

test('a failed refresh still returns a usable list', async () => {
  // The whole degradation promise: the panel keeps working offline.
  const payload = await libraryPayload('refresh', {}, {
    fetch: async () => {
      throw new Error('ECONNREFUSED')
    },
  })
  assert.equal(payload.ok, false)
  assert.equal(payload.reason, 'network')
  assert.equal(payload.source, 'seed')
  assert.equal(payload.records.length, SEED_RECORDS.length, 'the seed must still be present')
})

test('every failure mode keeps the seed', async () => {
  const cases = [
    { fetch: null, reason: 'no-fetch' },
    { fetch: async () => ({ ok: false, status: 500 }), reason: 'http-error' },
    { fetch: okFetch(''), reason: 'empty' },
    { fetch: okFetch('act,prompt\n'), reason: 'no-rows' },
  ]
  for (const { fetch, reason } of cases) {
    const payload = await libraryPayload('refresh', {}, { fetch })
    assert.equal(payload.ok, false, `${reason} should not be ok`)
    assert.equal(payload.reason, reason)
    assert.equal(payload.records.length, SEED_RECORDS.length, `${reason} must keep the seed`)
  }
})

test('every returned record is licence-cleared', async () => {
  // Guards against a regression where a refresh path bypasses the gate.
  const payload = await libraryPayload('refresh', {}, { fetch: okFetch(GOOD_CSV) })
  for (const record of payload.records) {
    assert.ok(
      ['CC0-1.0', 'MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC'].includes(record.license),
      `${record.id} carries an unexpected licence ${record.license}`,
    )
  }
})

test('the source declaration used by refresh matches the documented one', () => {
  assert.equal(REMOTE_SOURCES[0].id, 'prompts.chat')
  assert.equal(REMOTE_SOURCES[0].license, 'CC0-1.0')
})
