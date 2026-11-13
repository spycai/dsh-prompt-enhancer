/**
 * Boot-order regression coverage.
 *
 * The plugin must register its routes when the services arrive, not only when
 * they happen to exist during `apply`. A probe-at-apply-time version silently
 * skipped registration on a Desktop boot where `webServer`/`connection` were
 * created after the plugin row activated: the row reported `active` while
 * `/prompt-enhance` answered 404 and every rewrite failed with HTTP 405.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apply } from '../index.js'

/**
 * Build a context whose services appear only when the test says so.
 *
 * `inject` records the pending callbacks instead of resolving them, which is
 * exactly what the Host does while a service is still missing.
 *
 * @returns Handles to release the services and inspect what got registered.
 */
function lateServicesHarness() {
  const routes = new Map()
  const webRoutes = new Map()
  const pending = []
  const effects = []

  const llm = {
    async *stream() {
      yield { type: 'text-delta', index: 0, text: '结果' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }

  const services = {
    connection: {
      fetch: {
        register(route) {
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
    },
    webServer: {
      register(route) {
        webRoutes.set(route.path, route)
        return () => webRoutes.delete(route.path)
      },
    },
  }

  const makeScope = (names) => {
    const scope = {
      llm,
      get: (name) => services[name],
      effect: (fn, label) => {
        effects.push(label)
        const dispose = fn()
        return () => {
          if (typeof dispose === 'function') dispose()
        }
      },
      inject: (inner, callback) => {
        pending.push({ names: inner, callback })
        return () => {}
      },
    }
    for (const name of names) scope[name] = services[name]
    return scope
  }

  const ctx = {
    llm,
    get: () => undefined,
    effect: (fn, label) => {
      effects.push(label)
      fn()
      return () => {}
    },
    inject: (names, callback) => {
      pending.push({ names, callback })
      return () => {}
    },
  }

  apply(ctx, {})

  return {
    routes,
    webRoutes,
    pending,
    effects,
    /** Resolve every pending injection whose services are now available. */
    release() {
      const still = []
      for (const entry of pending) {
        if (entry.names.every((name) => services[name] !== undefined)) {
          entry.callback(makeScope(entry.names))
        } else {
          still.push(entry)
        }
      }
      pending.length = 0
      pending.push(...still)
    },
  }
}

test('routes wait for their services instead of vanishing when they are late', () => {
  const harness = lateServicesHarness()

  // The services exist in this fixture but `get()` returns undefined and the
  // implementations only run when the injections are released — the same shape
  // as a Desktop boot where the plugin activates before the web server.
  assert.equal(harness.routes.size, 0, 'nothing is registered synchronously')
  assert.equal(harness.webRoutes.size, 0, 'nothing is registered synchronously')
  assert.equal(harness.pending.length, 2, 'both routes wait for their service')

  harness.release()

  assert.ok(
    harness.routes.has('/api/prompt-enhancer/enhance'),
    'the connection-bridge route registers once connection exists',
  )
  assert.ok(harness.webRoutes.has('/prompt-enhance'), 'the plain web route registers once webServer exists')
  assert.equal(harness.pending.length, 0, 'no injection stays unresolved')
})

test('each route asks only for the service it needs', () => {
  const harness = lateServicesHarness()
  const requested = harness.pending.map((entry) => entry.names.join('+')).sort()
  assert.deepEqual(requested, ['connection', 'webServer'])
})
