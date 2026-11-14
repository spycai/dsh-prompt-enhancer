/**
 * Tests for the deterministic evaluators.
 *
 * These assert the evaluator's own behaviour, not any model's output: a broken
 * evaluator would make every later baseline and every "improvement" meaningless,
 * so it is validated against hand-written good and bad samples first.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  checkCompleteness,
  checkConcision,
  checkDefaultMarkers,
  checkFidelity,
  checkPlaceholderTargeting,
  checkSendability,
  extractEntities,
  scoreOutput,
} from './lib/evaluate.mjs'

test('extractEntities finds urls, mentions, files, percents and dates', () => {
  const found = extractEntities(
    '参考 https://example.com/pricing 和 README.md，给 @张三 看，增长 3.5%，截至 2026-11-14。',
  )
  const values = found.map((entity) => entity.value)
  assert.ok(values.includes('https://example.com/pricing'))
  assert.ok(values.includes('README.md'))
  assert.ok(values.includes('@张三'))
  assert.ok(values.includes('3.5%'))
  assert.ok(values.includes('2026-11-14'))
})

test('extractEntities does not report the digits inside a url as separate numbers', () => {
  const found = extractEntities('见 https://example.com/v2/12345')
  const numbers = found.filter((entity) => entity.kind === 'number')
  assert.equal(numbers.length, 0, 'url digits must be masked out')
})

test('checkFidelity fails when a number is dropped or changed', () => {
  const source = 'Q1 收入 1280 万，Q2 收入 1450 万'
  assert.equal(checkFidelity(source, '分析 Q1 收入 1280 万和 Q2 收入 1450 万').pass, true)
  assert.equal(checkFidelity(source, '分析 Q1 收入 1280 万').pass, false, 'dropped 1450 must fail')
  assert.equal(checkFidelity(source, '分析 Q1 收入 1300 万和 Q2 收入 1450 万').pass, false, 'changed number must fail')
})

test('checkFidelity accepts whitespace differences inside a chinese date', () => {
  const result = checkFidelity('2026年11月的数据', '整理 2026 年 11 月的数据')
  assert.equal(result.pass, true, 'spacing is not a fact change')
})

test('checkSendability counts placeholders and enforces the limit', () => {
  assert.equal(checkSendability('做一份 [请补充：主题] 的 PPT').count, 1)
  assert.equal(checkSendability('做一份 PPT').pass, true)
  const three = checkSendability('[请补充：a] [请补充：b] [请补充：c]', 2)
  assert.equal(three.pass, false)
  assert.equal(three.count, 3)
})

test('checkCompleteness requires goal and deliverable even at high coverage', () => {
  const good = checkCompleteness(
    '请制作一份面向公司内部同事的 PPT，共 10 页，格式简洁，要求突出重点，目标是对齐季度计划。',
  )
  assert.equal(good.pass, true)

  const noDeliverable = checkCompleteness('目标是让团队理解，要求清晰，格式规范，面向同事，避免术语。')
  assert.equal(noDeliverable.pass, false, 'deliverable is mandatory')
})

test('checkConcision rejects boilerplate even when the ratio is fine', () => {
  const padded = checkConcision('做个PPT', '作为一个AI语言模型，请制作一份 PPT。')
  assert.equal(padded.pass, false)
  assert.ok(padded.boilerplate.length > 0)
})

test('checkConcision rejects a rewrite that only echoed the draft', () => {
  const echoed = checkConcision('做个PPT做个PPT', '做个PPT')
  assert.equal(echoed.ratio < 1, true)
  assert.equal(echoed.pass, false)
})

test('checkDefaultMarkers detects both locales', () => {
  assert.equal(checkDefaultMarkers('[默认：Chrome 扩展 + Manifest V3，可改]').markers, 1)
  assert.equal(checkDefaultMarkers('[default: Markdown, editable]').markers, 1)
  assert.equal(checkDefaultMarkers('没有任何标注的文本').pass, false)
})

test('checkPlaceholderTargeting flags a forbidden question', () => {
  const testCase = {
    input: '用 React 写个 TODO',
    expect: { mustNotAsk: ['用什么框架'] },
  }
  const bad = checkPlaceholderTargeting(testCase, '请实现 TODO。[请补充：用什么框架？]')
  assert.equal(bad.pass, false)
  assert.deepEqual(bad.forbiddenAsks, ['用什么框架'])

  const good = checkPlaceholderTargeting(testCase, '请用 React 实现 TODO，[默认：函数组件，可改]。')
  assert.equal(good.pass, true)
})

test('scoreOutput never exceeds the deterministic maximum', () => {
  const testCase = {
    id: 'x',
    category: 'test',
    input: '做个PPT',
    expect: { maxPlaceholders: 2 },
  }
  const perfect =
    '请制作一份面向公司内部同事的 PPT，共 10 页，格式简洁，要求重点突出，目标是季度汇报。[默认：10 页，可改]'
  const result = scoreOutput(testCase, perfect)
  assert.ok(result.score <= result.deterministicMax, `score ${result.score} exceeded max ${result.deterministicMax}`)
  assert.ok(result.score >= 0)
})

test('scoreOutput gives a low score to a padded non-answer', () => {
  const testCase = { id: 'y', category: 'test', input: '做个PPT', expect: { maxPlaceholders: 2 } }
  const result = scoreOutput(testCase, '作为一个AI语言模型，这是一个很好的问题。')
  assert.ok(result.score < 30, `expected a low score, got ${result.score}`)
})
