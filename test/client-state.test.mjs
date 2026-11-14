/**
 * Regression guard for M-5 (client-state contract).
 *
 * `client.js` runs inside the browser-side ModuleLoader and cannot be imported
 * by node, so its state machine has no unit tests. Rather than leave this bug
 * untested, this suite asserts the two source-level invariants that caused it:
 *
 *  - the pending result must carry the ORIGINAL draft snapshot;
 *  - applying it must record that snapshot as the undo target, not `draft`.
 *
 * A static assertion is weaker than a component test, but it is far stronger
 * than nothing and it fails loudly if someone reverts to the old shape.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const CLIENT = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

test('the deferred result keeps the original draft snapshot', () => {
  assert.match(
    CLIENT,
    /setPending\(\{\s*text:\s*payload\.text,\s*snapshot\s*\}\)/,
    'pending must store the snapshot alongside the result text',
  )
})

test('applying a deferred result restores to the snapshot, not the current draft', () => {
  assert.match(CLIENT, /setOriginal\(pending\.snapshot\)/, 'undo target is the stored snapshot')
  assert.doesNotMatch(
    CLIENT,
    /const applyPending[\s\S]{0,400}?setOriginal\(draft\)/,
    'the old bug recorded the current draft as the undo target',
  )
})

test('both paths set the same three-state shape', () => {
  // applyResult and applyPending must agree on what `original` means, otherwise
  // the undo button behaves differently depending on which path was taken.
  assert.match(CLIENT, /const applyResult = \(payload, snapshot\) =>/)
  assert.match(CLIENT, /setOriginal\(snapshot\)/)
  assert.match(CLIENT, /setOriginal\(pending\.snapshot\)/)
})

test('the request timeout adapts to what the Host reported last time', () => {
  // F2: a fixed 90 s budget failed on a reasoning model. The Host now reports
  // `timeoutMs`, and the Client must both honour it and remember it.
  assert.match(CLIENT, /let learnedTimeoutMs = 0/, 'the learned budget lives at module scope')
  assert.match(CLIENT, /function readSuggestedTimeout\(payload\)/)
  assert.match(CLIENT, /function currentTimeoutMs\(\)/)
  assert.match(CLIENT, /\}, currentTimeoutMs\(\)\)/, 'the abort timer uses the adaptive value')
  assert.match(CLIENT, /learnedTimeoutMs = suggested/, 'the Host suggestion is remembered')
})

test('the timeout is clamped so a bad value cannot hang or fail instantly', () => {
  assert.match(CLIENT, /MIN_TIMEOUT_MS = 30000/)
  assert.match(CLIENT, /MAX_TIMEOUT_MS = 300000/)
  assert.match(CLIENT, /Math\.min\(MAX_TIMEOUT_MS, Math\.max\(MIN_TIMEOUT_MS/)
})

test('the Client never trusts a timeout blindly', () => {
  // A non-numeric or absent timeout must fall back to the default, not to NaN
  // (which setTimeout treats as 0 and would abort every request immediately).
  assert.match(CLIENT, /if \(!Number\.isFinite\(parsed\)\) return 0/)
  assert.match(CLIENT, /learnedTimeoutMs > 0 \? learnedTimeoutMs : DEFAULT_TIMEOUT_MS/)
})
