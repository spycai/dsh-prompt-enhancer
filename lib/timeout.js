/**
 * Timeout sizing for one rewrite.
 *
 * A reasoning model can take far longer than a chat model on the same prompt:
 * its thinking tokens are billed against the same `maxTokens` budget, and some
 * routes cannot disable reasoning at all (Hy4 declares
 * `reasoning.defaultEffort: high` with thinking not switchable). A fixed 90 s
 * Client timeout therefore worked on chat models and failed on thinking models
 * — the exact fault reported against v1.5.5.
 *
 * The sizes live here, as pure functions, so the policy is testable without a
 * Host, a browser, or a model call.
 */

/** Bounds that keep a broken model from pinning the button forever. */
export const TIMEOUT_BOUNDS = {
  minMs: 30000,
  /** Ceiling for a plain chat model. */
  chatMs: 90000,
  /** A reasoning model gets longer, but not unbounded. */
  reasoningMs: 240000,
  /** Hard cap on whatever a caller asks for. */
  maxMs: 300000,
}

/**
 * Pick a request timeout from what the Host learned about the model.
 *
 * `reasoning === true` means the route reports reasoning metadata, which is the
 * only signal that reliably distinguishes a thinking model from a chat model.
 * An unknown answer falls back to the chat budget: guessing "reasoning" for
 * every model would let a hung chat call pin the button for four minutes.
 *
 * @param {{ reasoning?: boolean | undefined }} [info] - Model facts from the Host.
 * @returns Timeout in milliseconds.
 */
export function resolveRequestTimeout(info) {
  const reasoning = info?.reasoning === true
  const chosen = reasoning ? TIMEOUT_BOUNDS.reasoningMs : TIMEOUT_BOUNDS.chatMs
  return clampTimeout(chosen)
}

/**
 * Clamp an arbitrary timeout into the supported range.
 *
 * @param {unknown} value - Candidate milliseconds (number or numeric string).
 * @returns A safe timeout.
 */
export function clampTimeout(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(parsed)) return TIMEOUT_BOUNDS.chatMs
  return Math.min(TIMEOUT_BOUNDS.maxMs, Math.max(TIMEOUT_BOUNDS.minMs, Math.trunc(parsed)))
}

/**
 * Read the reasoning flag out of a model-info object, tolerating any shape.
 *
 * The Host passes `LlmResolvedModelInfo.reasoning` straight through; that field
 * is either absent or an object describing the available efforts.
 *
 * @param {unknown} modelInfo - Raw model metadata.
 * @returns `true` when the route reports reasoning support, `false` when it
 *   explicitly does not, and `undefined` when it cannot be told.
 */
export function readReasoningFlag(modelInfo) {
  if (modelInfo === null || typeof modelInfo !== 'object') return undefined
  const reasoning = modelInfo.reasoning
  if (reasoning === undefined || reasoning === null) return false
  if (typeof reasoning === 'boolean') return reasoning
  if (typeof reasoning === 'object') return true
  return undefined
}

/**
 * Decide the timeout the Host should advertise for a route.
 *
 * @param {unknown} modelInfo - Model metadata, or `undefined` when unavailable.
 * @param {number} fallbackMs - Timeout to use when the model cannot be read.
 * @returns {{ timeoutMs: number, reasoning: boolean }}
 */
export function describeTimeout(modelInfo, fallbackMs = TIMEOUT_BOUNDS.chatMs) {
  const flag = readReasoningFlag(modelInfo)
  if (flag === undefined) {
    return { timeoutMs: clampTimeout(fallbackMs), reasoning: false }
  }
  return { timeoutMs: resolveRequestTimeout({ reasoning: flag }), reasoning: flag }
}
