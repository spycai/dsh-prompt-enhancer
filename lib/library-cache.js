/**
 * On-disk cache for the prompt library.
 *
 * Why a cache exists at all: without one, every restart dropped back to the
 * 25-entry seed and threw away whatever the last refresh fetched. That made the
 * "library grows over time" promise false — the user's original brief asked for
 * fetched prompts to be *stored*, not just displayed once.
 *
 * Location is the DSH profile directory, so the cache follows the profile it
 * belongs to and never lands in the plugin's own source tree.
 *
 * Failure policy: a cache that cannot be read or written must never break the
 * panel. Every function here degrades to "no cache" and lets the caller fall
 * back to the seed.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Cache schema version, so an old file can be discarded instead of misread. */
export const CACHE_VERSION = 1

/** Filename inside the cache directory. */
const CACHE_FILE = 'library.json'

/**
 * Resolve the cache file path for a profile directory.
 *
 * @param {string} profileDir - Absolute profile directory.
 * @returns {string} Absolute path to the cache file.
 */
export function cachePathFor(profileDir) {
  return join(profileDir, '.dsh-wish-tree', CACHE_FILE)
}

/**
 * Read the cached library, tolerating every kind of damage.
 *
 * A missing file, invalid JSON, a schema from another version, or an unexpected
 * shape all yield `undefined` so the caller uses the seed instead of throwing.
 *
 * @param {string} profileDir - Absolute profile directory.
 * @returns {{ records: object[], fetchedAt: string, sources: string[] } | undefined}
 */
export function readCache(profileDir) {
  try {
    const path = cachePathFor(profileDir)
    if (!existsSync(path)) return undefined
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return undefined
    if (parsed.version !== CACHE_VERSION) return undefined
    if (!Array.isArray(parsed.records)) return undefined
    return {
      records: parsed.records.filter((record) => record !== null && typeof record === 'object'),
      fetchedAt: typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : '',
      sources: Array.isArray(parsed.sources) ? parsed.sources.filter((id) => typeof id === 'string') : [],
    }
  } catch {
    return undefined
  }
}

/**
 * Write the cached library, swallowing failures.
 *
 * The caller must not fail a request because the disk is read-only: a refresh
 * that reached the network has already produced a usable list for this session.
 *
 * @param {string} profileDir - Absolute profile directory.
 * @param {{ records: object[], fetchedAt: string, sources?: string[] }} value - Data to persist.
 * @returns {boolean} True when the write succeeded.
 */
export function writeCache(profileDir, value) {
  try {
    const path = cachePathFor(profileDir)
    mkdirSync(dirname(path), { recursive: true })
    const payload = {
      version: CACHE_VERSION,
      fetchedAt: typeof value?.fetchedAt === 'string' ? value.fetchedAt : new Date().toISOString(),
      sources: Array.isArray(value?.sources) ? value.sources : [],
      records: Array.isArray(value?.records) ? value.records : [],
    }
    writeFileSync(path, `${JSON.stringify(payload)}\n`, 'utf8')
    return true
  } catch {
    return false
  }
}

/**
 * Resolve the profile directory from a Host context, tolerating its absence.
 *
 * **Never read `ctx.profileDir`, `ctx.baseDir` or `ctx.root` directly.** In
 * Cordis those are injected-service proxies: touching one that was not declared
 * throws `cannot get property "profileDir" without inject`. That single line
 * broke the whole library route — every request failed with a generic error
 * while the data was sitting on disk. `ctx.get(name)` inside a try is the only
 * safe probe.
 *
 * @param {object} ctx - Host context.
 * @returns {string | undefined} An absolute directory, or undefined.
 */
export function resolveProfileDir(ctx) {
  /**
   * Probe one name through `ctx.get`, which is a method rather than a proxy.
   *
   * @param {string} name - Candidate service name.
   * @returns {string | undefined} A usable directory, or undefined.
   */
  const probe = (name) => {
    try {
      const value = ctx?.get?.(name)
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
    } catch {
      return undefined
    }
  }

  for (const name of ['profileDir', 'baseDir']) {
    const found = probe(name)
    if (found !== undefined) return found
  }

  if (typeof process.env.DSH_PROFILE_DIR === 'string' && process.env.DSH_PROFILE_DIR.trim() !== '') {
    return process.env.DSH_PROFILE_DIR.trim()
  }

  try {
    // Fall back to the documented DSH home layout, which is what actually
    // resolves on a normal install.
    const home = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh')
    if (home === '') return undefined
    return join(home, 'profiles', 'desktop')
  } catch {
    return undefined
  }
}
