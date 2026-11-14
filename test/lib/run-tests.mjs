/**
 * Discover and run every test file.
 *
 * `node --test test/` fails on this Node build (MODULE_NOT_FOUND) and a hand-
 * written list in package.json silently rots whenever a new test file is added
 * (audit finding M-3: structure.test.mjs was never run by CI). Shell globbing is
 * not an option either, because PowerShell does not expand `test/*.test.mjs`.
 *
 * So discovery happens here, in Node, and the same list is asserted by
 * test/manifest.test.mjs. New test files are picked up automatically.
 */

import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const TEST_DIR = join(ROOT, 'test')

/**
 * Enumerate test files in a stable order.
 *
 * @returns Absolute paths to every `*.test.mjs` under test/.
 */
export function listTestFiles() {
  return readdirSync(TEST_DIR)
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => join(TEST_DIR, name))
}

const files = listTestFiles()

/**
 * Entry point guard. `manifest.test.mjs` imports `listTestFiles` from here, so
 * the spawn must NOT happen at module top level — otherwise importing this
 * file recursively launches another test run and calls process.exit, silently
 * truncating the importing suite. Only the direct CLI invocation runs tests.
 */
const isEntry =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isEntry) {
  if (files.length === 0) {
    console.error('没有找到任何 test/*.test.mjs')
    process.exit(2)
  }
  const result = spawnSync(process.execPath, ['--test', ...files], {
    stdio: 'inherit',
    cwd: ROOT,
  })
  process.exit(result.status ?? 1)
}
