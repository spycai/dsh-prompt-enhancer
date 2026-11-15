/**
 * Tests for the on-disk library cache.
 *
 * The cache is what makes the fetched library survive a restart. Every failure
 * path here must degrade to "no cache" rather than throw, because a broken disk
 * must never take the panel down with it.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { CACHE_VERSION, cachePathFor, readCache, resolveProfileDir, writeCache } from '../lib/library-cache.js'

/** Create a temporary profile directory that the test can throw away. */
function tempProfile() {
  return mkdtempSync(join(tmpdir(), 'wt-cache-'))
}

/** A minimal record that passes the licence gate. */
function record(id) {
  return {
    id,
    title: 'T',
    category: 'general',
    tags: [],
    body: 'a valid prompt body',
    language: 'en',
    source: 'prompts.chat',
    sourceUrl: 'https://example.invalid/x.csv',
    license: 'CC0-1.0',
    fetchedAt: '2026-11-15T00:00:00.000Z',
  }
}

test('the cache path lives under the profile, not in the plugin tree', () => {
  const path = cachePathFor('C:/profiles/desktop')
  assert.match(path.replace(/\\/g, '/'), /profiles\/desktop\/\.dsh-wish-tree\/library\.json$/)
})

test('a missing cache reads as undefined instead of throwing', () => {
  const dir = tempProfile()
  try {
    assert.equal(readCache(dir), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('write then read round-trips the records', () => {
  const dir = tempProfile()
  try {
    const wrote = writeCache(dir, { records: [record('a'), record('b')], fetchedAt: '2026-11-15T01:00:00.000Z', sources: ['prompts.chat'] })
    assert.equal(wrote, true)
    const read = readCache(dir)
    assert.ok(read !== undefined)
    assert.equal(read.records.length, 2)
    assert.equal(read.fetchedAt, '2026-11-15T01:00:00.000Z')
    assert.deepEqual(read.sources, ['prompts.chat'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the cache directory is created on demand', () => {
  const dir = tempProfile()
  try {
    const nested = join(dir, 'deep', 'profile')
    assert.equal(writeCache(nested, { records: [record('a')] }), true)
    assert.equal(readCache(nested).records.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('invalid JSON reads as undefined rather than throwing', () => {
  const dir = tempProfile()
  try {
    mkdirSync(join(dir, '.dsh-wish-tree'), { recursive: true })
    writeFileSync(cachePathFor(dir), 'this is not json', 'utf8')
    assert.equal(readCache(dir), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a cache from another schema version is discarded', () => {
  // Guards against a future shape change being read as if it were current.
  const dir = tempProfile()
  try {
    mkdirSync(join(dir, '.dsh-wish-tree'), { recursive: true })
    writeFileSync(cachePathFor(dir), JSON.stringify({ version: CACHE_VERSION + 99, records: [record('a')] }), 'utf8')
    assert.equal(readCache(dir), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a cache with no records array is discarded', () => {
  const dir = tempProfile()
  try {
    mkdirSync(join(dir, '.dsh-wish-tree'), { recursive: true })
    writeFileSync(cachePathFor(dir), JSON.stringify({ version: CACHE_VERSION }), 'utf8')
    assert.equal(readCache(dir), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('non-object records are filtered out on read', () => {
  const dir = tempProfile()
  try {
    mkdirSync(join(dir, '.dsh-wish-tree'), { recursive: true })
    writeFileSync(
      cachePathFor(dir),
      JSON.stringify({ version: CACHE_VERSION, records: [record('a'), null, 42, 'x'], fetchedAt: '' }),
      'utf8',
    )
    const read = readCache(dir)
    assert.equal(read.records.length, 1)
    assert.equal(read.records[0].id, 'a')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writing to an impossible path reports failure instead of throwing', () => {
  // A read-only or malformed location must not break the request that triggered
  // the refresh: the in-memory list is still good for this session.
  const wrote = writeCache('\u0000bad\u0000path', { records: [record('a')] })
  assert.equal(wrote, false)
})

test('resolveProfileDir prefers an explicit directory', () => {
  assert.equal(resolveProfileDir({ profileDir: 'C:/p' }), 'C:/p')
  assert.equal(resolveProfileDir({ baseDir: 'C:/b' }), 'C:/b')
})

test('resolveProfileDir falls back to the DSH home layout', () => {
  const resolved = resolveProfileDir({})
  assert.ok(typeof resolved === 'string' && resolved.length > 0)
  assert.match(resolved.replace(/\\/g, '/'), /profiles\/desktop$/)
})
