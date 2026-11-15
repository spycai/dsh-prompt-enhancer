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

test('conversation history is read lazily at click time, not during render', () => {
  // F1, extended in v1.8: the read is now a shared helper so the composer button
  // and the panel cannot drift apart. `chat.legacy.nodes` is a flat array
  // rebuilt on every publication; reading it during render would re-render on
  // every token.
  assert.match(CLIENT, /function readTranscript\(chat\)/)
  assert.match(CLIENT, /chat\?\.legacy\?\.nodes/)
  assert.match(CLIENT, /const chatRef = React\.useRef\(chat\)/)
  assert.match(CLIENT, /chatRef\.current = chat/)
  // Both callers go through the ref, never the render-time value.
  assert.match(CLIENT, /readTranscript\(chatRef\.current\)/)
  assert.match(CLIENT, /readTranscript\(chatRef\.current\)/)
})

test('context is sent only for the rewrite mode', () => {
  // "Polish only" promises wording changes and nothing else, so background
  // must not be sent there; otherwise the mode stops meaning what it says.
  assert.match(CLIENT, /if \(chosenMode === 'rewrite'\) \{/)
  assert.match(CLIENT, /if \(context !== ''\) body\.context = context/)
})

test('a missing or broken chat API degrades to no context', () => {
  // The whole read is wrapped, so an absent hook or an unexpected store shape
  // falls back to the previous context-free behaviour instead of failing.
  assert.match(CLIENT, /useChat/, 'the hook is requested')
  assert.match(CLIENT, /} catch \{\s*return ''\s*\}/s, 'a failure returns empty context')
})

// --- v1.8: panel, rename, library -----------------------------------------

test('the plugin presents itself as 许愿树 with a one-time rename note', () => {
  assert.match(CLIENT, /id: 'dsh-wish-tree'/)
  assert.match(CLIENT, /label: '许愿树'/)
  assert.match(CLIENT, /panelTitle: '许愿树'/)
  assert.match(CLIENT, /原名「增强提示词」/, 'the rename must be explained once')
  assert.match(CLIENT, /locale\.register\('dsh-wish-tree'/)
})

test('the panel is registered as a real slot view, not an overlay', () => {
  // The brief asks for an independent panel. `main` is the central-panel slot
  // selected by a sidebar entry id, so that is where it goes.
  assert.match(CLIENT, /ctx\.slots\.register\(\{ name: 'main', key: PANEL_KEY/)
  assert.match(CLIENT, /ctx\.slots\.register\(\s*\{ name: 'sidebar\.panellist'/)
  assert.match(CLIENT, /const PANEL_KEY = 'wish-tree'/)
})

test('the composer button remains as a second entry point', () => {
  // The sidebar icon is the primary entry, but a host change must not be able
  // to strand the feature with no way in.
  assert.match(CLIENT, /name: 'conversation\.input\.right', id: 'wish-tree'/)
})

test('the panel never reads conversation history during render', () => {
  // `chat.legacy.nodes` is rebuilt on every publication; touching it in the
  // render body would re-render the panel on every token.
  const panel = CLIENT.slice(CLIENT.indexOf('function WishTreePanel'))
  const body = panel.slice(0, panel.indexOf('function WishTreeSidebarIcon'))
  assert.match(body, /chatRef\.current = chat/)
  assert.match(body, /readTranscript\(chatRef\.current\)/)
  assert.doesNotMatch(body, /chat\?\.legacy/, 'no direct read in the render body')
})

test('the panel offers idea, scene, audience, generate, result and library', () => {
  const panel = CLIENT.slice(CLIENT.indexOf('function WishTreePanel'))
  const body = panel.slice(0, panel.indexOf('function WishTreeSidebarIcon'))
  for (const marker of [
    /wishLabel/,
    /sceneLabel/,
    /audienceLabel/,
    /generate/,
    /copyResult/,
    /sendBack/,
    /libraryTitle/,
    /libraryRefresh/,
  ]) {
    assert.match(body, marker, `panel is missing ${marker}`)
  }
})

test('the library is loaded through the Host route, never fetched inline', () => {
  const panel = CLIENT.slice(CLIENT.indexOf('function WishTreePanel'))
  const body = panel.slice(0, panel.indexOf('function WishTreeSidebarIcon'))
  assert.match(body, /postLibrary\(/, 'the panel talks to the Host route')
  assert.doesNotMatch(body, /raw\.githubusercontent/, 'the browser must not fetch the source directly')
  assert.doesNotMatch(body, /fetch\(LIBRARY_ENDPOINT/, 'no bare single-path fetch')
})

test('a library request probes two paths and reports a visible failure', () => {
  // The reported bug: a single `/api/...` path with an empty `.catch` meant the
  // panel showed nothing and Refresh looked like a no-op, with no error at all.
  assert.match(CLIENT, /const LIBRARY_ENDPOINTS = \['\/api\/wish-tree\/library', '\/wish-tree-library'\]/)
  assert.match(CLIENT, /async function postLibrary\(body\)/)
  assert.match(CLIENT, /lastFailure/, 'a failure reason is produced')
  const panel = CLIENT.slice(CLIENT.indexOf('function WishTreePanel'))
  const body = panel.slice(0, panel.indexOf('function WishTreeSidebarIcon'))
  assert.match(body, /setLibNotice\(failure\)/, 'the reason reaches the panel')
})

test('a failed refresh keeps the list and only shows a notice', () => {
  const panel = CLIENT.slice(CLIENT.indexOf('function WishTreePanel'))
  const body = panel.slice(0, panel.indexOf('function WishTreeSidebarIcon'))
  assert.match(body, /setLibNotice\(/, 'a failure surfaces as a notice')
  assert.match(body, /正在使用内置库/, 'the notice explains the fallback')
})

test('the panel survives a slot that does not expose useChat', () => {
  // The `main` slot's standard props are session/workspace selectors only; it
  // does NOT pass useChat. The panel must degrade to a context-free rewrite
  // rather than throw, because generation and the library are its main job.
  const panel = CLIENT.slice(CLIENT.indexOf('function WishTreePanel'))
  const body = panel.slice(0, panel.indexOf('function WishTreeSidebarIcon'))
  assert.match(body, /typeof useChat === 'function' \? useChat\(/, 'the hook is optional, not assumed')
  assert.match(body, /readTranscript\(chatRef\.current\)/, 'the read goes through the shared helper')
  // The helper itself is defined once, outside the panel, so an absent hook
  // simply yields an empty transcript.
  assert.match(CLIENT, /function readTranscript\(chat\)/)
})

test('delivery standards are a checklist, not a persona', () => {
  // The user asked whether an opening "you are an experienced X master" would
  // improve the prompt. It does not: it decides nothing and pads the result.
  // The panel therefore offers verifiable standards and says so in the hint.
  assert.match(CLIENT, /const STANDARDS = \[/)
  assert.match(CLIENT, /Optional checklists for the result — not a persona/)
  assert.match(CLIENT, /可选项：给结果加可核验的检查项，不是给模型加身份/)
  assert.match(CLIENT, /standardsLabel: '成稿规范'/)
})

test('standards are optional and sent as keys only', () => {
  const panel = CLIENT.slice(CLIENT.indexOf('function WishTreePanel'))
  const body = panel.slice(0, panel.indexOf('function WishTreeSidebarIcon'))
  assert.match(body, /const \[standards, setStandards\] = React\.useState\(\[\]\)/, 'off by default')
  assert.match(body, /if \(standards\.length > 0\) body\.standards = standards/, 'nothing sent when empty')
  assert.doesNotMatch(body, /你是一位/, 'no persona wording in the panel')
})

test('a slow generation shows elapsed time and offers a cancel', () => {
  // Reported: "clicked generate, nothing happened for a long time". A reasoning
  // model that cannot disable thinking legitimately takes minutes, so the panel
  // must prove it is still working instead of looking frozen.
  const panel = CLIENT.slice(CLIENT.indexOf('function WishTreePanel'))
  const body = panel.slice(0, panel.indexOf('function WishTreeSidebarIcon'))
  assert.match(body, /const \[elapsed, setElapsed\] = React\.useState\(0\)/, 'an elapsed counter exists')
  assert.match(body, /setInterval\(/, 'it ticks while busy')
  assert.match(body, /String\(elapsed\)/, 'the button shows the count')
  assert.match(body, /abortRef\.current\?\.abort\(\)/, 'the wait can be cancelled')
  assert.match(CLIENT, /slowHint/, 'a slow-model hint exists')
})

test('the elapsed timer stops once the request settles', () => {
  const panel = CLIENT.slice(CLIENT.indexOf('function WishTreePanel'))
  const body = panel.slice(0, panel.indexOf('function WishTreeSidebarIcon'))
  assert.match(body, /if \(phase !== 'busy'\) \{[\s\S]{0,80}return undefined/, 'no timer when idle')
  assert.match(body, /clearInterval\(timer\)/, 'the interval is cleaned up')
})

test('the panel starts from an inlined seed so it is never blank', () => {
  // "Refresh shows nothing" was reported twice. An empty initial array made a
  // failed load indistinguishable from a working empty library, so the panel now
  // renders 25 built-in entries until the Host answers.
  assert.match(CLIENT, /const FALLBACK_SEED_ROWS = \[/)
  assert.match(CLIENT, /const FALLBACK_SEED = FALLBACK_SEED_ROWS\.map/)
  assert.match(CLIENT, /useState\(FALLBACK_SEED\)/, 'records must start from the seed')
  const rows = CLIENT.slice(CLIENT.indexOf('FALLBACK_SEED_ROWS = ['))
  assert.ok((rows.match(/\["seed-/g) ?? []).length >= 20, 'the inlined seed must be populated')
})

test('a library failure names the endpoint it tried', () => {
  assert.match(CLIENT, /lastFailure = `连不上 \$\{endpoint\}/)
  assert.match(CLIENT, /lastFailure = `\$\{endpoint\} 未返回数据/)
})
// --- consistency between the Client copy and the lib source of truth ---------

test('the panel category chips match lib/wishlist.js exactly', async () => {
  // CATEGORIES exists twice: inlined in client.js (the Client factory cannot
  // import an ESM module) and exported by lib/wishlist.js. Nothing enforced that
  // they agree, so editing one produced an empty chip or a category the filter
  // could never match.
  const { CATEGORIES } = await import('../lib/wishlist.js')
  const block = CLIENT.slice(CLIENT.indexOf('const CATEGORIES = ['))
  const body = block.slice(0, block.indexOf(']'))
  const clientKeys = [...body.matchAll(/key: '([a-z]+)'/g)].map((match) => match[1])

  // `all` is a view, not a stored category, so it appears only in the Client.
  assert.deepEqual(
    clientKeys.filter((key) => key !== 'all'),
    [...CATEGORIES],
    'the chip order and keys must match the library vocabulary',
  )
  assert.equal(clientKeys[0], 'all', 'the all chip comes first')
})

test('the panel standards match lib/standards.js exactly', async () => {
  const { STANDARDS } = await import('../lib/standards.js')
  const block = CLIENT.slice(CLIENT.indexOf('const STANDARDS = ['))
  const body = block.slice(0, block.indexOf(']'))
  const clientKeys = [...body.matchAll(/key: '([a-z]+)'/g)].map((match) => match[1])
  assert.deepEqual(clientKeys, STANDARDS.map((standard) => standard.key))
})

test('the panel scene and audience keys match lib/prompt.js', async () => {
  const prompt = await import('../lib/prompt.js')
  const sceneBlock = CLIENT.slice(CLIENT.indexOf('const SCENES = ['))
  const sceneKeys = [...sceneBlock.slice(0, sceneBlock.indexOf(']')).matchAll(/key: '([a-z]+)'/g)].map(
    (match) => match[1],
  )
  // Every key the panel can send must be one the Host recognises; otherwise the
  // Host silently falls back to `general` and the choice does nothing.
  for (const key of sceneKeys) {
    assert.equal(prompt.resolveScene(key), key, `scene ${key} is unknown to the Host`)
  }
})
// --- v1.9.0: make the result actionable and the panel self-explanatory -------

test('every missing element carries a one-click fix', () => {
  // The self-check used to report「还缺：受众」and stop. That is a dead end at the
  // exact moment the user needs help, so each gap now runs the existing refine path.
  const panel = CLIENT.slice(CLIENT.indexOf('function WishTreePanel'))
  const body = panel.slice(0, panel.indexOf('function WishTreeSidebarIcon'))
  assert.match(body, /missingParts\.map\(\(part\) =>/, 'one control per missing element')
  assert.match(body, /refine\(fixInstructionOf\(part, zh\)\)/, 'the fix reuses refine')
  assert.match(CLIENT, /function fixInstructionOf\(part, zh\)/)
})

test('the fix instruction is built from the Host label, not a second table', () => {
  // The Host reports 目标 / 交付格式 / 受众 / 主要约束. Building the instruction from
  // that label avoids a parallel list that could drift out of step with it.
  assert.match(CLIENT, /补上「\$\{part\}」/)
})

test('example ideas are clickable and disappear once typing starts', () => {
  assert.match(CLIENT, /const EXAMPLE_IDEAS = \[/)
  assert.match(CLIENT, /idea\.trim\(\) === ''/, 'hidden when the box has content')
  const ideas = CLIENT.slice(CLIENT.indexOf('EXAMPLE_IDEAS = ['))
  assert.ok((ideas.match(/key: '/g) ?? []).length >= 3, 'at least three starting points')
})

test('the library explains what the reference button does', () => {
  assert.match(CLIENT, /libraryHowTo:/)
  // And names the chosen record, so the toggle is not blind.
  assert.match(CLIENT, /basedOnRecord/)
  assert.match(CLIENT, /tr\(t, 'referencing', EN\.referencing\)/)
})

test('every new string exists in both languages', () => {
  for (const key of ['checkFixPrefix', 'exampleHint', 'libraryHowTo', 'referencing']) {
    const count = (CLIENT.match(new RegExp(`${key}:`, 'g')) ?? []).length
    assert.ok(count >= 2, `${key} must be defined in EN and ZH`)
  }
})
test('writing into the composer confirms where the text went', () => {
  // Reported: pressing 「回填到输入框」 left the screen unchanged, because the panel
  // and the composer are separate views. The confirmation now says so and offers
  // a jump back to the chat.
  assert.match(CLIENT, /sentBackWhere/)
  assert.match(CLIENT, /goToConversation/, 'a jump back must exist')
  assert.match(CLIENT, /layoutService\?\.selectPanel\?\.\('conversation'\)/, 'it uses the layout service')
  // And it must be captured reactively, not probed once: a single `ctx.get`
  // during apply leaves the handle null forever when the service arrives late.
  assert.match(CLIENT, /ctx\.inject\(\['layout'\]/, 'layout must be injected reactively')
  assert.doesNotMatch(CLIENT, /layoutService = ctx\.get\('layout'\)/, 'no one-shot probe')
})