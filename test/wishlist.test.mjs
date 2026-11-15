/**
 * Tests for the library model and its licence gate.
 *
 * The licence gate is the reason this file exists: shipping a prompt whose
 * licence forbids redistribution is a legal problem, not a UI bug, so the rules
 * are asserted directly rather than trusted to a caller.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ALLOWED_LICENSES,
  CATEGORIES,
  LIBRARY_LIMITS,
  countByCategory,
  findRecord,
  isAllowedLicense,
  normalizeLibrary,
  normalizeRecord,
  searchLibrary,
  toggleSaved,
} from '../lib/wishlist.js'

/** A minimal valid record; tests override single fields to isolate behaviour. */
function record(overrides = {}) {
  return {
    id: 'pt-0001',
    title: 'Ethereum Developer',
    category: 'code',
    tags: ['code'],
    body: 'Imagine you are an experienced Ethereum developer.',
    language: 'en',
    source: 'prompts.chat',
    sourceUrl: 'https://github.com/f/prompts.chat',
    license: 'CC0-1.0',
    fetchedAt: '2026-11-15T00:00:00.000Z',
    ...overrides,
  }
}

test('the allow-list contains exactly the redistribution-safe licences', () => {
  assert.deepEqual([...ALLOWED_LICENSES].sort(), [
    'Apache-2.0',
    'BSD-3-Clause',
    'CC0-1.0',
    'ISC',
    'MIT',
  ])
})

test('isAllowedLicense accepts listed licences regardless of case or a trailing plus', () => {
  assert.equal(isAllowedLicense('CC0-1.0'), true)
  assert.equal(isAllowedLicense('cc0-1.0'), true)
  assert.equal(isAllowedLicense('  MIT  '), true)
  assert.equal(isAllowedLicense('Apache-2.0+'), true)
  assert.equal(isAllowedLicense('BSD-3-Clause'), true)
  assert.equal(isAllowedLicense('ISC'), true)
})

test('isAllowedLicense rejects GPL and unknown or missing licences', () => {
  // GPL is the important case: it would force this MIT plugin to relicense.
  assert.equal(isAllowedLicense('GPL-3.0'), false)
  assert.equal(isAllowedLicense('AGPL-3.0'), false)
  assert.equal(isAllowedLicense('NOASSERTION'), false)
  assert.equal(isAllowedLicense(''), false)
  assert.equal(isAllowedLicense('   '), false)
  assert.equal(isAllowedLicense(undefined), false)
  assert.equal(isAllowedLicense(null), false)
  assert.equal(isAllowedLicense(42), false)
})

test('normalizeRecord keeps a valid record and fills defaults', () => {
  const clean = normalizeRecord(record({ title: '', tags: undefined, category: 'nonsense' }))
  assert.equal(clean.id, 'pt-0001')
  assert.equal(clean.title, 'pt-0001', 'a missing title falls back to the id')
  assert.equal(clean.category, 'general', 'an unknown category falls back to general')
  assert.deepEqual(clean.tags, [])
  assert.equal(clean.license, 'CC0-1.0')
})

test('normalizeRecord drops a record with a disallowed licence', () => {
  // The whole point of the gate: GPL content must never reach the panel.
  assert.equal(normalizeRecord(record({ license: 'GPL-3.0' })), undefined)
  assert.equal(normalizeRecord(record({ license: '' })), undefined)
  assert.equal(normalizeRecord(record({ license: undefined })), undefined)
})

test('normalizeRecord drops a record without an id or body', () => {
  assert.equal(normalizeRecord(record({ id: '' })), undefined)
  assert.equal(normalizeRecord(record({ body: '' })), undefined)
  assert.equal(normalizeRecord(record({ body: '   ' })), undefined)
})

test('normalizeRecord caps length and strips control characters', () => {
  const clean = normalizeRecord(
    record({ title: 'x'.repeat(500), body: 'a\u0000b\u001fc', tags: Array(20).fill('tag') }),
  )
  assert.equal(clean.title.length, LIBRARY_LIMITS.maxTitleChars)
  assert.equal(clean.body, 'a b c')
  assert.equal(clean.tags.length, 1, 'duplicate tags collapse')
})

test('normalizeRecord rejects non-objects', () => {
  for (const bad of [null, undefined, 42, 'text', [], ['x']]) {
    assert.equal(normalizeRecord(bad), undefined)
  }
})

test('normalizeLibrary counts what it dropped and dedupes by id', () => {
  const { records, rejected } = normalizeLibrary([
    record({ id: 'a' }),
    record({ id: 'b' }),
    record({ id: 'a' }), // duplicate id
    record({ id: 'c', license: 'GPL-3.0' }), // licence violation
    'garbage',
  ])
  assert.equal(records.length, 2)
  assert.equal(rejected, 3)
  assert.deepEqual(records.map((r) => r.id), ['a', 'b'])
})

test('normalizeLibrary keeps the first occurrence so seed entries win', () => {
  const { records } = normalizeLibrary([
    record({ id: 'x', title: 'seed title' }),
    record({ id: 'x', title: 'remote title' }),
  ])
  assert.equal(records.length, 1)
  assert.equal(records[0].title, 'seed title')
})

test('normalizeLibrary tolerates a non-array', () => {
  assert.deepEqual(normalizeLibrary(undefined), { records: [], rejected: 0 })
  assert.deepEqual(normalizeLibrary(null), { records: [], rejected: 0 })
  assert.deepEqual(normalizeLibrary({}), { records: [], rejected: 0 })
})

test('searchLibrary matches on title, body and tags', () => {
  const records = normalizeLibrary([
    record({ id: 'a', title: 'Translator', body: 'translate text', tags: ['language'] }),
    record({ id: 'b', title: 'Farmer', body: 'advise on crops', tags: ['land'] }),
  ]).records

  assert.equal(searchLibrary(records, { query: 'translator' }).length, 1)
  assert.equal(searchLibrary(records, { query: 'crops' }).length, 1)
  assert.equal(searchLibrary(records, { query: 'land' }).length, 1)
  assert.equal(searchLibrary(records, { query: 'zzz' }).length, 0)
  assert.equal(searchLibrary(records, { query: '' }).length, 2)
})

test('searchLibrary requires every word to match', () => {
  const records = normalizeLibrary([record({ id: 'a', title: 'code helper', body: 'python advice' })]).records
  assert.equal(searchLibrary(records, { query: 'code python' }).length, 1)
  assert.equal(searchLibrary(records, { query: 'code rust' }).length, 0)
})

test('searchLibrary filters by category and favourites', () => {
  const records = normalizeLibrary([
    record({ id: 'a', category: 'code' }),
    record({ id: 'b', category: 'writing' }),
  ]).records

  assert.equal(searchLibrary(records, { category: 'code' }).length, 1)
  assert.equal(searchLibrary(records, { category: 'all' }).length, 2)
  assert.equal(searchLibrary(records, { category: 'nonsense' }).length, 0)
  assert.equal(searchLibrary(records, { savedOnly: true, saved: ['a'] }).length, 1)
  assert.equal(searchLibrary(records, { savedOnly: true, saved: [] }).length, 0)
})

test('searchLibrary tolerates malformed input', () => {
  assert.deepEqual(searchLibrary(undefined), [])
  assert.deepEqual(searchLibrary(null), [])
  assert.deepEqual(searchLibrary([null, 42, 'x', undefined]), [])
})

test('findRecord returns the matching record or undefined', () => {
  const records = normalizeLibrary([record({ id: 'a' }), record({ id: 'b' })]).records
  assert.equal(findRecord(records, 'b').id, 'b')
  assert.equal(findRecord(records, 'zzz'), undefined)
  assert.equal(findRecord(undefined, 'a'), undefined)
  assert.equal(findRecord(records, 42), undefined)
})

test('toggleSaved adds, removes and caps the list', () => {
  assert.deepEqual(toggleSaved([], 'a'), ['a'])
  assert.deepEqual(toggleSaved(['a'], 'a'), [])
  assert.deepEqual(toggleSaved(['a'], 'b'), ['b', 'a'], 'newest first')

  let saved = []
  for (let i = 0; i < LIBRARY_LIMITS.maxSaved + 10; i += 1) saved = toggleSaved(saved, `id-${i}`)
  assert.equal(saved.length, LIBRARY_LIMITS.maxSaved)
})

test('toggleSaved ignores unusable ids and non-array input', () => {
  assert.deepEqual(toggleSaved([], ''), [])
  assert.deepEqual(toggleSaved([], 42), [])
  assert.deepEqual(toggleSaved(undefined, 'a'), ['a'])
  assert.deepEqual(toggleSaved(['a', 42, null], 'b'), ['b', 'a'])
})

test('countByCategory counts every category and the total', () => {
  const records = normalizeLibrary([
    record({ id: 'a', category: 'code' }),
    record({ id: 'b', category: 'code' }),
    record({ id: 'c', category: 'writing' }),
  ]).records

  const counts = countByCategory(records)
  assert.equal(counts.all, 3)
  assert.equal(counts.code, 2)
  assert.equal(counts.writing, 1)
  for (const category of CATEGORIES) {
    assert.equal(typeof counts[category], 'number', `${category} must be present`)
  }
})

test('countByCategory tolerates malformed input', () => {
  const counts = countByCategory(undefined)
  assert.equal(counts.all, 0)
  assert.equal(counts.code, 0)
})
