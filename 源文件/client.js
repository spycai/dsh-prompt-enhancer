window.__ModuleLoader__.load({
  id: 'dsh-prompt-enhancer',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /**
     * Endpoints in probe order. The connection Fetch bridge path is the one a
     * Desktop window can reach (its page is `dsh-app://app/`, so a
     * document-relative path never touches the Host listener); the plain path
     * serves a page the Host itself rendered, and the Host admits it first.
     */
    const ENDPOINTS = ['/api/prompt-enhancer/enhance', '/prompt-enhance']
    /** A rewrite that never settles must not pin the button in its busy state. */
    const REQUEST_TIMEOUT_MS = 90000
    /** How long "restore the original" stays offered after an enhancement. */
    const UNDO_WINDOW_MS = 120000

    /** Composer copy. `locale/*.json` holds only plugin-manager metadata. */
    const EN = {
      label: 'Enhance prompt',
      undo: 'Restore the original text',
      busy: 'Rewriting the prompt… click to cancel',
      empty: 'Type a message in the composer first',
      done: 'Prompt rewritten',
      applied: 'Pending result applied',
      restored: 'Original text restored',
      changed: 'The draft changed meanwhile — click again to apply the result',
      canceled: 'Rewrite canceled',
      truncated: 'The result was cut off by the length limit',
      noModel: 'No model is selected for this session yet',
      failed: 'Prompt enhancement failed',
      timeout: 'The prompt rewrite timed out',
      network: 'Prompt enhancement is unreachable',
      unauthorized: 'This page is not authorized for prompt enhancement',
      rateLimited: 'Too many rewrites just now — wait a moment and try again',
      tooLong: 'The message is too long to rewrite',
      menuTitle: 'Choose a mode',
      modeRewrite: 'Professional prompt',
      modePolish: 'Polish only',
      modeRewriteHint: 'I pick the technical defaults — you describe the need',
      modePolishHint: 'Keep length and structure, improve wording',
    }
    const ZH = {
      label: '增强提示词',
      undo: '还原原文',
      busy: '正在改写提示词… 点击可取消',
      empty: '请先在对话框里输入内容',
      done: '提示词已增强',
      applied: '已写入上一次的结果',
      restored: '已还原原文',
      changed: '草稿已被修改，结果未写入 —— 再点一次可应用',
      canceled: '已取消改写',
      truncated: '结果被长度上限截断了',
      noModel: '当前会话还没有选择模型',
      failed: '提示词增强失败',
      timeout: '提示词改写超时了',
      network: '连不上提示词增强服务',
      unauthorized: '当前页面没有调用提示词增强的权限',
      rateLimited: '刚才改写太频繁，稍等一下再试',
      tooLong: '内容太长，无法改写',
      menuTitle: '选择模式',
      modeRewrite: '专业提示词',
      modePolish: '仅润色',
      modeRewriteHint: '专业细节我来定，你只说需求',
      modePolishHint: '保持长度与结构，只改措辞',
    }

    /** Stable failure code → copy key. */
    const CODE_KEYS = {
      EMPTY_INPUT: 'empty',
      INPUT_TOO_LONG: 'tooLong',
      BODY_TOO_LARGE: 'tooLong',
      NO_MODEL: 'noModel',
      UNAUTHORIZED: 'unauthorized',
      RATE_LIMITED: 'rateLimited',
    }

    /**
     * One stylesheet for the whole plugin, inserted once per page load by
     * `apply()` and removed when the plugin unloads. Rendering it inside the
     * component would re-create the element on every keystroke, because the
     * composer re-renders on each draft change.
     */
    const STYLE = [
      '.dsh-pe-root{position:relative;display:inline-flex;align-items:center;gap:2px}',
      '.dsh-pe-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;line-height:0}',
      '.dsh-pe-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-pe-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-pe-btn:disabled{cursor:default;opacity:.55}',
      '.dsh-pe-btn[data-busy="true"] svg{animation:dsh-pe-spin 1.1s linear infinite}',
      '.dsh-pe-btn[data-failed="true"]{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-pe-undo{width:24px;height:24px}',
      '.dsh-pe-note{position:absolute;right:0;bottom:calc(100% + 8px);z-index:3;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:5px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px;pointer-events:none}',
      '.dsh-pe-note[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-pe-note[data-tone="done"]{color:var(--dsw-alias-state-success-primary)}',
      '.dsh-pe-menu{position:absolute;right:0;bottom:calc(100% + 8px);z-index:4;display:flex;min-width:208px;flex-direction:column;padding:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-overlay)}',
      '.dsh-pe-item{display:flex;flex-direction:column;gap:2px;padding:7px 9px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;line-height:16px;text-align:left;cursor:pointer}',
      '.dsh-pe-item:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-pe-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dsh-pe-hint{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:14px}',
      '@keyframes dsh-pe-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
      '@media (prefers-reduced-motion: reduce){.dsh-pe-btn[data-busy="true"] svg{animation:none;opacity:.6}}',
    ].join('')

    /** Endpoint that answered once, so later clicks skip the probe order. */
    let workingEndpoint = null

    /**
     * Post one JSON body to the first endpoint that answers with JSON. A Host
     * error is definitive and throws; a document-shaped answer only rules that
     * endpoint out. A transport failure clears the cached endpoint so a Host
     * reconfigure is picked up on the next click.
     */
    async function postJson(body, signal) {
      const candidates = workingEndpoint === null ? ENDPOINTS : [workingEndpoint]
      let lastError
      for (const endpoint of candidates) {
        let response
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal,
          })
        } catch (error) {
          if (error?.name === 'AbortError') throw error
          if (endpoint === workingEndpoint) workingEndpoint = null
          lastError = error
          continue
        }
        const payload = await response.json().catch(() => undefined)
        if (payload === undefined) {
          if (endpoint === workingEndpoint) workingEndpoint = null
          lastError = new Error(`HTTP ${String(response.status)}`)
          continue
        }
        workingEndpoint = endpoint
        if (response.ok !== true) {
          const error = new Error(payload?.error?.message ?? `HTTP ${String(response.status)}`)
          error.code = payload?.error?.code
          throw error
        }
        return payload
      }
      throw lastError ?? new Error('Prompt enhancement is unreachable')
    }

    /** Read one localized string with a hardcoded fallback. */
    function tr(t, key, fallback) {
      if (typeof t === 'function') {
        try {
          const value = t(key)
          if (typeof value === 'string' && value !== '' && value !== key) return value
        } catch {
          /* a missing namespace falls through to the fallback */
        }
      }
      return fallback
    }

    /** Map a failure onto localized text, keyed by the stable code. */
    function errorText(t, error) {
      if (error?.name === 'AbortError') return tr(t, 'timeout', EN.timeout)
      const key = typeof error?.code === 'string' ? CODE_KEYS[error.code] : undefined
      if (key !== undefined) return tr(t, key, EN[key] ?? EN.failed)
      const message = typeof error?.message === 'string' ? error.message.trim() : ''
      if (message === '' || message === 'Failed to fetch' || message === 'Prompt enhancement is unreachable') {
        return tr(t, 'network', EN.network)
      }
      return message
    }

    /** Wand glyph. Inherits the control color so it matches the composer row. */
    function WandIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', 'aria-hidden': true, focusable: 'false' },
        h('path', {
          d: 'M9.9 1.9 10.95 4.75 13.8 5.8 10.95 6.85 9.9 9.7 8.85 6.85 6 5.8 8.85 4.75Z',
          fill: 'currentColor',
        }),
        h('path', { d: 'M2.4 13.6 8.2 7.8 9.4 9 3.6 14.8Z', fill: 'currentColor', opacity: 0.85 }),
        h('path', {
          d: 'M12.4 10.6 12.85 11.85 14.1 12.3 12.85 12.75 12.4 14 11.95 12.75 10.7 12.3 11.95 11.85Z',
          fill: 'currentColor',
          opacity: 0.7,
        }),
      )
    }

    /** Arrow that bends back, for the restore control. */
    function UndoIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': true, focusable: 'false' },
        h('path', {
          d: 'M6.2 3.4 2.8 6.8l3.4 3.4',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M2.8 6.8h6.1a3.3 3.3 0 0 1 0 6.6H6.2',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
        }),
      )
    }

    /**
     * Composer control: one click opens the mode menu, choosing a mode starts the
     * rewrite, and a second click while running cancels it.
     */
    function PromptEnhanceButton(props) {
      const { t, inputActions, useInput, useProjection } = props

      const draftValue =
        typeof useInput === 'function' ? useInput((state) => (state === undefined ? '' : state.draft)) : ''
      const draft = typeof draftValue === 'string' ? draftValue : ''
      const attachmentValue =
        typeof useInput === 'function'
          ? useInput((state) =>
              state === undefined || !Array.isArray(state.attachmentIds) ? 0 : state.attachmentIds.length,
            )
          : 0
      const attachments = typeof attachmentValue === 'number' ? attachmentValue : 0
      const projection = typeof useProjection === 'function' ? useProjection('modelSelection') : undefined

      const draftRef = React.useRef(draft)
      draftRef.current = draft

      const [busy, setBusy] = React.useState(false)
      const [failed, setFailed] = React.useState(false)
      const [note, setNote] = React.useState(null)
      const [menuOpen, setMenuOpen] = React.useState(false)
      const [original, setOriginal] = React.useState(null)
      const [enhanced, setEnhanced] = React.useState(null)
      const [undoUntil, setUndoUntil] = React.useState(0)
      const [pending, setPending] = React.useState(null)

      const abortRef = React.useRef(null)
      const canceledRef = React.useRef(false)
      const noteTimer = React.useRef(null)
      const rootRef = React.useRef(null)
      const wandRef = React.useRef(null)
      const menuRef = React.useRef(null)

      const canWriteDraft = typeof inputActions?.setDraft === 'function'
      const undoAvailable = original !== null && enhanced !== null && draft === enhanced && Date.now() < undoUntil

      React.useEffect(
        () => () => {
          if (noteTimer.current !== null) clearTimeout(noteTimer.current)
          abortRef.current?.abort()
        },
        [],
      )

      // The undo offer must disappear on its own; without this timer the button
      // would keep rendering until some unrelated state change re-rendered it.
      React.useEffect(() => {
        if (undoUntil === 0) return undefined
        const timer = setTimeout(() => {
          setUndoUntil(0)
        }, UNDO_WINDOW_MS)
        return () => {
          clearTimeout(timer)
        }
      }, [undoUntil])

      // Menu dismissal and keyboard operation: Escape closes, arrows move within
      // the menu, and focus returns to the wand when the menu closes.
      React.useEffect(() => {
        if (!menuOpen) return undefined
        const items = () =>
          menuRef.current === null ? [] : Array.from(menuRef.current.querySelectorAll('[role="menuitem"]'))
        const first = items()[0]
        if (first !== undefined) first.focus()
        const close = (event) => {
          if (event?.type === 'keydown' && event.key !== 'Escape') return
          if (event?.type === 'pointerdown' && rootRef.current !== null && event.target instanceof Node) {
            if (rootRef.current.contains(event.target)) return
          }
          setMenuOpen(false)
        }
        window.addEventListener('pointerdown', close, true)
        window.addEventListener('keydown', close, true)
        return () => {
          window.removeEventListener('pointerdown', close, true)
          window.removeEventListener('keydown', close, true)
          if (wandRef.current !== null) wandRef.current.focus()
        }
      }, [menuOpen])

      const onMenuKeyDown = (event) => {
        if (menuRef.current === null) return
        const items = Array.from(menuRef.current.querySelectorAll('[role="menuitem"]'))
        if (items.length === 0) return
        const index = items.indexOf(event.target)
        const focusAt = (next) => {
          const bounded = (next + items.length) % items.length
          items[bounded].focus()
          event.preventDefault()
        }
        if (event.key === 'ArrowDown') focusAt(index + 1)
        else if (event.key === 'ArrowUp') focusAt(index - 1)
        else if (event.key === 'Home') focusAt(0)
        else if (event.key === 'End') focusAt(items.length - 1)
      }

      const flash = (message, tone) => {
        setNote({ message, tone })
        if (noteTimer.current !== null) clearTimeout(noteTimer.current)
        noteTimer.current = setTimeout(() => {
          noteTimer.current = null
          setNote(null)
        }, 4000)
      }

      const applyResult = (payload, snapshot) => {
        if (!canWriteDraft) return
        if (draftRef.current !== snapshot) {
          setPending({ text: payload.text })
          flash(tr(t, 'changed', EN.changed), 'plain')
          return
        }
        inputActions.setDraft(payload.text)
        setOriginal(snapshot)
        setEnhanced(payload.text)
        setUndoUntil(Date.now() + UNDO_WINDOW_MS)
        setFailed(false)
        if (payload.truncated === true) flash(tr(t, 'truncated', EN.truncated), 'error')
        else flash(tr(t, 'done', EN.done), 'done')
      }

      const applyPending = () => {
        if (pending === null || !canWriteDraft) return
        inputActions.setDraft(pending.text)
        setOriginal(draft)
        setEnhanced(pending.text)
        setUndoUntil(Date.now() + UNDO_WINDOW_MS)
        setPending(null)
        setFailed(false)
        flash(tr(t, 'applied', EN.applied), 'done')
      }

      const run = (chosenMode) => {
        if (!canWriteDraft) {
          setFailed(true)
          flash(tr(t, 'failed', EN.failed), 'error')
          return
        }

        const current = draft.trim()
        if (current === '') {
          flash(tr(t, 'empty', EN.empty), 'plain')
          return
        }

        // Rewriting an already-enhanced draft starts from the original text, so
        // repeated clicks cannot drift further away from what the user wrote.
        const idempotent = enhanced !== null && original !== null && draft === enhanced
        const source = idempotent ? original.trim() : current
        const snapshot = draft
        const selection = projection?.next ?? projection?.lastUsed
        const body = { text: source, mode: chosenMode, attachments }
        if (typeof selection?.provider === 'string') body.provider = selection.provider
        if (typeof selection?.model === 'string') body.model = selection.model

        setBusy(true)
        setFailed(false)

        const controller = new AbortController()
        abortRef.current = controller
        canceledRef.current = false
        const timer = setTimeout(() => {
          controller.abort()
        }, REQUEST_TIMEOUT_MS)

        postJson(body, controller.signal)
          .then((payload) => {
            if (typeof payload?.text === 'string' && payload.text !== '') applyResult(payload, snapshot)
          })
          .catch((error) => {
            // A user cancel is not a failure: report it as a cancel and leave the
            // button in its normal state.
            if (canceledRef.current && error?.name === 'AbortError') {
              flash(tr(t, 'canceled', EN.canceled), 'plain')
              return
            }
            setFailed(true)
            flash(errorText(t, error), 'error')
          })
          .finally(() => {
            clearTimeout(timer)
            canceledRef.current = false
            abortRef.current = null
            setBusy(false)
          })
      }

      const cancel = () => {
        canceledRef.current = true
        abortRef.current?.abort()
      }

      const restore = () => {
        if (!canWriteDraft || original === null) return
        inputActions.setDraft(original)
        setOriginal(null)
        setEnhanced(null)
        setUndoUntil(0)
        setPending(null)
        flash(tr(t, 'restored', EN.restored), 'done')
      }

      const onWandClick = (event) => {
        event.preventDefault()
        if (busy) {
          cancel()
          return
        }
        if (!canWriteDraft) {
          setFailed(true)
          flash(tr(t, 'failed', EN.failed), 'error')
          return
        }
        if (pending !== null) {
          applyPending()
          return
        }
        if (draft.trim() === '') {
          flash(tr(t, 'empty', EN.empty), 'plain')
          return
        }
        setMenuOpen((open) => !open)
      }

      const startMode = (chosenMode) => {
        setMenuOpen(false)
        run(chosenMode)
      }

      const label = busy ? tr(t, 'busy', EN.busy) : failed && note !== null ? note.message : tr(t, 'label', EN.label)

      const modeItem = (value, title, hint) =>
        h(
          'button',
          {
            type: 'button',
            role: 'menuitem',
            className: 'dsh-pe-item',
            onMouseDown: (event) => {
              event.preventDefault()
            },
            onClick: () => {
              startMode(value)
            },
          },
          tr(t, title, EN[title]),
          h('span', { className: 'dsh-pe-hint' }, tr(t, hint, EN[hint])),
        )

      return h(
        'div',
        { className: 'dsh-pe-root', ref: rootRef },
        h(
          'button',
          {
            type: 'button',
            ref: wandRef,
            className: 'dsh-pe-btn',
            title: label,
            'aria-label': label,
            'aria-busy': busy ? 'true' : 'false',
            'data-busy': busy ? 'true' : 'false',
            'data-failed': failed ? 'true' : 'false',
            'aria-haspopup': 'menu',
            'aria-expanded': menuOpen ? 'true' : 'false',
            onMouseDown: (event) => {
              event.preventDefault()
            },
            onContextMenu: (event) => {
              event.preventDefault()
              if (!busy) setMenuOpen(true)
            },
            onClick: onWandClick,
          },
          h(WandIcon),
        ),
        undoAvailable
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-pe-btn dsh-pe-undo',
                title: tr(t, 'undo', EN.undo),
                'aria-label': tr(t, 'undo', EN.undo),
                onMouseDown: (event) => {
                  event.preventDefault()
                },
                onClick: (event) => {
                  event.preventDefault()
                  restore()
                },
              },
              h(UndoIcon),
            )
          : null,
        menuOpen
          ? h(
              'div',
              {
                className: 'dsh-pe-menu',
                role: 'menu',
                ref: menuRef,
                'aria-label': tr(t, 'menuTitle', EN.menuTitle),
                onKeyDown: onMenuKeyDown,
              },
              modeItem('rewrite', 'modeRewrite', 'modeRewriteHint'),
              modeItem('polish', 'modePolish', 'modePolishHint'),
            )
          : null,
        note === null
          ? null
          : h('span', { className: 'dsh-pe-note', role: 'status', 'data-tone': note.tone }, note.message),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register('dsh-prompt-enhancer', { en: EN, 'zh-CN': ZH, zh: ZH }),
          'dsh-prompt-enhancer: composer copy',
        )
        ctx.effect(() => {
          const element = document.createElement('style')
          element.dataset.promptEnhancer = 'styles'
          element.textContent = STYLE
          document.head.appendChild(element)
          return () => {
            element.remove()
          }
        }, 'dsh-prompt-enhancer: stylesheet')
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register(
            { name: 'conversation.input.right', id: 'prompt-enhancer', order: 27, locale: 'dsh-prompt-enhancer' },
            PromptEnhanceButton,
          ),
        )
      },
    }
  },
})
