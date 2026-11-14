/**
 * Tests for the timeout policy.
 *
 * History matters here. v1.5.5 used a fixed 90 s and timed out on a reasoning
 * model. v1.6.0 tried to discover the model type before the call and pick a
 * budget; that probe could itself hang, AND the longer budget could only be
 * learned from a SUCCESSFUL response, so the first click still used 90 s. The
 * policy is now a fixed, generous default with no I/O on the critical path.
 *
 * These tests pin the two properties that make that safe: the default is long
 * enough for a thinking model, and it is still bounded so a broken route cannot
 * hang forever.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  TIMEOUT_BOUNDS,
  clampTimeout,
  describeTimeout,
  readReasoningFlag,
  resolveRequestTimeout,
} from '../lib/timeout.js'

test('the default budget is long enough for a reasoning model', () => {
  assert.equal(resolveRequestTimeout(undefined), TIMEOUT_BOUNDS.defaultMs)
  assert.equal(resolveRequestTimeout({}), TIMEOUT_BOUNDS.defaultMs)
  assert.equal(resolveRequestTimeout({ reasoning: true }), TIMEOUT_BOUNDS.defaultMs)
  assert.ok(TIMEOUT_BOUNDS.defaultMs >= 180000)
})

test('only a positively-known chat model gets the short budget', () => {
  assert.equal(resolveRequestTimeout({ reasoning: false }), TIMEOUT_BOUNDS.chatMs)
  // Unknown must NOT get the short budget: that was the first-click failure.
  assert.equal(resolveRequestTimeout({ reasoning: undefined }), TIMEOUT_BOUNDS.defaultMs)
  assert.equal(resolveRequestTimeout(null), TIMEOUT_BOUNDS.defaultMs)
})

test('an unknown model gets the LONG budget, not the short one', () => {
  // Regression for the v1.6.0 first-click bug. A too-short timeout is a hard
  // failure; a long one is only a wait, and the button stays cancellable.
  assert.equal(resolveRequestTimeout(null), TIMEOUT_BOUNDS.defaultMs)
  assert.ok(resolveRequestTimeout(null) > TIMEOUT_BOUNDS.chatMs)
})

test('readReasoningFlag understands the shapes a caller may send', () => {
  assert.equal(readReasoningFlag({ reasoning: { efforts: [] } }), true)
  assert.equal(readReasoningFlag({ reasoning: { defaultEffort: 'high' } }), true)
  assert.equal(readReasoningFlag({ reasoning: true }), true)
  assert.equal(readReasoningFlag({ reasoning: false }), false)
  assert.equal(readReasoningFlag({}), false)
  assert.equal(readReasoningFlag({ reasoning: null }), false)
  assert.equal(readReasoningFlag(null), undefined)
  assert.equal(readReasoningFlag('nonsense'), undefined)
  assert.equal(readReasoningFlag(42), undefined)
})

test('clampTimeout keeps a value inside the supported range', () => {
  assert.equal(clampTimeout(1), TIMEOUT_BOUNDS.minMs)
  assert.equal(clampTimeout(10), TIMEOUT_BOUNDS.minMs)
  assert.equal(clampTimeout(999999999), TIMEOUT_BOUNDS.maxMs)
  assert.equal(clampTimeout('120000'), 120000)
  assert.equal(clampTimeout(120000.7), 120000)
  assert.equal(clampTimeout('abc'), TIMEOUT_BOUNDS.defaultMs)
  assert.equal(clampTimeout(undefined), TIMEOUT_BOUNDS.defaultMs)
  assert.equal(clampTimeout(null), TIMEOUT_BOUNDS.defaultMs)
})

test('clampTimeout never turns a bad value into an instant abort', () => {
  // NaN would make setTimeout fire at 0 ms. Any non-numeric input must still
  // produce a positive, finite budget.
  for (const bad of ['abc', '', undefined, null, NaN, Infinity, -Infinity]) {
    const value = clampTimeout(bad)
    assert.ok(Number.isFinite(value) && value > 0, `clampTimeout(${String(bad)}) = ${value}`)
  }
})

test('describeTimeout reports the default budget without any model I/O', () => {
  assert.deepEqual(describeTimeout(undefined), {
    timeoutMs: TIMEOUT_BOUNDS.defaultMs,
    reasoning: false,
  })
})

test('describeTimeout can still shorten for a known chat route', () => {
  assert.deepEqual(describeTimeout({ reasoning: false }), {
    timeoutMs: TIMEOUT_BOUNDS.chatMs,
    reasoning: false,
  })
})

test('the budget stays under the hard cap', () => {
  assert.ok(TIMEOUT_BOUNDS.defaultMs <= TIMEOUT_BOUNDS.maxMs)
  assert.ok(TIMEOUT_BOUNDS.chatMs < TIMEOUT_BOUNDS.defaultMs)
})
