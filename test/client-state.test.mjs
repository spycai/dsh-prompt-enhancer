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

test('the request timeout is a fixed generous default, not a learned value', () => {
  // F2, second attempt. v1.6.0 learned a budget from a successful response,
  // which meant the FIRST click always used 90 s — exactly the click that
  // timed out — and a timed-out call never learned anything. A constant is
  // strictly more reliable here.
  assert.match(CLIENT, /const DEFAULT_TIMEOUT_MS = 240000/)
  assert.match(CLIENT, /}, DEFAULT_TIMEOUT_MS\)/, 'the abort timer uses the constant')
  assert.doesNotMatch(CLIENT, /learnedTimeoutMs/, 'no learned state')
  assert.doesNotMatch(CLIENT, /resolveModelInfo/, 'no model probe on the Client')
})

test('a long timeout is safe because the button stays cancellable', () => {
  // A 240 s wait is acceptable only because the user can abort at any moment.
  // If cancellation were removed, a long timeout would become a stuck button.
  assert.match(CLIENT, /const cancel = \(\) =>/)
  assert.match(CLIENT, /abortRef\.current\?\.abort\(\)/)
  assert.match(CLIENT, /if \(busy\) \{/)
})
