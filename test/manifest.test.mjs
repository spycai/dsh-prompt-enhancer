/**
 * Guard against the M-3 regression: a test file that exists on disk but is not
 * executed by `npm test` / CI.
 *
 * This reads the same discovery function the runner uses, so it cannot drift
 * from what CI actually runs. It also asserts the CI syntax-check list covers
 * every production source file, which was the other half of M-3.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import { listTestFiles } from './lib/run-tests.mjs'

const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('every test file on disk is discovered by the runner', () => {
  const discovered = listTestFiles().map((p) => p.replace(/\\/g, '/').split('/').pop())
  const onDisk = readdirSync(new URL('./', import.meta.url))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
  assert.deepEqual(discovered, onDisk, 'runner discovery must match the files on disk')
  assert.ok(discovered.length >= 7, `expected at least 7 suites, found ${discovered.length}`)
})

test('package.json test script uses the discovery runner, not a hand-written list', () => {
  assert.equal(PKG.scripts.test, 'node test/lib/run-tests.mjs')
})

test('CI syntax-check step covers every production source file', () => {
  const workflow = readFileSync(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8')
  assert.match(workflow, /node --check index\.js/)
  assert.match(workflow, /node --check client\.js/)
  // A loop over lib/*.js covers every current and future module; a hand-written
  // list was the M-3 failure mode (structure.js was never checked).
  assert.match(workflow, /for f in lib\/\*\.js; do node --check "\$f"; done/)
})

test('no production source file imports the v2 design draft', () => {
  // M-1 regression: structure.js is a design draft under 产出/, not live code.
  // If a future change wires it in without removing this guard, the test says so
  // explicitly instead of silently allowing a half-connected feature again.
  for (const file of ['index.js', 'client.js', 'lib/prompt.js']) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(text, /structure\.js|parseStructuredOutput|buildStructuredSystemPrompt/)
  }
})
