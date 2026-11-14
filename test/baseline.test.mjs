/**
 * Tests for the baseline runner and its summary maths.
 *
 * The runner never calls a model, so it can be tested exactly: feed it fixed
 * outputs and assert the aggregate figures. If this drifted, every baseline and
 * every later comparison would be wrong in the same silent direction.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { runBaseline, summarise, toMarkdown } from './lib/baseline.mjs'
import { checkFidelity } from './lib/evaluate.mjs'

const CASES = [
  {
    id: 'a1',
    category: 'short-wish',
    input: '做个PPT',
    expect: { maxPlaceholders: 2 },
  },
  {
    id: 'a2',
    category: 'short-wish',
    input: '写个方案',
    expect: { maxPlaceholders: 2 },
  },
  {
    id: 'b1',
    category: 'entity-heavy',
    input: 'Q1 收入 1280 万',
    expect: { maxPlaceholders: 2 },
  },
]

const GOOD =
  '请制作一份面向公司内部同事的 PPT，共 10 页，格式简洁，要求重点突出，目标是季度汇报。[默认：10 页，可改]'
const GOOD_PLAN =
  '请撰写一份实施方案文档，面向部门同事，包含背景、目标、步骤与风险，篇幅约 2000 字。[默认：2000 字，可改]'

test('runBaseline scores covered cases and lists the missing ones', () => {
  const { results, missing } = runBaseline(CASES, { a1: GOOD, a2: GOOD_PLAN })
  assert.equal(results.length, 2)
  assert.deepEqual(missing, ['b1'])
})

test('runBaseline ignores empty or non-string outputs', () => {
  const { results, missing } = runBaseline(CASES, { a1: '   ', a2: null, b1: GOOD_PLAN })
  assert.equal(results.length, 1)
  assert.equal(results[0].id, 'b1')
  assert.deepEqual(missing.sort(), ['a1', 'a2'])
})

test('summarise reports per-category means and overall rates', () => {
  const { results } = runBaseline(CASES, { a1: GOOD, a2: GOOD_PLAN, b1: GOOD_PLAN })
  const summary = summarise(results)

  assert.equal(summary.overall.count, 3)
  assert.equal(summary.categories['short-wish'].count, 2)
  assert.equal(summary.categories['entity-heavy'].count, 1)
  assert.ok(summary.overall.meanScore > 0)
  assert.ok(summary.overall.fidelityRate <= 1 && summary.overall.fidelityRate >= 0)
})

test('summarise counts a fidelity failure in the fidelity rate', () => {
  // b1 requires 1280; this output changes it, so fidelity must fail.
  const wrong = '请分析 Q1 收入 1300 万的月度报告，面向管理层，包含图表与结论。[默认：Markdown，可改]'
  const { results } = runBaseline(CASES, { a1: GOOD, a2: GOOD_PLAN, b1: wrong })
  const summary = summarise(results)
  assert.equal(summary.categories['entity-heavy'].fidelityRate, 0)
  assert.equal(summary.overall.fidelityRate, Number((2 / 3).toFixed(3)))
})

test('toMarkdown renders every category and the overall row', () => {
  const { results } = runBaseline(CASES, { a1: GOOD, a2: GOOD_PLAN, b1: GOOD_PLAN })
  const markdown = toMarkdown(summarise(results), 'v1.5.4-proxy')
  assert.match(markdown, /基线报告：v1\.5\.4-proxy/)
  assert.match(markdown, /short-wish/)
  assert.match(markdown, /entity-heavy/)
  assert.match(markdown, /\*\*全部\*\*/)
})

test('the extended entity-heavy set has 12 cases with unique ids', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/entity-heavy-cases.json', import.meta.url), 'utf8'))
  assert.equal(cases.length, 12)
  assert.equal(new Set(cases.map((c) => c.id)).size, 12)
  assert.ok(cases.every((c) => c.category === 'entity-heavy'))
})

test('fidelity catches a dropped version number and a changed decimal', () => {
  const source = '把 v1.4.2 升级到 v2.0.0，超时 3000 毫秒'
  assert.equal(checkFidelity(source, '把 v1.4.2 升级到 v2.0.0，超时 3000 毫秒').pass, true)
  assert.equal(checkFidelity(source, '把 v1.4.2 升级到 v2.0.0，超时 4000 毫秒').pass, false)
})
