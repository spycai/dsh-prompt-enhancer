/**
 * Tests for timeout sizing.
 *
 * The policy exists because one fixed 90 s budget failed on a reasoning model
 * (v1.5.5 timeout report). These tests pin the three decisions that matter:
 * thinking models get longer, chat models keep the old budget, and anything
 * unreadable falls back to the SHORT timeout rather than risking a four-minute
 * hang on a broken route.
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

test('a reasoning model gets the longer budget', () => {
  assert.equal(resolveRequestTimeout({ reasoning: true }), TIMEOUT_BOUNDS.reasoningMs)
})

test('a chat model keeps the previous 90 s budget', () => {
  assert.equal(resolveRequestTimeout({ reasoning: false }), TIMEOUT_BOUNDS.chatMs)
  assert.equal(resolveRequestTimeout({}), TIMEOUT_BOUNDS.chatMs)
  assert.equal(resolveRequestTimeout(undefined), TIMEOUT_BOUNDS.chatMs)
})

test('an unknown model never gets the long budget', () => {
  // Guessing "reasoning" everywhere would let a hung chat call pin the button
  // for four minutes; the cheap mistake is to time out early.
  assert.equal(resolveRequestTimeout({ reasoning: undefined }), TIMEOUT_BOUNDS.chatMs)
  assert.equal(resolveRequestTimeout(null), TIMEOUT_BOUNDS.chatMs)
})

test('readReasoningFlag understands the shapes the Host can send', () => {
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
  assert.equal(clampTimeout('abc'), TIMEOUT_BOUNDS.chatMs)
  assert.equal(clampTimeout(undefined), TIMEOUT_BOUNDS.chatMs)
  assert.equal(clampTimeout(null), TIMEOUT_BOUNDS.chatMs)
})

test('describeTimeout reports both the budget and the reason', () => {
  assert.deepEqual(describeTimeout({ reasoning: { efforts: [{ id: 'high' }] } }), {
    timeoutMs: TIMEOUT_BOUNDS.reasoningMs,
    reasoning: true,
  })
  assert.deepEqual(describeTimeout({}), {
    timeoutMs: TIMEOUT_BOUNDS.chatMs,
    reasoning: false,
  })
})

test('describeTimeout honours a caller fallback only when the model is unreadable', () => {
  assert.equal(describeTimeout(undefined, 45000).timeoutMs, 45000)
  // A readable model ignores the fallback entirely.
  assert.equal(describeTimeout({ reasoning: {} }, 45000).timeoutMs, TIMEOUT_BOUNDS.reasoningMs)
  assert.equal(describeTimeout({}, 45000).timeoutMs, TIMEOUT_BOUNDS.chatMs)
})

test('the long budget stays under the hard cap', () => {
  assert.ok(TIMEOUT_BOUNDS.reasoningMs <= TIMEOUT_BOUNDS.maxMs)
  assert.ok(TIMEOUT_BOUNDS.chatMs < TIMEOUT_BOUNDS.reasoningMs)
})
