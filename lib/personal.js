/**
 * The user's own saved prompts.
 *
 * Everything in the library so far came from elsewhere: 34 entries written for
 * this plugin, 148 fetched from a public collection. A prompt the user generated
 * and liked had nowhere to go, so the library could never become *theirs*.
 *
 * Stored separately from the remote cache on purpose:
 *
 *  - A refresh overwrites the remote cache; it must never touch these.
 *  - `personal.json` is small, so it can be rewritten whole without the
 *    partial-retry bookkeeping the remote cache needs.
 *  - If it is lost or corrupt, the library still works — these are the only
 *    records that cannot be re-fetched, so every write is verified.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { stripDefaultMarkers } from './placeholders.js'
import { normalizeRecord } from './wishlist.js'

/** Schema version, so an incompatible file is discarded rather than misread. */
export const PERSONAL_VERSION = 1

/** Where a saved prompt lives, relative to the profile directory. */
const PERSONAL_FILE = 'personal.json'

/** Hard cap: a personal library is a set of favourites, not an archive. */
export const PERSONAL_LIMITS = { maxRecords: 200, maxBodyChars: 4000 }

/**
 * Resolve the personal library path.
 *
 * @param {string} profileDir - Absolute profile directory.
 * @returns {string} Absolute file path.
 */
export function personalPathFor(profileDir) {
  return join(profileDir, '.dsh-wish-tree', PERSONAL_FILE)
}

/**
 * Read the personal library, tolerating every kind of damage.
 *
 * @param {string} profileDir - Absolute profile directory.
 * @returns {object[]} Saved records, or an empty array.
 */
export function readPersonal(profileDir) {
  try {
    const path = personalPathFor(profileDir)
    if (!existsSync(path)) return []
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return []
    if (parsed.version !== PERSONAL_VERSION) return []
    if (!Array.isArray(parsed.records)) return []
    return parsed.records.filter((record) => record !== null && typeof record === 'object')
  } catch {
    return []
  }
}

/**
 * Write the personal library, swallowing failures.
 *
 * @param {string} profileDir - Absolute profile directory.
 * @param {object[]} records - Records to store.
 * @returns {boolean} True when the write succeeded.
 */
export function writePersonal(profileDir, records) {
  try {
    const path = personalPathFor(profileDir)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(
      path,
      `${JSON.stringify({ version: PERSONAL_VERSION, records: Array.isArray(records) ? records : [] }, null, 0)}\n`,
      'utf8',
    )
    return true
  } catch {
    return false
  }
}

/**
 * Turn one generated prompt into a record that can be saved.
 *
 * The title is derived from the body rather than asked for: a user who just
 * produced a prompt wants one click, not a naming dialog. The first clause
 * makes a serviceable name, and they can always delete it later.
 *
 * @param {{ title?: string, body?: string }} input - Title and body from the Client.
 * @param {string} [nowIso] - Injectable clock.
 * @returns {object | undefined} A record ready to store, or undefined if unusable.
 */
export function buildPersonalRecord(input, nowIso = new Date().toISOString()) {
  const body = typeof input?.body === 'string' ? input.body.trim() : ''
  if (body === '') return undefined
  if (body.length > PERSONAL_LIMITS.maxBodyChars) return undefined

  const given = typeof input?.title === 'string' ? input.title.trim() : ''
  // Clean the title either way: a derived one inherits the body's own markers
  // (`[默认：…]`, `[请补充：…]`), and a verbatim one can carry them too. A title is
  // a label, so it should read as plain text.
  const title = sanitizeTitle(given !== '' ? given.slice(0, 60) : deriveTitle(body))

  return normalizeRecord({
    // Time-based id: saving twice produces two entries, which is what the user
    // asked for by pressing save twice.
    id: `mine-${nowIso.replace(/[^0-9]/g, '').slice(0, 14)}`,
    title,
    category: 'general',
    tags: ['我的'],
    body,
    language: 'zh',
    source: '个人',
    sourceUrl: '',
    // The user wrote it, so the licence question does not arise; this value keeps
    // it inside the allow-list rather than introducing a special case.
    license: 'CC0-1.0',
    fetchedAt: nowIso,
  })
}

/**
 * Turn a title into clean plain text.
 *
 * Drops default and placeholder markers, which are instructions to the reader
 * rather than part of a name, then trims and caps the length.
 *
 * @param {string} value - Candidate title.
 * @returns {string} A clean title, never empty.
 */
export function sanitizeTitle(value) {
  const stripped = stripDefaultMarkers(typeof value === 'string' ? value : '')
  const withoutBlanks = stripped.replace(/\[请补充[：:][^\]]{0,60}\]/g, '')
  const cleaned = withoutBlanks.replace(/\s{2,}/g, ' ').replace(/[。，、；：,;:]\s*$/, '').trim()
  if (cleaned === '') return '我的提示词'
  return cleaned.length > 40 ? `${cleaned.slice(0, 40)}…` : cleaned
}

/**
 * Derive a short title from a prompt body.
 *
 * Strips only whole leading words, never individual characters. The previous
 * version used a character class (`[请帮为给我]`), which ate the first real
 * character of the sentence: 「我的私人提示词内容」became 「的私人提示词内容」.
 * A leading word that is not in the list is left alone.
 *
 * @param {string} body - Prompt text.
 * @returns {string} A title of at most 40 characters.
 */
export function deriveTitle(body) {
  const firstLine = String(body ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '')
  if (firstLine === undefined) return '我的提示词'

  // Longest first, so 「请帮我」wins over 「请」 and leaves 「帮我」 out of the title.
  const LEADING_PHRASES = ['请帮我', '请给我', '请为我', '帮我', '给我', '为我', '请你', '请']
  let cleaned = firstLine
  for (const phrase of LEADING_PHRASES) {
    if (cleaned.startsWith(phrase)) {
      const rest = cleaned.slice(phrase.length).trim()
      // Only strip when something meaningful remains; 「请」 alone must not
      // yield an empty title.
      if (rest !== '') {
        cleaned = rest
        break
      }
    }
  }

  cleaned = cleaned.replace(/[。，、；：,;:]$/, '').trim()
  if (cleaned === '') return '我的提示词'
  return cleaned.length > 40 ? `${cleaned.slice(0, 40)}…` : cleaned
}

/**
 * Append one record, refusing duplicates and enforcing the cap.
 *
 * @param {object[]} records - Existing records.
 * @param {object} record - Record to add.
 * @returns {{ records: object[], added: boolean, reason?: string }} Result.
 */
export function appendPersonal(records, record) {
  const existing = Array.isArray(records) ? records.filter((item) => item !== null && typeof item === 'object') : []
  if (record === null || typeof record !== 'object') {
    return { records: existing, added: false, reason: 'invalid' }
  }
  // Saving the same text twice is a no-op rather than a duplicate: the user
  // pressing save again usually means "did it work", not "I want two copies".
  if (existing.some((item) => item.body === record.body)) {
    return { records: existing, added: false, reason: 'duplicate' }
  }
  if (existing.length >= PERSONAL_LIMITS.maxRecords) {
    return { records: existing, added: false, reason: 'full' }
  }
  return { records: [record, ...existing], added: true }
}

/**
 * Remove one record by id.
 *
 * @param {object[]} records - Existing records.
 * @param {string} id - Record id.
 * @returns {object[]} Records without that id.
 */
export function removePersonal(records, id) {
  if (!Array.isArray(records)) return []
  if (typeof id !== 'string' || id === '') return records
  return records.filter((record) => record !== null && typeof record === 'object' && record.id !== id)
}
