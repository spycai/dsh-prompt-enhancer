/**
 * Tests for placeholder handling and the output self-check.
 *
 * These cover the piece that turns a generated prompt from "a draft with blanks"
 * into "something you can send": extraction, filling, and the four-element check
 * that tells the user what the prompt is still missing.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  checkPromptElements,
  countPlaceholders,
  extractDefaults,
  extractPlaceholders,
  replaceDefaultItem,
  fillPlaceholders,
  stripDefaultMarkers,
} from '../lib/placeholders.js'

test('extracts a placeholder with its label', () => {
  const found = extractPlaceholders('请制作一份关于 [请补充：汇报主题] 的PPT')
  assert.equal(found.length, 1)
  assert.equal(found[0].label, '汇报主题')
  assert.equal(found[0].token, '[请补充：汇报主题]')
})

test('accepts a half-width colon as well', () => {
  const found = extractPlaceholders('[请补充: 日期]')
  assert.equal(found[0].label, '日期')
})

test('merges repeated labels into one blank', () => {
  // Two mentions of the same fact are one thing to fill, and filling it must
  // replace every occurrence.
  const found = extractPlaceholders('[请补充：日期] 开始，[请补充：日期] 结束')
  assert.equal(found.length, 1)
  assert.equal(found[0].label, '日期')
})

test('keeps placeholders in first-seen order', () => {
  const found = extractPlaceholders('[请补充：甲] 和 [请补充：乙] 和 [请补充：丙]')
  assert.deepEqual(found.map((item) => item.label), ['甲', '乙', '丙'])
})

test('ignores default markers, which are information not blanks', () => {
  const text = '请制作 PPT。[默认：简体中文、16:9，可改] 主题是 [请补充：主题]'
  assert.deepEqual(extractPlaceholders(text).map((item) => item.label), ['主题'])
})

test('tolerates text with no placeholders and unusable input', () => {
  assert.deepEqual(extractPlaceholders('一份完整的提示词，没有占位符'), [])
  assert.deepEqual(extractPlaceholders(''), [])
  assert.deepEqual(extractPlaceholders(undefined), [])
  assert.deepEqual(extractPlaceholders(null), [])
  assert.deepEqual(extractPlaceholders(42), [])
})

test('fills a placeholder with the typed value', () => {
  const filled = fillPlaceholders('做一份关于 [请补充：主题] 的PPT', { 主题: '季度复盘' })
  assert.equal(filled, '做一份关于 季度复盘 的PPT')
})

test('fills every occurrence of a repeated label', () => {
  const filled = fillPlaceholders('[请补充：日期] 到 [请补充：日期]', { 日期: '3月1日' })
  assert.equal(filled, '3月1日 到 3月1日')
})

test('an empty answer keeps the bracket instead of leaving a hole', () => {
  // Better a visible marker than a sentence with a gap the user cannot see.
  const text = '截止 [请补充：日期]'
  assert.equal(fillPlaceholders(text, { 日期: '' }), text)
  assert.equal(fillPlaceholders(text, { 日期: '   ' }), text)
  assert.equal(fillPlaceholders(text, {}), text)
})

test('fillPlaceholders tolerates unusable input', () => {
  assert.equal(fillPlaceholders('', { a: 'b' }), '')
  assert.equal(fillPlaceholders(undefined, {}), undefined)
  assert.equal(fillPlaceholders('原文', null), '原文')
})

test('countPlaceholders reports how many blanks remain', () => {
  assert.equal(countPlaceholders('没有空白'), 0)
  assert.equal(countPlaceholders('[请补充：甲] 和 [请补充：乙]'), 2)
  // Merged labels count once, matching what the form shows.
  assert.equal(countPlaceholders('[请补充：甲] 又 [请补充：甲]'), 1)
})

test('the four-element check passes a well-formed prompt', () => {
  const text =
    '请制作一份面向公司同事的季度复盘PPT，不超过 12 页，输出为可编辑的 .pptx 文件，每页一个结论。'
  const result = checkPromptElements(text)
  assert.equal(result.goal, true, 'the opening verb marks a goal')
  assert.equal(result.format, true, '.pptx marks a deliverable')
  assert.equal(result.audience, true, '面向公司同事 names the reader')
  assert.equal(result.constraint, true, '不超过 marks a limit')
  assert.deepEqual(result.missing, [])
})

test('the four-element check names what is absent', () => {
  const result = checkPromptElements('帮我做一份PPT')
  assert.equal(result.format, true, 'PPT is a deliverable')
  assert.deepEqual(result.missing, ['受众', '主要约束'])
})

test('the four-element check reports everything missing for empty input', () => {
  const result = checkPromptElements('')
  assert.deepEqual(result.missing, ['目标', '交付格式', '受众', '主要约束'])
})

test('the four-element check never throws', () => {
  for (const value of [undefined, null, 42, {}, []]) {
    const result = checkPromptElements(value)
    assert.ok(Array.isArray(result.missing))
  }
})

test('stripDefaultMarkers removes defaults and tidies the text', () => {
  const text = '请制作一份 PPT，[默认：简体中文、16:9、10~12 页，可改] 主题是季度复盘。'
  const cleaned = stripDefaultMarkers(text)
  assert.equal(cleaned.includes('默认'), false, 'the marker is gone')
  assert.equal(cleaned.includes('季度复盘'), true, 'the content survives')
  assert.doesNotMatch(cleaned, / {2,}/, 'no double spaces left behind')
})

test('stripDefaultMarkers leaves placeholders alone', () => {
  const text = '主题是 [请补充：主题]。[默认：中文，可改]'
  const cleaned = stripDefaultMarkers(text)
  assert.match(cleaned, /\[请补充：主题\]/, 'a blank is a task, not a default')
  assert.equal(cleaned.includes('默认'), false)
})

test('stripDefaultMarkers tolerates unusable input', () => {
  assert.equal(stripDefaultMarkers(''), '')
  assert.equal(stripDefaultMarkers(undefined), undefined)
})

test('the self-check no longer reports countable sizes as missing', () => {
  // Regression: 「200字」「一段」are formats in ordinary speech. Reporting them as
  // missing tells the user their prompt is broken when it is merely short.
  const selfIntro = checkPromptElements('请写一段自我介绍，200字左右')
  assert.equal(selfIntro.format, true, '一段 and 200字 both count as a format')
  assert.equal(selfIntro.constraint, true, '左右 counts as a limit')

  const weekly = checkPromptElements('要一份周报')
  assert.equal(weekly.goal, true, '要 counts as a goal verb')
  assert.equal(weekly.format, true, '周报 is a deliverable')
})

test('the self-check still reports a genuinely empty request', () => {
  const empty = checkPromptElements('随便什么')
  assert.deepEqual(empty.missing, ['目标', '交付格式', '受众', '主要约束'])
})
// --- v1.9.1: editable defaults ----------------------------------------------

test('defaults are extracted and split into individual choices', () => {
  // Rule 4 writes `[默认：…，可改]`, which promises the user can change them. The
  // panel had no way to keep that promise until the items were parsed out.
  const found = extractDefaults('做一份PPT。[默认：简体中文、16:9 版式、10~12 页、可改] 主题是X。')
  assert.equal(found.length, 1)
  assert.deepEqual(found[0].items, ['简体中文', '16:9 版式', '10~12 页'])
  // The trailing 「可改」 is a flag, not a value.
  assert.equal(found[0].items.includes('可改'), false)
})

test('defaults without the changeable suffix still parse', () => {
  const found = extractDefaults('[默认：中文]')
  assert.deepEqual(found[0].items, ['中文'])
})

test('several default markers are returned separately', () => {
  const found = extractDefaults('[默认：中文，可改] 正文 [默认：A4 纸，可改]')
  assert.equal(found.length, 2)
  assert.deepEqual(found[0].items, ['中文'])
  assert.deepEqual(found[1].items, ['A4 纸'])
})

test('a prompt with no defaults yields none', () => {
  for (const text of ['没有默认标注', '', undefined, null, 42]) {
    assert.deepEqual(extractDefaults(text), [])
  }
})

test('replacing one item leaves the rest of the marker intact', () => {
  const text = '[默认：简体中文、16:9 版式、10~12 页、可改]'
  const next = replaceDefaultItem(text, '10~12 页', '6 页')
  assert.equal(next, '[默认：简体中文、16:9 版式、6 页，可改]')
  assert.equal(next.includes('简体中文'), true)
  assert.equal(next.includes('16:9'), true)
  assert.equal(next.includes('可改'), true, 'it must still read as changeable')
})

test('replacing an unknown item changes nothing', () => {
  const text = '[默认：中文、16:9，可改]'
  assert.equal(replaceDefaultItem(text, '不存在', 'X'), text)
})

test('replaceDefaultItem tolerates unusable arguments', () => {
  assert.equal(replaceDefaultItem('', 'a', 'b'), '')
  assert.equal(replaceDefaultItem('原文', '', 'b'), '原文')
  assert.equal(replaceDefaultItem('原文', 'a', ''), '原文')
  assert.equal(replaceDefaultItem('原文', 'a', '   '), '原文')
})