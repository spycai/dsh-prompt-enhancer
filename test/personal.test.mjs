/**
 * Tests for the user's own prompt library.
 *
 * These records are the only ones that cannot be re-fetched, so the tests focus
 * on the two ways they could be lost: a bad write, and a refresh clobbering them.
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  PERSONAL_LIMITS,
  PERSONAL_VERSION,
  appendPersonal,
  buildPersonalRecord,
  deriveTitle,
  personalPathFor,
  readPersonal,
  sanitizeTitle,
  removePersonal,
  writePersonal,
} from '../lib/personal.js'

/** Create a throwaway profile directory. */
function tempProfile() {
  return mkdtempSync(join(tmpdir(), 'wt-personal-'))
}

test('the personal file lives under the profile, beside the cache', () => {
  const path = personalPathFor('C:/profiles/desktop').replace(/\\/g, '/')
  assert.match(path, /profiles\/desktop\/\.dsh-wish-tree\/personal\.json$/)
  // Distinct from library.json so a refresh can never overwrite it.
  assert.equal(path.includes('library.json'), false)
})

test('write then read round-trips a record', () => {
  const dir = tempProfile()
  try {
    const record = buildPersonalRecord({ body: '请制作一份面向同事的季度复盘PPT。' })
    assert.ok(record !== undefined)
    assert.equal(writePersonal(dir, [record]), true)
    const read = readPersonal(dir)
    assert.equal(read.length, 1)
    assert.equal(read[0].body, record.body)
    assert.equal(read[0].source, '个人')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a missing or corrupt file reads as an empty list', () => {
  const dir = tempProfile()
  try {
    assert.deepEqual(readPersonal(dir), [])
    mkdirSync(join(dir, '.dsh-wish-tree'), { recursive: true })
    writeFileSync(personalPathFor(dir), 'not json', 'utf8')
    assert.deepEqual(readPersonal(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a file from another schema version is discarded', () => {
  const dir = tempProfile()
  try {
    mkdirSync(join(dir, '.dsh-wish-tree'), { recursive: true })
    writeFileSync(personalPathFor(dir), JSON.stringify({ version: PERSONAL_VERSION + 1, records: [{}] }), 'utf8')
    assert.deepEqual(readPersonal(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('buildPersonalRecord refuses an empty body', () => {
  assert.equal(buildPersonalRecord({ body: '' }), undefined)
  assert.equal(buildPersonalRecord({ body: '   ' }), undefined)
  assert.equal(buildPersonalRecord({}), undefined)
  assert.equal(buildPersonalRecord(undefined), undefined)
})

test('buildPersonalRecord refuses an oversized body', () => {
  assert.equal(buildPersonalRecord({ body: 'x'.repeat(PERSONAL_LIMITS.maxBodyChars + 1) }), undefined)
})

test('an explicit title is kept, otherwise one is derived', () => {
  const named = buildPersonalRecord({ title: '季度复盘', body: '请制作一份PPT。' })
  assert.equal(named.title, '季度复盘')
  const derived = buildPersonalRecord({ body: '请制作一份面向同事的季度复盘PPT。' })
  assert.match(derived.title, /制作一份/)
  assert.equal(derived.title.length <= 41, true)
})

test('deriveTitle never returns an empty string', () => {
  assert.equal(deriveTitle(''), '我的提示词')
  assert.equal(deriveTitle('\n\n'), '我的提示词')
  assert.equal(deriveTitle(undefined), '我的提示词')
})

test('appendPersonal puts the newest first', () => {
  const first = buildPersonalRecord({ body: '第一条内容' })
  const second = buildPersonalRecord({ body: '第二条内容' }, '2026-11-15T10:00:00.000Z')
  const result = appendPersonal([first], second)
  assert.equal(result.added, true)
  assert.equal(result.records[0].body, '第二条内容')
})

test('an identical body is refused as a duplicate', () => {
  // Pressing save twice usually means "did it work", not "I want two copies".
  const record = buildPersonalRecord({ body: '同样的正文内容' })
  const result = appendPersonal([record], { ...record, id: 'other' })
  assert.equal(result.added, false)
  assert.equal(result.reason, 'duplicate')
  assert.equal(result.records.length, 1)
})

test('the library refuses to grow past its cap', () => {
  const full = Array.from({ length: PERSONAL_LIMITS.maxRecords }, (_, index) => ({
    id: `x-${String(index)}`,
    body: `内容 ${String(index)}`,
  }))
  const result = appendPersonal(full, { id: 'new', body: '新的内容' })
  assert.equal(result.added, false)
  assert.equal(result.reason, 'full')
})

test('appendPersonal tolerates malformed input', () => {
  assert.deepEqual(appendPersonal(undefined, undefined), { records: [], added: false, reason: 'invalid' })
  const { records } = appendPersonal([null, 42], { id: 'a', body: 'b' })
  assert.equal(records.length, 1)
})

test('removePersonal drops exactly one id', () => {
  const records = [{ id: 'a', body: '1' }, { id: 'b', body: '2' }]
  assert.deepEqual(removePersonal(records, 'a').map((r) => r.id), ['b'])
  assert.equal(removePersonal(records, 'missing').length, 2)
  assert.equal(removePersonal(records, '').length, 2)
  assert.deepEqual(removePersonal(undefined, 'a'), [])
})

test('deriveTitle never eats the first real character', () => {
  // Regression: a character class stripped 我/请/帮/为/给 anywhere at the start,
  // so 「我的私人提示词内容」came back as 「的私人提示词内容」.
  assert.equal(deriveTitle('我的私人提示词内容'), '我的私人提示词内容')
  assert.equal(deriveTitle('为团队写方案'), '为团队写方案')
  // Whole words are still stripped, longest first.
  assert.equal(deriveTitle('请帮我写一封邮件'), '写一封邮件')
  assert.equal(deriveTitle('请制作一份PPT'), '制作一份PPT')
})

test('sanitizeTitle strips markers and never returns empty', () => {
  assert.equal(sanitizeTitle('制作一份PPT，不超过12页。[请补充：季度]'), '制作一份PPT，不超过12页')
  assert.equal(sanitizeTitle('请制作 PPT。[默认：16:9，可改]'), '请制作 PPT')
  assert.equal(sanitizeTitle(''), '我的提示词')
  assert.equal(sanitizeTitle('[请补充：主题]'), '我的提示词')
})

test('a saved record carries a clean title', () => {
  const record = buildPersonalRecord({ body: '请制作一份PPT，不超过12页。[请补充：季度]' })
  assert.equal(record.title.includes('[请补充'), false, 'the placeholder must not leak into the title')
  assert.equal(record.title.includes('默认'), false)
})