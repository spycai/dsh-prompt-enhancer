/**
 * Smoke test: actually run the panel component.
 *
 * Why this exists — a real regression reached the user: `zh` was declared after
 * two blocks that read it, which threw `Cannot access 'zh' before initialization`
 * during render and left the panel impossible to open. All 322 tests passed,
 * because every other assertion about client.js is a **text** check: it proves a
 * function is spelled correctly, never that it runs.
 *
 * This file loads the real bundle in a VM with a minimal React stand-in, calls
 * `apply()` to capture what registers into each slot, and then invokes the panel
 * component once. A reference error, a bad destructure or a stray `undefined`
 * method call now fails the suite instead of the user's entry point.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

/** A React stand-in: enough for one render, no reconciler. */
function makeReact() {
  const hooks = { index: 0, states: [] }
  return {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (initial) => {
      const slot = hooks.index
      hooks.index += 1
      if (hooks.states[slot] === undefined) {
        hooks.states[slot] = typeof initial === 'function' ? initial() : initial
      }
      return [hooks.states[slot], (next) => { hooks.states[slot] = typeof next === 'function' ? next(hooks.states[slot]) : next }]
    },
    useRef: (initial) => {
      const slot = `ref${String(hooks.index)}`
      hooks.index += 1
      hooks.refs ??= {}
      hooks.refs[slot] ??= { current: initial }
      return hooks.refs[slot]
    },
    useEffect: () => undefined,
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
    Fragment: 'Fragment',
    /** Reset between renders so each call starts from the initial state. */
    __reset: () => {
      hooks.index = 0
      hooks.states = []
    },
  }
}

/**
 * Load client.js, run apply(), and return the components registered per slot.
 *
 * @returns {{ components: Map<string, Function>, React: object }}
 */
function loadBundle(options = {}) {
  const code = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const React = makeReact()

  const registrations = []
  /** Every inject([...], cb) this plugin declares, in order. */
  const injectCalls = []
  const ctx = {
    inject: (names, callback) => {
      injectCalls.push([...names])
      // A real host hands the callback a scope that can read the declared
      // services; mirror that so the capture path is exercised.
      callback({ ...ctx, layout: options.layout, get: options.get ?? (() => undefined) })
    },
    effect: (callback) => {
      const dispose = callback()
      return dispose
    },
    get: options.get ?? (() => undefined),
    slots: {
      inject: (name, callback) => callback(),
      register: (options, component) => {
        registrations.push({ options, component })
        return () => undefined
      },
    },
    locale: { register: () => () => undefined },
    connection: { fetch: { register: () => () => undefined } },
    webServer: { register: () => () => undefined },
    logger: { warn: () => undefined },
  }

  const sandbox = {
    window: {
      __ModuleLoader__: {
        load: ({ factory }) => {
          sandbox.__factory = factory
        },
      },
    },
    React,
    console: { warn: () => undefined, error: () => undefined, log: () => undefined },
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    setInterval: () => 0,
    clearInterval: () => undefined,
    AbortController,
    fetch: () => new Promise(() => undefined),
    navigator: { language: 'zh-CN', clipboard: undefined },
    localStorage: { getItem: () => null, setItem: () => undefined },
    // The bundle injects one stylesheet on apply(); give it somewhere to go.
    document: {
      head: { appendChild: () => undefined },
      createElement: () => ({
        setAttribute: () => undefined,
        appendChild: () => undefined,
        remove: () => undefined,
        style: {},
        dataset: {},
        textContent: '',
      }),
      getElementById: () => null,
      querySelector: () => null,
    },
    URL,
    JSON,
    Math,
    Date,
    String,
    Number,
    Array,
    Object,
    Promise,
    Set,
    Map,
    Error,
    RegExp,
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(code, sandbox, { filename: 'client.js' })

  const factory = sandbox.__factory
  assert.equal(typeof factory, 'function', 'the bundle must register a factory')

  const moduleExports = factory((name) => {
    if (name === 'react') return React
    return {}
  })
  assert.equal(typeof moduleExports.apply, 'function', 'the bundle must export apply')

  moduleExports.apply(ctx, { autoRefreshHours: 0 })

  const components = new Map()
  for (const item of registrations) {
    components.set(item.options.name, item.component)
  }
  return { components, React, injectCalls, declaredInject: moduleExports.inject }
}

/** The `t` a real host provides; returning undefined makes `tr` use its fallback. */
const stubT = () => undefined

test('the bundle loads and registers every slot it promises', () => {
  const { components } = loadBundle()
  for (const name of ['conversation.input.right', 'sidebar.panellist', 'main']) {
    assert.equal(typeof components.get(name), 'function', `${name} must register a component`)
  }
})

test('the panel renders without throwing', () => {
  // The regression this guards: a `const` read before its declaration throws here.
  const { components, React } = loadBundle()
  const Panel = components.get('main')
  React.__reset()

  const tree = Panel({ t: stubT, inputActions: {}, useChat: undefined, useInput: undefined })
  assert.ok(tree !== undefined && tree !== null, 'the panel must return a tree')
  assert.equal(tree.type, 'div', 'the panel root is a container')
})

test('the panel renders with no data at all', () => {
  // A fresh session: no chat store, no library, no result. This is the state a
  // first-time user is in, and the one most likely to hit an undefined read.
  const { components, React } = loadBundle()
  const Panel = components.get('main')
  React.__reset()
  assert.doesNotThrow(() => Panel({ t: stubT }))
})

test('the composer button renders without throwing', () => {
  const { components, React } = loadBundle()
  const Button = components.get('conversation.input.right')
  React.__reset()
  assert.doesNotThrow(() =>
    Button({ t: stubT, inputActions: {}, useInput: () => ({ text: '' }), useProjection: () => undefined, useChat: undefined }),
  )
})

test('the sidebar icon renders without throwing', () => {
  const { components, React } = loadBundle()
  const Icon = components.get('sidebar.panellist')
  React.__reset()
  assert.doesNotThrow(() => Icon({ t: stubT }))
})

test('a throwing ctx.get does not stop activation', () => {
  // Same class of bug as the earlier `cannot get property "profileDir" without
  // inject`: a service probed during apply must degrade, never throw. `layout` is
  // read through ctx.get for exactly this reason.
  const { components } = loadBundle({
    get: () => {
      throw new Error('cannot get property "layout" without inject')
    },
  })
  assert.equal(typeof components.get('main'), 'function', 'the panel must still register')
})

test('a missing layout service degrades to a no-op switch', () => {
  const { components, React } = loadBundle({ get: () => undefined })
  React.__reset()
  assert.doesNotThrow(() => components.get('main')({ t: stubT }))
})



test('layout is injected reactively rather than probed once', () => {
  // The regression this guards: a single ctx.get during apply leaves the handle
  // null forever when the service arrives late, and the switch button then does
  // nothing without saying so.
  const { injectCalls, declaredInject } = loadBundle()
  // `layout` is declared at runtime through ctx.inject (reactive, does not gate
  // activation). `slots`/`locale` are the plugin-level declaration that does gate
  // activation — both must be present, in their respective forms.
  assert.equal(injectCalls.flat().includes('layout'), true, 'layout must be injected at runtime')
  assert.equal(Array.isArray(declaredInject), true, 'the plugin declares inject as an array')
  assert.equal(declaredInject.includes('slots'), true)
  assert.equal(declaredInject.includes('locale'), true)
  assert.equal(declaredInject.includes('layout'), false, 'layout must NOT gate activation')
})

test('a layout handle that throws on read does not crash activation', () => {
  // Same shape as the earlier ctx.profileDir bug: reading an injected handle can
  // throw, and that must not take the plugin down.
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error('cannot get property "layout" without inject')
      },
    },
  )
  const { components } = loadBundle({ layout: hostile })
  assert.equal(typeof components.get('main'), 'function', 'the panel must still register')
})
