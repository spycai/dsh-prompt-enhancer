/**
 * Tests for the before/after comparison used as the prompt-change gate.
 *
 * The gate is the only thing standing between "I improved the prompt" and a
 * silent quality drop, so its verdict logic is tested directly rather than
 * trusted.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { compareSummaries, runBaseline, summarise } from './lib/baseline.mjs'

const BASE = {
  count: 40,
  meanScore: 50.9,
  fidelityRate: 1,
  completenessRate: 0.625,
  sendabilityRate: 1,
  targetingRate: 0.975,
  concisionRate: 1,
  defaultRate: 0.775,
}

test('an identical run reports no change', () => {
  const verdict = compareSummaries(BASE, { ...BASE })
  assert.equal(verdict.pass, true)
  assert.deepEqual(verdict.regressions, [])
  assert.deepEqual(verdict.improvements, [])
})

test('an improvement is reported and passes', () => {
  const verdict = compareSummaries(BASE, { ...BASE, meanScore: 54, completenessRate: 0.9, defaultRate: 1 })
  assert.equal(verdict.pass, true)
  assert.ok(verdict.improvements.some((line) => line.startsWith('meanScore')))
  assert.ok(verdict.improvements.some((line) => line.startsWith('completenessRate')))
})

test('a mean score drop fails even when every rate holds', () => {
  const verdict = compareSummaries(BASE, { ...BASE, meanScore: 49 })
  assert.equal(verdict.pass, false)
  assert.ok(verdict.regressions.some((line) => line.startsWith('meanScore')))
})

test('a fidelity drop fails immediately, with no tolerance', () => {
  const verdict = compareSummaries(BASE, { ...BASE, fidelityRate: 0.975 })
  assert.equal(verdict.pass, false)
  assert.ok(verdict.regressions.some((line) => line.startsWith('fidelityRate')))
})

test('a small drop inside the tolerance is not a regression', () => {
  const verdict = compareSummaries(BASE, { ...BASE, completenessRate: 0.61 })
  assert.equal(verdict.pass, true, 'a 1.5pt drop is within the 2pt tolerance')
})

test('a drop beyond the tolerance is a regression', () => {
  const verdict = compareSummaries(BASE, { ...BASE, completenessRate: 0.55 })
  assert.equal(verdict.pass, false)
  assert.ok(verdict.regressions.some((line) => line.startsWith('completenessRate')))
})

test('the committed recorded runs can be compared without any 产出/ report', () => {
  // M-2 regression: CI must work from a fresh clone where generated reports
  // under 产出/ do not exist. Both inputs here are committed fixtures.
  const cases = JSON.parse(readFileSync(new URL('./fixtures/wish-cases.json', import.meta.url), 'utf8'))
  const before = JSON.parse(
    readFileSync(new URL('./fixtures/recorded/v1.5.4-proxy.json', import.meta.url), 'utf8'),
  )
  const after = JSON.parse(
    readFileSync(new URL('./fixtures/recorded/v1.5.5-proxy.json', import.meta.url), 'utf8'),
  )

  const oldRun = runBaseline(cases, before)
  const newRun = runBaseline(cases, after)
  assert.deepEqual(oldRun.missing, [])
  assert.deepEqual(newRun.missing, [])

  const verdict = compareSummaries(
    summarise(oldRun.results).overall,
    summarise(newRun.results).overall,
  )
  assert.equal(verdict.pass, true, 'v1.5.5 must not regress against v1.5.4')
  assert.ok(verdict.improvements.length > 0)
})
