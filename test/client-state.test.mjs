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
