/**
 * Panel state machine for 许愿树.
 *
 * Kept pure so the whole interaction model is testable without a browser: the
 * React component only renders this state and calls these transitions.
 *
 * Two rules shape the design:
 *
 *  - **The wish is never lost.** A failed generation keeps `idea` intact, so the
 *    user can retry without retyping.
 *  - **The library always shows something.** A failed refresh falls back to the
 *    built-in seed and only changes the notice, never empties the list.
 */

import { SEED_RECORDS } from './seed.js'
import { mergeLibraries } from './sources.js'
import { normalizeLibrary } from './wishlist.js'

/** Scene presets. `general` adds no instruction, so it is the honest default. */
export const SCENES = Object.freeze([
  { key: 'general', labelZh: '通用', labelEn: 'General', hint: '' },
  {
    key: 'writing',
    labelZh: '写作',
    labelEn: 'Writing',
    hint: 'Emphasise structure, tone and the reader; keep every fact from the input.',
  },
  {
    key: 'code',
    labelZh: '编程',
    labelEn: 'Coding',
    hint: 'Emphasise a runnable result, stated dependencies and error handling.',
  },
  {
    key: 'analysis',
    labelZh: '分析',
    labelEn: 'Analysis',
    hint: 'Emphasise a conclusion first, then the evidence, then the caveats.',
  },
  {
    key: 'design',
    labelZh: '设计',
    labelEn: 'Design',
    hint: 'Emphasise visual hierarchy, states and accessibility.',
  },
  {
    key: 'learning',
    labelZh: '学习',
    labelEn: 'Learning',
    hint: 'Emphasise starting from zero, with analogies and a practice step.',
  },
])

/** Audience presets. `auto` leaves the decision to the model. */
export const AUDIENCES = Object.freeze([
  { key: 'auto', labelZh: '自动判断', labelEn: 'Auto', hint: '' },
  { key: 'colleague', labelZh: '同事', labelEn: 'Colleagues', hint: 'peers on the same team' },
  { key: 'client', labelZh: '客户', labelEn: 'Clients', hint: 'a customer or an external stakeholder' },
  { key: 'leader', labelZh: '领导', labelEn: 'Management', hint: 'someone deciding whether to approve' },
  { key: 'public', labelZh: '大众', labelEn: 'General public', hint: 'people with no background at all' },
])

/** Generation phases the panel renders differently. */
export const PHASES = Object.freeze(['idle', 'busy', 'done', 'error'])

/** Library view modes. */
export const LIBRARY_VIEWS = Object.freeze(['browse', 'saved'])

/** Short, user-facing reason per refresh failure. */
const REFRESH_REASONS = {
  'no-fetch': '当前离线，正在使用内置库',
  network: '当前离线，正在使用内置库',
  timeout: '联网超时，正在使用内置库',
  'http-error': '来源暂时不可用，正在使用内置库',
  empty: '来源返回空内容，正在使用内置库',
  'too-large': '来源内容过大，正在使用内置库',
  'no-rows': '来源没有可用条目，正在使用内置库',
  'all-rejected': '来源条目未通过许可校验，正在使用内置库',
  'bad-source': '来源配置有误，正在使用内置库',
}

/**
 * The empty panel state.
 *
 * @returns {object} A fresh state object; never shared between renders.
 */
export function initialState() {
  return {
    idea: '',
    scene: 'general',
    audience: 'auto',
    phase: 'idle',
    result: '',
    error: '',
    /** Id of the library record the wish is being shaped after, or ''. */
    basedOn: '',
    library: {
      open: false,
      view: 'browse',
      query: '',
      category: 'all',
      records: normalizeLibrary(SEED_RECORDS).records,
      saved: [],
      source: 'seed',
      loading: false,
      notice: '',
      lastFetchedAt: '',
      selectedId: '',
    },
  }
}

/**
 * Merge a partial update into the top-level state.
 *
 * Unknown keys are ignored so a stale component cannot inject fields.
 *
 * @param {object} state - Current state.
 * @param {object} patch - Fields to replace.
 * @returns {object} New state.
 */
export function patchState(state, patch) {
  const base = state ?? initialState()
  if (patch === null || typeof patch !== 'object') return base
  const next = { ...base }
  for (const key of ['idea', 'scene', 'audience', 'phase', 'result', 'error', 'basedOn']) {
    if (typeof patch[key] === 'string') next[key] = patch[key]
  }
  return next
}

/**
 * Merge a partial update into the library sub-state.
 *
 * @param {object} state - Current state.
 * @param {object} patch - Fields to replace.
 * @returns {object} New state.
 */
export function patchLibrary(state, patch) {
  const base = state ?? initialState()
  if (patch === null || typeof patch !== 'object') return base
  const library = { ...(base.library ?? initialState().library) }

  for (const key of ['view', 'query', 'category', 'source', 'notice', 'lastFetchedAt', 'selectedId']) {
    if (typeof patch[key] === 'string') library[key] = patch[key]
  }
  for (const key of ['open', 'loading']) {
    if (typeof patch[key] === 'boolean') library[key] = patch[key]
  }
  if (Array.isArray(patch.records)) library.records = normalizeLibrary(patch.records).records
  if (Array.isArray(patch.saved)) library.saved = patch.saved.filter((id) => typeof id === 'string')

  return { ...base, library }
}

/**
 * Validate a scene key, falling back to `general`.
 *
 * @param {unknown} key - Candidate.
 * @returns {string} A valid scene key.
 */
export function resolveScene(key) {
  return SCENES.some((scene) => scene.key === key) ? key : 'general'
}

/**
 * Validate an audience key, falling back to `auto`.
 *
 * @param {unknown} key - Candidate.
 * @returns {string} A valid audience key.
 */
export function resolveAudience(key) {
  return AUDIENCES.some((audience) => audience.key === key) ? key : 'auto'
}

/**
 * Whether a generation may start.
 *
 * A blank wish cannot be rewritten, and a second request while one is running
 * would race the first result back into the panel.
 *
 * @param {object} state - Current state.
 * @returns {{ ok: boolean, reason?: string }} Decision.
 */
export function canGenerate(state) {
  const idea = typeof state?.idea === 'string' ? state.idea.trim() : ''
  if (idea === '') return { ok: false, reason: 'empty' }
  if (state?.phase === 'busy') return { ok: false, reason: 'busy' }
  return { ok: true }
}

/**
 * Build the request body for one generation.
 *
 * Scene and audience are sent as KEYS, not as prose: the Host owns the wording so
 * a future translation or wording change does not need a Client release.
 *
 * @param {object} state - Current state.
 * @param {object} [extra] - `{ context, provider, model }` from the caller.
 * @returns {object} Request body.
 */
export function buildGenerateRequest(state, extra = {}) {
  const idea = typeof state?.idea === 'string' ? state.idea.trim() : ''
  const body = {
    text: idea,
    mode: 'rewrite',
    scene: resolveScene(state?.scene),
    audience: resolveAudience(state?.audience),
  }

  const basedOn = typeof state?.basedOn === 'string' ? state.basedOn.trim() : ''
  if (basedOn !== '') body.basedOn = basedOn

  if (typeof extra.context === 'string' && extra.context.trim() !== '') {
    body.context = extra.context
  }
  if (typeof extra.provider === 'string' && extra.provider !== '') body.provider = extra.provider
  if (typeof extra.model === 'string' && extra.model !== '') body.model = extra.model
  return body
}

/**
 * Apply a successful generation.
 *
 * @param {object} state - Current state.
 * @param {string} text - Rewritten prompt.
 * @returns {object} New state.
 */
export function applyResult(state, text) {
  const base = state ?? initialState()
  if (typeof text !== 'string' || text.trim() === '') {
    return { ...base, phase: 'error', error: '模型没有返回内容' }
  }
  return { ...base, phase: 'done', result: text.trim(), error: '' }
}

/**
 * Apply a generation failure, keeping the wish so it can be retried.
 *
 * @param {object} state - Current state.
 * @param {string} message - User-facing reason.
 * @returns {object} New state.
 */
export function applyError(state, message) {
  const base = state ?? initialState()
  const text = typeof message === 'string' && message.trim() !== '' ? message.trim() : '生成失败'
  return { ...base, phase: 'error', error: text, result: '' }
}

/**
 * Apply a successful refresh: merge remote records over the seed.
 *
 * @param {object} state - Current state.
 * @param {object[]} records - Records returned by the Host.
 * @param {string} fetchedAt - ISO timestamp of this refresh.
 * @returns {object} New state.
 */
export function applyRefresh(state, records, fetchedAt) {
  const base = state ?? initialState()
  const merged = mergeLibraries(base.library?.records ?? [], records)
  return patchLibrary({ ...base, library: { ...base.library, loading: false } }, {
    records: merged.records,
    source: 'remote',
    notice: '',
    lastFetchedAt: typeof fetchedAt === 'string' ? fetchedAt : '',
  })
}

/**
 * Apply a failed refresh: keep whatever is on screen and only change the notice.
 *
 * This is the degradation path the brief requires. The seed is already in
 * `records`, so nothing needs to be re-fetched to stay usable.
 *
 * @param {object} state - Current state.
 * @param {string} reason - Short machine reason from the Host.
 * @returns {object} New state.
 */
export function applyRefreshFailure(state, reason) {
  const base = state ?? initialState()
  const notice = REFRESH_REASONS[reason] ?? '刷新失败，正在使用内置库'
  return patchLibrary({ ...base, library: { ...base.library, loading: false } }, {
    notice,
    source: 'seed',
  })
}

/**
 * Whether the result can be written back into the composer.
 *
 * @param {object} state - Current state.
 * @returns {boolean} True when there is a result to send.
 */
export function canSendBack(state) {
  return state?.phase === 'done' && typeof state?.result === 'string' && state.result.trim() !== ''
}
