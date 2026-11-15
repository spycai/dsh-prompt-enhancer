/**
 * Tests for the library route decision, without an HTTP server.
 *
 * `libraryPayload` is the whole decision, so it is exercised directly: what the
 * panel receives on a plain list, on a successful refresh, and — the important
 * one — on every failure, where it must still get a usable list.
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { libraryPayload } from '../index.js'
import { SEED_RECORDS } from '../lib/seed.js'
import { REMOTE_SOURCES } from '../lib/sources.js'
import { cachePathFor, readCache, writeCache } from '../lib/library-cache.js'

/** A fake fetch returning the given payload. */
function okFetch(text) {
  return async () => ({ ok: true, text: async () => text })
}

/** A refresh payload in the shape the Chinese source publishes. */
const GOOD_JSON = JSON.stringify([
  { cmd: 'translator', act: '翻译', prompt: '请把下面的内容翻译成英文，保持原意不变。' },
  { cmd: 'coder', act: '代码助手', prompt: '请为下面的任务写出完整可运行的代码。' },
])

/** A record shaped like a cached one, so retention can be asserted. */
function cached(source, id, language) {
  return {
    id,
    title: id,
    category: 'general',
    tags: [],
    body: '这是一条缓存中的中文提示词正文，长度足够像真实条目。',
    language,
    source,
    sourceUrl: 'https://example.invalid/x',
    license: 'CC0-1.0',
    fetchedAt: 't',
  }
}

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
  const payload = await libraryPayload('refresh', {}, { fetch: okFetch(GOOD_JSON) })
  assert.equal(payload.ok, true)
  assert.equal(payload.source, 'remote')
  assert.ok(payload.records.length > SEED_RECORDS.length)
  assert.match(payload.fetchedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(payload.rejected, 0)
})

test('remote records keep the seed first so curated entries never vanish', async () => {
  const payload = await libraryPayload('refresh', {}, { fetch: okFetch(GOOD_JSON) })
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
  assert.ok(typeof payload.reason === 'string' && payload.reason !== '')
  assert.deepEqual(payload.failed, ['prompts-zh'], 'the failing source is named')
  assert.equal(payload.source, 'seed')
  assert.equal(payload.records.length, SEED_RECORDS.length, 'the seed must still be present')
})

test('every failure mode keeps the seed', async () => {
  const cases = [
    { fetch: null },
    { fetch: async () => ({ ok: false, status: 500 }) },
    { fetch: okFetch('') },
    { fetch: okFetch('[]') },
  ]
  for (const { fetch } of cases) {
    const payload = await libraryPayload('refresh', {}, { fetch })
    assert.equal(payload.ok, false, 'a failed refresh must report failure')
    assert.ok(typeof payload.reason === 'string' && payload.reason !== '', 'a reason is given')
    assert.equal(payload.records.length, SEED_RECORDS.length, 'the seed must be kept')
  }
})

test('only Chinese records are returned', async () => {
  const payload = await libraryPayload('refresh', {}, { fetch: okFetch(GOOD_JSON) })
  for (const record of payload.records) {
    assert.equal(record.language, 'zh', `${record.id} is not Chinese`)
  }
})

test('every returned record is licence-cleared', async () => {
  const payload = await libraryPayload('refresh', {}, { fetch: okFetch(GOOD_JSON) })
  for (const record of payload.records) {
    assert.ok(
      ['CC0-1.0', 'MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC'].includes(record.license),
      `${record.id} carries an unexpected licence ${record.license}`,
    )
  }
})

test('the source declaration used by refresh is the Chinese one', () => {
  assert.equal(REMOTE_SOURCES.length, 1)
  assert.equal(REMOTE_SOURCES[0].id, 'prompts-zh')
  assert.equal(REMOTE_SOURCES[0].license, 'CC0-1.0')
  assert.equal(REMOTE_SOURCES[0].language, 'zh')
})

// --- cache integration ------------------------------------------------------

test('a refresh writes to the cache so it survives a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-route-'))
  try {
    await libraryPayload('refresh', {}, { profileDir: dir, fetch: okFetch(GOOD_JSON) })
    const onDisk = readCache(dir)
    assert.ok(onDisk !== undefined, 'the cache must exist after a refresh')
    assert.ok(onDisk.records.length > 0)
    // A later list must serve the cache instead of falling back to the seed.
    const listed = await libraryPayload('list', {}, { profileDir: dir })
    assert.equal(listed.source, 'cache')
    assert.ok(listed.records.length > SEED_RECORDS.length)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a failed refresh keeps the previously cached records', async () => {
  // A transient blip must not downgrade a full library to a partial one.
  const dir = mkdtempSync(join(tmpdir(), 'wt-route-'))
  try {
    writeCache(dir, {
      records: [cached('prompts-zh', 'prompts-zh-old', 'zh')],
      fetchedAt: 'old',
      sources: ['prompts-zh'],
    })
    await libraryPayload('refresh', {}, {
      profileDir: dir,
      fetch: async () => {
        throw new Error('blip')
      },
    })
    const after = readCache(dir)
    assert.ok(
      after.records.some((record) => record.id === 'prompts-zh-old'),
      'the previously cached records must survive a failed refresh',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the seed is never written into the cache', async () => {
  // The seed ships with the bundle; freezing a copy into the cache would pin a
  // stale snapshot forever.
  const dir = mkdtempSync(join(tmpdir(), 'wt-route-'))
  try {
    await libraryPayload('refresh', {}, { profileDir: dir, fetch: okFetch(GOOD_JSON) })
    const onDisk = readCache(dir)
    const seedIds = new Set(SEED_RECORDS.map((record) => record.id))
    assert.equal(
      onDisk.records.some((record) => seedIds.has(record.id)),
      false,
      'no seed record may be persisted',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a corrupt cache falls back to the seed without failing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-route-'))
  try {
    mkdirSync(join(dir, '.dsh-wish-tree'), { recursive: true })
    writeFileSync(cachePathFor(dir), 'not json at all', 'utf8')
    const listed = await libraryPayload('list', {}, { profileDir: dir })
    assert.equal(listed.ok, true)
    assert.equal(listed.source, 'seed')
    assert.equal(listed.records.length, SEED_RECORDS.length)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an English record in the cache never reaches the panel', async () => {
  // The language gate must also apply to whatever is already on disk.
  const dir = mkdtempSync(join(tmpdir(), 'wt-route-'))
  try {
    writeCache(dir, {
      records: [cached('prompts.chat', 'old-en', 'en'), cached('prompts-zh', 'old-zh', 'zh')],
      fetchedAt: 't',
      sources: ['prompts-zh'],
    })
    const listed = await libraryPayload('list', {}, { profileDir: dir })
    assert.ok(
      listed.records.every((record) => record.language === 'zh'),
      'no English record may be served',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
