/**
 * Tests for the panel state machine.
 *
 * These assert the two promises the panel makes to a non-technical user: a
 * failure never costs them the wish they typed, and a failed refresh never
 * leaves them with an empty library.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AUDIENCES,
  LIBRARY_VIEWS,
  PHASES,
  SCENES,
  applyError,
  applyRefresh,
  applyRefreshFailure,
  applyResult,
  buildGenerateRequest,
  canGenerate,
  canSendBack,
  initialState,
  patchLibrary,
  patchState,
  resolveAudience,
  resolveScene,
} from '../lib/panel-state.js'
import { SEED_RECORDS } from '../lib/seed.js'

test('the initial state is usable with no network at all', () => {
  const state = initialState()
  assert.equal(state.phase, 'idle')
  assert.equal(state.idea, '')
  assert.equal(state.library.records.length, SEED_RECORDS.length, 'the seed is present from the start')
  assert.equal(state.library.source, 'seed')
  assert.equal(state.library.loading, false)
  assert.equal(state.library.open, false)
})

test('initialState returns a fresh object each time', () => {
  const a = initialState()
  a.idea = 'mutated'
  a.library.records.pop()
  const b = initialState()
  assert.equal(b.idea, '')
  assert.equal(b.library.records.length, SEED_RECORDS.length)
})

test('scene and audience metadata is complete and uniquely keyed', () => {
  assert.equal(new Set(SCENES.map((s) => s.key)).size, SCENES.length)
  assert.equal(new Set(AUDIENCES.map((a) => a.key)).size, AUDIENCES.length)
  assert.equal(SCENES[0].key, 'general', 'general is first so it is the default')
  assert.equal(AUDIENCES[0].key, 'auto')
  for (const scene of SCENES) assert.ok(scene.labelZh && scene.labelEn)
  for (const audience of AUDIENCES) assert.ok(audience.labelZh && audience.labelEn)
})

test('resolveScene and resolveAudience fall back to the safe default', () => {
  assert.equal(resolveScene('code'), 'code')
  assert.equal(resolveScene('nonsense'), 'general')
  assert.equal(resolveScene(undefined), 'general')
  assert.equal(resolveAudience('client'), 'client')
  assert.equal(resolveAudience('nonsense'), 'auto')
  assert.equal(resolveAudience(null), 'auto')
})

test('patchState only accepts known string fields', () => {
  const state = patchState(initialState(), { idea: '做个PPT', scene: 'code', evil: 'x', phase: 'busy' })
  assert.equal(state.idea, '做个PPT')
  assert.equal(state.scene, 'code')
  assert.equal(state.phase, 'busy')
  assert.equal('evil' in state, false)
})

test('patchState tolerates bad input', () => {
  const base = initialState()
  assert.equal(patchState(base, null), base)
  assert.equal(patchState(base, 'x'), base)
  assert.equal(patchState(undefined, { idea: 'a' }).idea, 'a')
})

test('patchLibrary validates records through the licence gate', () => {
  const state = patchLibrary(initialState(), {
    records: [
      { id: 'ok', title: 'T', body: 'a valid body', license: 'CC0-1.0', source: 's', sourceUrl: '', fetchedAt: 't' },
      { id: 'bad', title: 'T', body: 'a valid body', license: 'GPL-3.0', source: 's', sourceUrl: '', fetchedAt: 't' },
    ],
  })
  assert.deepEqual(
    state.library.records.map((r) => r.id),
    ['ok'],
    'a disallowed licence must be dropped even via a patch',
  )
})

test('patchLibrary ignores unknown fields and bad types', () => {
  const state = patchLibrary(initialState(), { open: true, query: 'x', bogus: 1, loading: 'yes' })
  assert.equal(state.library.open, true)
  assert.equal(state.library.query, 'x')
  assert.equal(state.library.loading, false, 'a non-boolean is ignored')
  assert.equal('bogus' in state.library, false)
})

test('generation needs a non-empty wish and no run in flight', () => {
  assert.deepEqual(canGenerate(initialState()), { ok: false, reason: 'empty' })
  assert.deepEqual(canGenerate({ ...initialState(), idea: '   ' }), { ok: false, reason: 'empty' })
  assert.deepEqual(canGenerate({ ...initialState(), idea: '做个PPT' }), { ok: true })
  assert.deepEqual(canGenerate({ ...initialState(), idea: '做个PPT', phase: 'busy' }), {
    ok: false,
    reason: 'busy',
  })
})

test('the request body sends scene and audience keys, not prose', () => {
  const state = { ...initialState(), idea: '  做个PPT  ', scene: 'design', audience: 'client' }
  const body = buildGenerateRequest(state, { context: '用户：给客户看', provider: 'p', model: 'm' })
  assert.equal(body.text, '做个PPT', 'the wish is trimmed')
  assert.equal(body.mode, 'rewrite')
  assert.equal(body.scene, 'design')
  assert.equal(body.audience, 'client')
  assert.equal(body.context, '用户：给客户看')
  assert.equal(body.provider, 'p')
  assert.equal(body.model, 'm')
})

test('the request body omits empty optional fields', () => {
  const body = buildGenerateRequest({ ...initialState(), idea: 'x' })
  assert.equal('context' in body, false)
  assert.equal('provider' in body, false)
  assert.equal('model' in body, false)
  assert.equal('basedOn' in body, false)
})

test('an invalid scene or audience in the state never reaches the Host', () => {
  const body = buildGenerateRequest({ ...initialState(), idea: 'x', scene: 'evil', audience: 'evil' })
  assert.equal(body.scene, 'general')
  assert.equal(body.audience, 'auto')
})

test('a library record id is forwarded only when chosen', () => {
  const withRecord = buildGenerateRequest({ ...initialState(), idea: 'x', basedOn: 'seed-gen-01' })
  assert.equal(withRecord.basedOn, 'seed-gen-01')
  const blank = buildGenerateRequest({ ...initialState(), idea: 'x', basedOn: '   ' })
  assert.equal('basedOn' in blank, false)
})

test('a result moves the panel to done and clears the error', () => {
  const state = applyResult({ ...initialState(), phase: 'busy', error: 'old' }, '  请制作一份 PPT  ')
  assert.equal(state.phase, 'done')
  assert.equal(state.result, '请制作一份 PPT')
  assert.equal(state.error, '')
})

test('an empty model answer becomes an error rather than an empty result', () => {
  for (const empty of ['', '   ', undefined, null, 42]) {
    const state = applyResult({ ...initialState(), phase: 'busy' }, empty)
    assert.equal(state.phase, 'error')
    assert.equal(state.result, '')
    assert.ok(state.error !== '')
  }
})

test('a failure keeps the wish so the user can retry without retyping', () => {
  const before = { ...initialState(), idea: '做个PPT', scene: 'design', phase: 'busy' }
  const after = applyError(before, '超时')
  assert.equal(after.phase, 'error')
  assert.equal(after.error, '超时')
  assert.equal(after.idea, '做个PPT', 'the wish must survive a failure')
  assert.equal(after.scene, 'design', 'the chosen scene must survive too')
  assert.equal(canGenerate(after).ok, true, 'and a retry must be possible')
})

test('a failure without a message still shows something', () => {
  const state = applyError(initialState(), '')
  assert.ok(state.error.length > 0)
  assert.equal(state.phase, 'error')
})

test('a successful refresh merges remote records over the seed', () => {
  const remote = [
    {
      id: 'remote-1',
      title: 'Remote',
      category: 'general',
      body: 'remote body text',
      license: 'CC0-1.0',
      source: 'prompts.chat',
      sourceUrl: 'https://example.invalid/x.csv',
      fetchedAt: 't',
    },
  ]
  const state = applyRefresh({ ...initialState(), library: { ...initialState().library, loading: true } }, remote, '2026-11-15T00:00:00.000Z')
  assert.equal(state.library.records.length, SEED_RECORDS.length + 1)
  assert.equal(state.library.source, 'remote')
  assert.equal(state.library.loading, false)
  assert.equal(state.library.notice, '')
  assert.equal(state.library.lastFetchedAt, '2026-11-15T00:00:00.000Z')
})

test('a failed refresh keeps the seed and only changes the notice', () => {
  const before = initialState()
  const state = applyRefreshFailure({ ...before, library: { ...before.library, loading: true } }, 'network')
  assert.equal(state.library.records.length, SEED_RECORDS.length, 'the seed must still be there')
  assert.equal(state.library.source, 'seed')
  assert.equal(state.library.loading, false)
  assert.match(state.library.notice, /内置库/)
  assert.equal(canGenerate({ ...state, idea: 'x' }).ok, true, 'the panel stays usable')
})

test('every refresh failure reason maps to a readable notice', () => {
  for (const reason of [
    'no-fetch',
    'network',
    'timeout',
    'http-error',
    'empty',
    'too-large',
    'no-rows',
    'all-rejected',
    'bad-source',
    'something-unexpected',
  ]) {
    const state = applyRefreshFailure(initialState(), reason)
    assert.ok(state.library.notice.length > 0, `${reason} needs a notice`)
    assert.ok(state.library.records.length > 0, `${reason} must not empty the library`)
  }
})

test('send-back requires a finished result', () => {
  assert.equal(canSendBack(initialState()), false)
  assert.equal(canSendBack({ ...initialState(), phase: 'done', result: '' }), false)
  assert.equal(canSendBack({ ...initialState(), phase: 'error', result: 'x' }), false)
  assert.equal(canSendBack({ ...initialState(), phase: 'done', result: '请制作一份 PPT' }), true)
})

test('the declared phase and view vocabularies are used consistently', () => {
  assert.deepEqual([...PHASES], ['idle', 'busy', 'done', 'error'])
  assert.deepEqual([...LIBRARY_VIEWS], ['browse', 'saved'])
  assert.ok(PHASES.includes(initialState().phase))
  assert.ok(LIBRARY_VIEWS.includes(initialState().library.view))
})
