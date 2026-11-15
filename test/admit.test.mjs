/**
 * Tests for Node-route admission.
 *
 * The behaviour under test is a security default, so it is asserted directly
 * rather than inferred from a green suite: **a request that cannot be verified
 * must be refused**, not allowed through. The previous code wrapped the check in
 * `if (connection !== undefined)` and failed open.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { admitNodeRequest } from '../index.js'

/** A response stub that records what was written. */
function makeRes() {
  return {
    statusCode: 0,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value
    },
    end(payload) {
      // Do not touch statusCode: sendJson sets it before calling end, and
      // overwriting here would hide a refusal as a success.
      this.body = payload
      this.writableEnded = true
    },
    writeHead(status) {
      this.statusCode = status
    },
    writableEnded: false,
  }
}

/** Minimal request stub; only headers matter here. */
const req = { headers: { cookie: 'session=abc' }, method: 'POST' }

test('an absent connection service refuses the request', () => {
  // Fail closed: no service means no way to verify the caller.
  const res = makeRes()
  const admitted = admitNodeRequest({ get: () => undefined }, req, res)
  assert.equal(admitted, false, 'must not admit what it cannot check')
  assert.equal(res.statusCode, 401)
  assert.match(String(res.body), /UNAUTHORIZED/)
})

test('a throwing ctx.get refuses rather than crashing', () => {
  const res = makeRes()
  const admitted = admitNodeRequest(
    {
      get: () => {
        throw new Error('cannot get property "connection" without inject')
      },
    },
    req,
    res,
  )
  assert.equal(admitted, false)
  assert.equal(res.statusCode, 401)
})

test('a rejecting admission refuses with its own status', () => {
  const res = makeRes()
  const admitted = admitNodeRequest({ get: () => ({ admit: () => ({ rejection: 403 }) }) }, req, res)
  assert.equal(admitted, false)
  assert.equal(res.statusCode, 403)
})

test('a throwing admit refuses with 401', () => {
  const res = makeRes()
  const admitted = admitNodeRequest(
    {
      get: () => ({
        admit: () => {
          throw new Error('bad headers')
        },
      }),
    },
    req,
    res,
  )
  assert.equal(admitted, false)
  assert.equal(res.statusCode, 401)
})

test('an accepted admission proceeds without writing a response', () => {
  const res = makeRes()
  const admitted = admitNodeRequest({ get: () => ({ admit: () => ({}) }) }, req, res)
  assert.equal(admitted, true)
  assert.equal(res.statusCode, 0, 'nothing must be written on success')
})

test('an admission object without a rejection is treated as accepted', () => {
  const res = makeRes()
  const admitted = admitNodeRequest({ get: () => ({ admit: () => ({ remaining: 3 }) }) }, req, res)
  assert.equal(admitted, true)
})
