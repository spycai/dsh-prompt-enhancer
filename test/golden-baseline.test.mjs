/**
 * Golden baseline gate.
 *
 * Locks two recorded runs so three different regressions become CI failures:
 *
 *  - the evaluator drifts (a regex loosened or tightened) and silently changes
 *    what "pass" means for every future comparison;
 *  - the v1.5.5 prompt change loses the ground it gained over v1.5.4;
 *  - a new recording loses ground against the reference.
 *
 * Recorded outputs are frozen text, so this cannot detect a prompt change by
 * itself: it detects that the SCORE of a known-good run moved. Re-record with
 * the same protocol and update the reference deliberately.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { runBaseline, summarise } from './lib/baseline.mjs'

const CASES = JSON.parse(readFileSync(new URL('./fixtures/wish-cases.json', import.meta.url), 'utf8'))
const V154 = JSON.parse(readFileSync(new URL('./fixtures/recorded/v1.5.4-proxy.json', import.meta.url), 'utf8'))
const V155 = JSON.parse(readFileSync(new URL('./fixtures/recorded/v1.5.5-proxy.json', import.meta.url), 'utf8'))

/**
 * Reference figures for the v1.5.4 run, measured with the CURRENT evaluator.
 * Update only together with a deliberate re-recording; see the baseline report.
 */
const REFERENCE = {
  count: 40,
  meanScore: 51.6,
  fidelityRate: 1,
  completenessRate: 0.7,
  sendabilityRate: 1,
  targetingRate: 0.975,
  concisionRate: 1,
  defaultRate: 0.775,
}

/** What the v1.5.5 prompt change must not lose. */
const CURRENT_MINIMUMS = {
  meanScore: 55.9,
  completenessRate: 0.825,
  defaultRate: 1,
  fidelityRate: 1,
}

test('the fixture set and the recorded runs cover the same 40 cases', () => {
  for (const run of [V154, V155]) {
    const { results, missing } = runBaseline(CASES, run)
    assert.deepEqual(missing, [], 'every fixture must have a recorded output')
    assert.equal(results.length, REFERENCE.count)
  }
})

test('the evaluator reproduces the v1.5.4 reference exactly', () => {
  const summary = summarise(runBaseline(CASES, V154).results).overall

  // Exact equality, not a tolerance: this test guards the evaluator, and any
  // drift in a rule changes the meaning of every later measurement.
  assert.equal(summary.meanScore, REFERENCE.meanScore, 'mean score drifted')
  assert.equal(summary.fidelityRate, REFERENCE.fidelityRate, 'fidelity rate drifted')
  assert.equal(summary.completenessRate, REFERENCE.completenessRate, 'completeness rate drifted')
  assert.equal(summary.sendabilityRate, REFERENCE.sendabilityRate, 'sendability rate drifted')
  assert.equal(summary.targetingRate, REFERENCE.targetingRate, 'targeting rate drifted')
  assert.equal(summary.concisionRate, REFERENCE.concisionRate, 'concision rate drifted')
  assert.equal(summary.defaultRate, REFERENCE.defaultRate, 'default rate drifted')
})

test('the v1.5.5 prompt keeps the ground it gained', () => {
  const summary = summarise(runBaseline(CASES, V155).results).overall
  for (const [key, minimum] of Object.entries(CURRENT_MINIMUMS)) {
    assert.ok(
      summary[key] >= minimum,
      `${key} regressed below the locked minimum: ${summary[key]} < ${minimum}`,
    )
  }
})

test('fidelity stays at 100 percent in both runs', () => {
  for (const [label, run] of [
    ['v1.5.4', V154],
    ['v1.5.5', V155],
  ]) {
    const failures = runBaseline(CASES, run).results.filter((r) => !r.fidelity.pass).map((r) => r.id)
    assert.deepEqual(failures, [], `${label}: any dropped or changed fact is a hard failure`)
  }
})

test('no recorded output relies on boilerplate to pad itself', () => {
  for (const run of [V154, V155]) {
    const padded = runBaseline(CASES, run).results.filter((r) => r.concision.boilerplate.length > 0)
    assert.deepEqual(padded.map((r) => r.id), [])
  }
})
