/**
 * Host half of `dsh-prompt-enhancer`.
 *
 * The Client half (`./client.js`) owns the composer button; this half owns the
 * one model call behind it and the two entry points that reach it:
 *
 * - `ctx.connection.fetch` exact route under `/api` — the connection Fetch
 *   bridge. This is the only path a Desktop window can use, because its page is
 *   `dsh-app://app/` and a document-relative URL never reaches this listener.
 * - A plain `webServer` route at `/prompt-enhance` for a page the Host itself
 *   served. It admits the caller through `ctx.connection.admit()` first.
 */

import {
  buildConfigSchema,
  cleanOutput,
  failureOutcome,
  buildUserMessage,
  errorOutcome,
  isTruncated,
  llmFailureMessage,
  preserveMentions,
  randomNonce,
  resolveConfig,
  resolveMode,
  resolveRoute,
  systemPromptFor,
  validateDraft,
} from './lib/prompt.js'
import { describeTimeout } from './lib/timeout.js'
import { wrapContext } from './lib/context.js'

export const inject = ['llm']

/**
 * Loader-facing Config schema, when schemastery is resolvable.
 *
 * A junction-installed bundle has no dependency tree, so the import may fail;
 * `resolveConfig` then clamps the same fields. Exporting `undefined` keeps the
 * row valid (the Loader treats it as "no schema") instead of breaking activation.
 */
export const Config = await loadConfigSchema()

/**
 * Resolve the Config schema without letting a missing package break activation.
 *
 * @returns The schema, or `undefined` when unavailable.
 */
async function loadConfigSchema() {
  try {
    const loaded = await import('@deepseek-ai/schemastery')
    const z = loaded.default ?? loaded
    if (typeof z?.object !== 'function') return undefined
    return buildConfigSchema(z)
  } catch {
    return undefined
  }
}

/** Exact path the Client half posts to over the connection bridge. */
const API_PATH = '/api/prompt-enhancer/enhance'
/** Baseline path for a page served by the Host listener itself. */
const WEB_PATH = '/prompt-enhance'
/** Absolute ceiling; the effective limit may be lower for CJK-heavy drafts. */
const MAX_BODY_BYTES = 1024 * 1024

/**
 * Register both entry points for the lifetime of this plugin.
 *
 * Each route waits for its OWN service through `ctx.inject([...])` instead of
 * probing with `ctx.get()` once at apply time. That probe races the Desktop boot
 * order: the row activates before `webServer`/`connection` exist, the check sees
 * `undefined`, registration is skipped, and the route never appears again even
 * though the plugin reports `active`. `inject` is reactive, so the registration
 * happens whenever the service becomes available.
 *
 * @param ctx - Host context that has `llm` injected.
 * @param config - Row config from `cordis.patch.yml`.
 */
export function apply(ctx, config) {
  const settings = resolveConfig(config)
  /** Rough body allowance implied by the configured character cap (CJK ≈ 3 bytes). */
  const bodyLimit = Math.min(MAX_BODY_BYTES, settings.maxInputChars * 3 + 4096)
  /** Rewrite timestamps per session, for the optional minute limiter. */
  const recentCalls = new Map()

  mountRoute(ctx, ['connection'], `${API_PATH} (connection bridge)`, (scope) =>
    scope.connection.fetch.register({
      path: API_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request) => respond(scope, settings, bodyLimit, recentCalls, request),
    }),
  )

  mountRoute(ctx, ['webServer'], WEB_PATH, (scope) =>
    scope.webServer.register({
      kind: 'exact',
      path: WEB_PATH,
      handler: (req, res) => {
        void handleNode(scope, settings, bodyLimit, recentCalls, req, res)
      },
    }),
  )
}

/**
 * Run one route registration once its services exist, and fold the disposer into
 * the scope's effect so unloading removes it.
 *
 * A plain `ctx.get(name)` before the service exists would silently skip
 * registration for the whole session, so this prefers the reactive `inject`
 * and falls back to an immediate attempt only where `inject` is unavailable.
 *
 * @param ctx - Host context.
 * @param services - Service keys the registration depends on.
 * @param label - Effect label, also used in the warning text.
 * @param register - Receives a context where the services are present; returns a disposer.
 */
function mountRoute(ctx, services, label, register) {
  const mount = (scope) => {
    scope.effect(() => {
      let dispose
      try {
        dispose = register(scope)
      } catch (error) {
        warn(scope, `${label} was not registered`, error)
        return () => {}
      }
      return () => {
        try {
          const result = dispose()
          if (result !== undefined && typeof result.then === 'function') void result.catch(() => {})
        } catch {
          /* a route that is already gone needs no cleanup */
        }
      }
    }, `dsh-prompt-enhancer: ${label}`)
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(services, mount)
    return
  }
  mount(ctx)
}

/**
 * Record one warning without relying on an optional logger shape.
 *
 * @param ctx - Host context.
 * @param what - What failed.
 * @param error - Thrown value.
 */
function warn(ctx, what, error) {
  const detail = error instanceof Error ? error.message : String(error)
  try {
    if (typeof ctx.logger?.warn === 'function') {
      ctx.logger.warn(`dsh-prompt-enhancer: ${what}`)
    } else {
      console.warn(`dsh-prompt-enhancer: ${what}`)
    }
  } catch {
    /* a broken logger must not break activation */
  }
  if (detail !== '') console.warn(`dsh-prompt-enhancer: ${what}: ${detail}`)
}

/**
 * Answer one request that arrived over the connection Fetch bridge.
 *
 * @param ctx - Host context carrying `llm`.
 * @param settings - Resolved config.
 * @param bodyLimit - Effective request-body byte cap.
 * @param recentCalls - Per-session call timestamps.
 * @param request - Web Fetch request; its signal cancels the model call.
 * @returns The JSON response.
 */
async function respond(ctx, settings, bodyLimit, recentCalls, request) {
  let outcome
  try {
    const body = await readRequestJson(request, bodyLimit)
    outcome = await enhance(ctx, settings, recentCalls, body, request.signal)
  } catch (error) {
    outcome = failureOutcome(error)
  }
  return jsonResponse(outcome)
}

/**
 * Answer one request that arrived on the raw Host listener, after admitting it.
 *
 * @param ctx - Host context carrying `llm`.
 * @param settings - Resolved config.
 * @param bodyLimit - Effective request-body byte cap.
 * @param recentCalls - Per-session call timestamps.
 * @param req - Incoming HTTP request.
 * @param res - HTTP response owned by this handler.
 */
async function handleNode(ctx, settings, bodyLimit, recentCalls, req, res) {
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })

  const connection = ctx.get('connection')
  if (connection !== undefined) {
    let admission
    try {
      admission = connection.admit({ headers: req.headers })
    } catch {
      admission = { rejection: 401 }
    }
    if (admission.rejection !== undefined) {
      sendJson(res, admission.rejection, {
        error: { code: 'UNAUTHORIZED', message: 'This route requires a browser session.' },
      })
      return
    }
  }

  let outcome
  try {
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST')
      outcome = errorOutcome(405, 'METHOD_NOT_ALLOWED', 'Use POST.')
    } else {
      const body = await readJsonBody(req, bodyLimit)
      outcome = await enhance(ctx, settings, recentCalls, body, controller.signal)
    }
  } catch (error) {
    outcome = failureOutcome(error)
  }
  sendJson(res, outcome.status, outcome.payload)
}

/**
 * The one operation behind both entry points.
 *
 * @param ctx - Host context carrying `llm`.
 * @param settings - Resolved config.
 * @param recentCalls - Per-session call timestamps shared by both routes.
 * @param {Record<string, unknown>} body - Parsed request body.
 * @param {AbortSignal} [signal] - Caller cancellation.
 * @returns `{ status, payload }`.
 */
async function enhance(ctx, settings, recentCalls, body, signal) {
  const checked = validateDraft(body, settings)
  if (checked.error !== undefined) return checked.error

  const route = resolveRoute(settings, body, defaultSelection(ctx))
  if (route === undefined) {
    return errorOutcome(400, 'NO_MODEL', 'This session has no selected provider/model route yet.')
  }

  const limited = chargeRateLimit(settings, recentCalls)
  if (limited !== undefined) return limited

  const mode = resolveMode(settings, body)
  // Timeout is a fixed, generous budget (see lib/timeout.js). No model probe
  // happens here: v1.6.0 awaited llm.resolveModelInfo on the critical path and
  // that adapter call could itself hang, reproducing the very timeout it was
  // meant to prevent.
  const timeoutMs = describeTimeout(undefined).timeoutMs
  // History arrives already shaped by the Client, but it is still untrusted:
  // `wrapContext` re-tags it with this request's nonce so a past message that
  // literally contains a closing tag cannot break out of the block.
  const nonce = randomNonce()
  const contextBlock = wrapContext(readContext(body), nonce)
  const rewritten = await rewrite(
    ctx,
    settings,
    mode,
    route,
    checked.text,
    body.attachments,
    signal,
    contextBlock,
    nonce,
  )
  const text = preserveMentions(rewritten.text, checked.mentions)

  return {
    status: 200,
    payload: {
      text,
      provider: route.provider,
      model: route.model,
      mode,
      truncated: rewritten.truncated,
      mentions: checked.mentions,
      timeoutMs,
    },
  }
}

/**
 * Read the conversation transcript the Client sent, if any.
 *
 * Treated as untrusted text: only a string of bounded length is accepted, and
 * the caller re-tags it with a per-request nonce before it reaches the model.
 * An oversized value is truncated from the front — the newest exchange is what
 * the draft refers to, so older context is the safer thing to lose.
 *
 * @param {Record<string, unknown>} body - Parsed request body.
 * @returns Transcript text, or '' when absent.
 */
function readContext(body) {
  const raw = body?.context
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  const limit = 8000
  return trimmed.length > limit ? trimmed.slice(trimmed.length - limit) : trimmed
}

/**
 * Read the profile's default selection, tolerating an absent service.
 *
 * @param ctx - Host context.
 * @returns The current selection, or `undefined`.
 */
function defaultSelection(ctx) {
  try {
    return ctx.get('agentDefaultModel')?.currentSelection?.()
  } catch {
    return undefined
  }
}

/**
 * Enforce the optional per-minute rewrite budget.
 *
 * Requests are cheap to reject and expensive to run, so the check happens before
 * the model call. The map is pruned on every call, so it cannot grow without
 * bound across a long session.
 *
 * @param settings - Resolved config.
 * @param recentCalls - Per-session call timestamps.
 * @returns A rejection outcome, or `undefined` when the call may proceed.
 */
function chargeRateLimit(settings, recentCalls) {
  if (settings.rateLimitPerMinute <= 0) return undefined
  const now = Date.now()
  const windowStart = now - 60000
  const recent = (recentCalls.get('session') ?? []).filter((at) => at > windowStart)
  if (recent.length >= settings.rateLimitPerMinute) {
    return errorOutcome(429, 'RATE_LIMITED', 'Too many prompt rewrites in the last minute.')
  }
  recent.push(now)
  recentCalls.set('session', recent)
  return undefined
}

/**
 * Run the rewrite through the model service on one exact route.
 *
 * @param ctx - Host context carrying `llm`.
 * @param settings - Resolved config.
 * @param mode - 'rewrite' or 'polish'.
 * @param route - `{ provider, model }` selected for this session.
 * @param text - Trimmed composer draft.
 * @param attachmentCount - Composer attachments, when the Client reports them.
 * @param signal - Aborts when the caller drops the request.
 * @param conversationContext - Wrapped history block, or ''.
 * @param nonce - The same delimiter token used for the context block.
 * @returns `{ text, truncated }`.
 */
async function rewrite(ctx, settings, mode, route, text, attachmentCount, signal, conversationContext = '', nonce) {
  const count =
    typeof attachmentCount === 'number' && Number.isFinite(attachmentCount)
      ? Math.max(0, Math.trunc(attachmentCount))
      : 0
  let output = ''
  let failureReason
  let truncated = false

  for await (const chunk of ctx.llm.stream({
    provider: route.provider,
    model: route.model,
    system: systemPromptFor(mode),
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: buildUserMessage(text, count, nonce, conversationContext) }],
      },
    ],
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    // Omitted unless configured, so the provider keeps its own default. On a
    // reasoning model that cannot disable thinking this is the knob that keeps
    // a rewrite from spending its whole token budget on reasoning.
    ...(settings.reasoningEffort !== '' ? { reasoningEffort: settings.reasoningEffort } : {}),
    signal,
  })) {
    if (chunk.type === 'text-delta') {
      output += chunk.text
    } else if (chunk.type === 'finish') {
      const reason = chunk.reason
      if (reason.kind === 'error' || reason.kind === 'aborted') failureReason = reason.failure
      if (isTruncated(reason)) truncated = true
    }
  }

  if (failureReason !== undefined) {
    // The upstream text can name request ids and vendor internals: log it, do not
    // hand it to the Client.
    console.warn(
      `dsh-prompt-enhancer: model call failed (${String(failureReason.code ?? 'UNKNOWN')}): ${String(failureReason.message ?? '')}`,
    )
    throw httpError(failureReason.code ?? 'LLM_FAILED', llmFailureMessage(failureReason.code))
  }

  let cleaned = cleanOutput(output)
  if (cleaned === '') throw httpError('EMPTY_RESULT', 'The model returned an empty prompt.')
  if (settings.maxOutputChars > 0 && cleaned.length > settings.maxOutputChars) {
    cleaned = cleaned.slice(0, settings.maxOutputChars).trimEnd()
    truncated = true
  }

  return { text: cleaned, truncated }
}

/**
 * Read and parse a Web Fetch request body.
 *
 * @param request - Web Fetch request.
 * @param bodyLimit - Byte cap.
 * @returns Parsed JSON object (never `null`).
 */
async function readRequestJson(request, bodyLimit) {
  const raw = await request.text()
  if (Buffer.byteLength(raw, 'utf8') > bodyLimit) {
    throw httpError('BODY_TOO_LARGE', 'The request body is too large.')
  }
  return parseJson(raw)
}

/**
 * Read and parse the small JSON body the Node route expects.
 *
 * @param req - Incoming HTTP request.
 * @param bodyLimit - Byte cap.
 * @returns Parsed JSON object (never `null`).
 */
function readJsonBody(req, bodyLimit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > bodyLimit) {
        reject(httpError('BODY_TOO_LARGE', 'The request body is too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(parseJson(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

/**
 * Parse a JSON object body, rejecting anything else with a stable code.
 *
 * @param raw - Raw body text.
 * @returns Parsed object (never `null`).
 */
function parseJson(raw) {
  if (raw.trim() === '') throw httpError('INVALID_BODY', 'The request body must be JSON.')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw httpError('INVALID_BODY', 'The request body must be JSON.')
  }
  return parsed !== null && typeof parsed === 'object' ? parsed : {}
}

/**
 * Serialize one outcome as a Fetch response.
 *
 * @param outcome - `{ status, payload }`.
 * @returns The response.
 */
function jsonResponse(outcome) {
  return new Response(JSON.stringify(outcome.payload), {
    status: outcome.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Write one JSON response.
 *
 * @param res - HTTP response.
 * @param status - HTTP status code.
 * @param payload - JSON-serializable body.
 */
function sendJson(res, status, payload) {
  if (res.writableEnded) return
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * Build an error carrying a stable machine-readable code.
 *
 * @param code - Stable code the Client routes on.
 * @param message - Human-readable detail.
 * @returns The error.
 */
function httpError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}
