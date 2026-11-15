/**
 * Tests for the built-in seed library.
 *
 * The seed is the offline fallback, so its integrity matters more than its size:
 * every record must survive the licence gate, ids must be unique, and every
 * category must have something in it or the panel renders an empty tab.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { getSeedRecords, SEED_RECORDS } from '../lib/seed.js'
import { CATEGORIES, countByCategory, isAllowedLicense, normalizeLibrary } from '../lib/wishlist.js'

test('the seed is not empty and stays a sensible size to ship', () => {
  assert.ok(SEED_RECORDS.length >= 12, `expected a usable seed, got ${SEED_RECORDS.length}`)
  assert.ok(SEED_RECORDS.length <= 100, 'the seed must stay small enough to ship')
})

test('every seed record passes the licence gate', () => {
  // A seed entry with a bad licence would ship illegal content, so this is the
  // most important assertion in the file.
  const { records, rejected } = normalizeLibrary(SEED_RECORDS)
  assert.equal(rejected, 0, 'no seed record may be rejected')
  assert.equal(records.length, SEED_RECORDS.length)
  for (const record of records) {
    assert.equal(record.license, 'CC0-1.0')
    assert.equal(isAllowedLicense(record.license), true)
  }
})

test('every seed record carries provenance', () => {
  for (const record of SEED_RECORDS) {
    assert.ok(record.source !== '', `${record.id} needs a source`)
    assert.match(record.sourceUrl, /^https:\/\//, `${record.id} needs a source URL`)
    assert.ok(record.fetchedAt !== '', `${record.id} needs a fetchedAt`)
  }
})

test('seed ids are unique', () => {
  const ids = SEED_RECORDS.map((record) => record.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('every category has at least one seed entry', () => {
  const counts = countByCategory(SEED_RECORDS)
  for (const category of CATEGORIES) {
    assert.ok(counts[category] >= 1, `category ${category} has no seed entry`)
  }
})

test('every seed body is substantial enough to serve as an example', () => {
  for (const record of SEED_RECORDS) {
    // Chinese packs more information per character than English, so the bar is
    // lower than it was for the English seed — but still high enough that a
    // one-line stub cannot pass.
    assert.ok(record.body.length >= 40, `${record.id} body is too thin (${record.body.length} chars)`)
  }
})

test('every seed entry is written in Chinese', () => {
  // The library is Chinese-only by request. An English body is useless to the
  // user browsing it, so a stray English entry is a defect, not a variation.
  for (const record of SEED_RECORDS) {
    assert.equal(record.language, 'zh', `${record.id} must be tagged zh`)
    assert.match(record.body, /[\u4e00-\u9fff]/, `${record.id} has no Chinese text`)
  }
  for (const record of SEED_RECORDS) {
    assert.match(record.title, /[\u4e00-\u9fff]/, `${record.id} title has no Chinese text`)
  }
})

test('getSeedRecords returns a copy that a caller cannot use to mutate the seed', () => {
  const first = getSeedRecords()
  first[0].title = 'mutated'
  first[0].tags.push('injected')
  const second = getSeedRecords()
  assert.notEqual(second[0].title, 'mutated')
  assert.equal(second[0].tags.includes('injected'), false)
})

test('the deck standards express checklists, never a persona', () => {
  // Three entries were added after a user asked whether prompts should open with
  // "you are an experienced X master". They must stay verifiable, in Chinese.
  const deck = SEED_RECORDS.filter((record) => record.tags.includes('演示稿') || record.title.includes('演示稿'))
  assert.ok(deck.length >= 3, `expected at least 3 deck references, got ${deck.length}`)
  for (const record of deck) {
    assert.equal(/你是一位|你是一名|You are an? /i.test(record.body), false, `${record.id} uses persona phrasing`)
    // Must read as an instruction with measurable limits, not a mood.
    assert.match(
      record.body,
      /最多|至少|不超过|不要|逐条|清单|规则|页码/,
      `${record.id} is not verifiable`,
    )
  }
})

test('the design category now has enough references to be useful', () => {
  const count = SEED_RECORDS.filter((record) => record.category === 'design').length
  assert.ok(count >= 6, `expected at least 6 design entries, got ${count}`)
})

test('README states the real seed count', () => {
  // The count in the docs is written by hand, so a rule or seed change could
  // leave it wrong with nothing to catch it. Only the seed number is asserted:
  // the test count in that file changes every release and would make this
  // brittle for no benefit.
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  const stated = [...readme.matchAll(/内置\s*(\d+)\s*条/g)].map((match) => Number(match[1]))
  assert.ok(stated.length > 0, 'README must state the seed count')
  for (const value of stated) {
    assert.equal(value, SEED_RECORDS.length, `README says ${value}, seed has ${SEED_RECORDS.length}`)
  }
})