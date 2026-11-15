window.__ModuleLoader__.load({
  id: 'dsh-wish-tree',
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
    /**
     * Library endpoints in probe order.
     *
     * The library MUST probe like the rewrite route does. It previously had a
     * single `/api/...` path with the failure swallowed by an empty `.catch`, so
     * when that path was unreachable the panel simply showed nothing and Refresh
     * appeared to do nothing at all — no error, no hint. Two paths plus a visible
     * error is the fix.
     */
    const LIBRARY_ENDPOINTS = ['/api/wish-tree/library', '/wish-tree-library']
    /** Remembered once a path answers, so later calls skip the probe. */
    let workingLibraryEndpoint = null
    /**
     * A rewrite that never settles must not pin the button in its busy state.
     *
     * Fixed and generous on purpose. v1.6.0 tried to learn a per-model budget
     * from a successful response, which meant the FIRST click always used the
     * short 90 s — exactly the click that timed out — and a timed-out call
     * never learned anything. Combined with a Host-side model probe that could
     * itself hang, the adaptive design was strictly worse than a constant.
     *
     * 240 s is safe because the button stays live: the user can cancel at any
     * moment, so a long wait is not a stuck button. A fast chat model simply
     * finishes early.
     */
    const DEFAULT_TIMEOUT_MS = 240000
    /** How long "restore the original" stays offered after an enhancement. */
    const UNDO_WINDOW_MS = 120000

    /** Composer and panel copy. `locale/*.json` holds only plugin-manager metadata. */
    const EN = {
      label: 'Wish Tree',
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
      timeout: 'The rewrite timed out — some reasoning models cannot be sped up; switch to a faster model',
      network: 'Prompt enhancement is unreachable',
      unauthorized: 'This page is not authorized for prompt enhancement',
      rateLimited: 'Too many rewrites just now — wait a moment and try again',
      tooLong: 'The message is too long to rewrite',
      notReady: 'The prompt service is not ready — restart DSH or reload the plugin',
      menuTitle: 'Choose a mode',
      modeRewrite: 'Professional prompt',
      modePolish: 'Polish only',
      modeRewriteHint: 'I pick the technical defaults — you describe the need',
      modePolishHint: 'Keep length and structure, improve wording',
      // Panel
      panelTitle: 'Wish Tree',
      panelSubtitle: 'Type one idea. Take away a prompt you can send as-is.',
      renamed: 'Formerly "Prompt Enhancer" — same plugin, now with a panel and a prompt library.',
      wishLabel: 'Your idea',
      wishPlaceholder: 'e.g. make a deck for a client demo next week',
      sceneLabel: 'Scene',
      audienceLabel: 'Audience',
      standardsLabel: 'Standards',
      standardsHint: 'Optional checklists for the result — not a persona. Leave empty and nothing is added.',
      busyHint: 'The model is thinking. Slow reasoning models can take a few minutes.',
      slowHint: 'Still running — this model reasons slowly and cannot be sped up. You can switch model or keep waiting.',
      cancel: 'Cancel',
      generate: 'Generate',
      generating: 'Generating…',
      copied: 'Copied',
      copy: 'Copy',
      sendBack: 'Use in composer',
      sentBack: 'Written into the composer',
      libraryTitle: 'Prompt library',
      librarySearch: 'Search prompts',
      librarySaved: 'Saved',
      libraryBrowse: 'Browse',
      libraryRefresh: 'Refresh',
      libraryRefreshing: 'Refreshing…',
      libraryEmpty: 'Nothing matches that search',
      libraryNotLoaded: 'The library did not load. Press Refresh to try again.',
      libraryUse: 'Use as reference',
      libraryUsing: 'Referencing',
      librarySave: 'Save',
      libraryUnsave: 'Saved',
      libraryLicence: 'Licence',
      librarySource: 'Source',
      close: 'Close',
    }
    const ZH = {
      label: '许愿树',
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
      timeout: '提示词改写超时了 —— 有些推理模型无法调快，建议换个更快的模型',
      network: '连不上提示词增强服务',
      unauthorized: '当前页面没有调用提示词增强的权限',
      rateLimited: '刚才改写太频繁，稍等一下再试',
      tooLong: '内容太长，无法改写',
      notReady: '提示词服务未就绪 —— 请重启 DSH 或重新加载插件',
      menuTitle: '选择模式',
      modeRewrite: '专业提示词',
      modePolish: '仅润色',
      modeRewriteHint: '专业细节我来定，你只说需求',
      modePolishHint: '保持长度与结构，只改措辞',
      // 面板
      panelTitle: '许愿树',
      panelSubtitle: '写下一句想法，带走一份可以直接用的提示词。',
      renamed: '原名「增强提示词」—— 同一个插件，现在有独立面板和提示词宝库。',
      wishLabel: '你的想法',
      wishPlaceholder: '例如：下周给客户做产品演示，做个PPT',
      sceneLabel: '场景',
      audienceLabel: '受众',
      standardsLabel: '成稿规范',
      standardsHint: '可选项：给结果加可核验的检查项，不是给模型加身份。不选就不追加任何内容。',
      busyHint: '模型正在思考。推理模型可能需要几分钟。',
      slowHint: '仍在生成 —— 该模型思考较慢且无法调快，可换模型或继续等待。',
      cancel: '取消',
      generate: '生成',
      generating: '生成中…',
      copied: '已复制',
      copy: '复制',
      sendBack: '回填到输入框',
      sentBack: '已写入输入框',
      libraryTitle: '提示词宝库',
      librarySearch: '搜索提示词',
      librarySaved: '收藏',
      libraryBrowse: '浏览',
      libraryRefresh: '刷新',
      libraryRefreshing: '正在刷新…',
      libraryEmpty: '没有匹配的条目',
      libraryNotLoaded: '宝库没有加载成功 —— 请点「刷新」重试',
      libraryUse: '作为参考',
      libraryUsing: '参考中',
      librarySave: '收藏',
      libraryUnsave: '已收藏',
      libraryLicence: '许可',
      librarySource: '来源',
      close: '关闭',
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
      // ---- v1.8 panel ----
      '.dsh-wt-panel{display:flex;flex-direction:column;height:100%;min-height:0;overflow:auto;padding:20px 24px 28px;gap:16px;box-sizing:border-box}',
      '.dsh-wt-head{display:flex;flex-direction:column;gap:4px}',
      '.dsh-wt-title{font-size:18px;font-weight:600;line-height:26px;color:var(--dsw-alias-label-primary);margin:0}',
      '.dsh-wt-sub{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);margin:0}',
      '.dsh-wt-rename{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);padding:6px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-2);align-self:flex-start}',
      '.dsh-wt-section{display:flex;flex-direction:column;gap:8px}',
      '.dsh-wt-label{font-size:12px;font-weight:600;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-wt-textarea{width:100%;min-height:88px;resize:vertical;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;font-family:inherit;box-sizing:border-box}',
      '.dsh-wt-textarea:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-wt-row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}',
      '.dsh-wt-field{display:flex;flex-direction:column;gap:6px;min-width:150px}',
      '.dsh-wt-select{padding:6px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;font-family:inherit}',
      '.dsh-wt-primary{padding:8px 20px;border:0;border-radius:8px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-inverse, #fff);font-size:13px;font-weight:600;line-height:20px;cursor:pointer;font-family:inherit}',
      '.dsh-wt-primary:hover:not(:disabled){opacity:.9}',
      '.dsh-wt-primary:disabled{cursor:default;opacity:.5}',
      '.dsh-wt-primary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dsh-wt-ghost{padding:5px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;cursor:pointer;font-family:inherit}',
      '.dsh-wt-ghost:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-wt-ghost:disabled{cursor:default;opacity:.5}',
      '.dsh-wt-ghost[data-on="true"]{background:var(--dsw-alias-bg-layer-2);font-weight:600}',
      '.dsh-wt-ghost:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsh-wt-result{padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:22px;white-space:pre-wrap;word-break:break-word;max-height:320px;overflow:auto}',
      '.dsh-wt-actions{display:flex;gap:8px;flex-wrap:wrap}',
      '.dsh-wt-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-wt-status[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-wt-status[data-tone="done"]{color:var(--dsw-alias-state-success-primary)}',
      '.dsh-wt-libhead{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
      '.dsh-wt-search{flex:1;min-width:160px;padding:6px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;font-family:inherit}',
      '.dsh-wt-cats{display:flex;gap:6px;flex-wrap:wrap}',
      '.dsh-wt-list{display:flex;flex-direction:column;gap:8px;max-height:360px;overflow:auto}',
      '.dsh-wt-item{padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:6px}',
      '.dsh-wt-item[data-selected="true"]{border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-wt-itemtitle{font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}',
      '.dsh-wt-itemmeta{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);display:flex;gap:10px;flex-wrap:wrap}',
      '.dsh-wt-itembody{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.dsh-wt-itemacts{display:flex;gap:6px;flex-wrap:wrap}',
      '.dsh-wt-sidebtn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;line-height:0}',
      '.dsh-wt-sidebtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-wt-sidebtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
    ].join('')

    /** Endpoint that answered once, so later clicks skip the probe order. */
    let workingEndpoint = null

    /**
     * Post one JSON body to the first endpoint that answers with JSON. A Host
     * error is definitive and throws; a document-shaped answer only rules that
     * endpoint out. A transport failure clears the cached endpoint so a Host
     * reconfigure is picked up on the next click.
     */
    /**
     * Post one library request, probing both paths.
     *
     * Returns `{ payload }` on success or `{ failure }` describing why nothing
     * came back. The caller shows that reason: a silent empty result was the
     * original defect, not a missing payload.
     *
     * @param {object} body - Request body.
     * @returns {Promise<{ payload?: object, failure?: string }>} Result.
     */
    async function postLibrary(body) {
      const candidates = workingLibraryEndpoint === null ? LIBRARY_ENDPOINTS : [workingLibraryEndpoint]
      let lastFailure = '无法连接提示词宝库服务'

      for (const endpoint of candidates) {
        let response
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
        } catch (error) {
          if (endpoint === workingLibraryEndpoint) workingLibraryEndpoint = null
          lastFailure = `连不上 ${endpoint}（${String(error?.message ?? 'network')}）`
          continue
        }
        const payload = await response.json().catch(() => undefined)
        if (payload === undefined) {
          // A non-JSON answer means no route of ours served this path.
          if (endpoint === workingLibraryEndpoint) workingLibraryEndpoint = null
          lastFailure = `${endpoint} 未返回数据（HTTP ${String(response.status)}）`
          continue
        }
        workingLibraryEndpoint = endpoint
        if (response.ok !== true) {
          return { failure: payload?.error?.message ?? `提示词宝库返回 HTTP ${String(response.status)}` }
        }
        return { payload }
      }
      return { failure: lastFailure }
    }

    /**
     * Post one rewrite request, probing both endpoints.
     *
     * @param {object} body - Request body.
     * @param {AbortSignal} [signal] - Cancellation.
     * @returns {Promise<object>} Parsed payload.
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
          // A non-JSON answer means no route of ours served this path: the
          // static shell answers 404/405 for paths the Host never registered.
          // Reporting the bare status hid that case ("HTTP 405" with no hint),
          // so keep the status but mark it as "no route" for the copy layer.
          lastError = new Error(`HTTP ${String(response.status)}`)
          lastError.noRoute = true
          lastError.status = response.status
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
      // No route answered: the Host half registered nothing for this path, which
      // is a plugin/service state problem rather than a request the user made
      // wrong. Say so instead of echoing a bare HTTP status.
      if (error?.noRoute === true) return tr(t, 'notReady', EN.notReady)
      const key = typeof error?.code === 'string' ? CODE_KEYS[error.code] : undefined
      if (key !== undefined) return tr(t, key, EN[key] ?? EN.failed)
      const message = typeof error?.message === 'string' ? error.message.trim() : ''
      if (message === '' || message === 'Failed to fetch' || message === 'Prompt enhancement is unreachable') {
        return tr(t, 'network', EN.network)
      }
      return message
    }

    /**
     * Storage key for the favourite ids.
     *
     * Favourites were held only in React state, so a page refresh silently
     * discarded them — the button worked, nothing was kept. They are stored as
     * plain id strings, never as records, so a rule change cannot resurrect a
     * stale copy of a prompt.
     */
    const SAVED_KEY = 'dsh-wish-tree:saved'

    /**
     * Read the favourite ids, degrading to an empty list.
     *
     * @returns {string[]} Saved ids.
     */
    function loadSaved() {
      try {
        const raw = localStorage.getItem(SAVED_KEY)
        if (typeof raw !== 'string' || raw === '') return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
      } catch {
        // Private mode or a blocked storage API: favourites simply do not persist.
        return []
      }
    }

    /**
     * Persist the favourite ids, swallowing every failure.
     *
     * @param {string[]} ids - Ids to store.
     */
    function storeSaved(ids) {
      try {
        localStorage.setItem(SAVED_KEY, JSON.stringify(Array.isArray(ids) ? ids : []))
      } catch {
        /* a full or blocked quota must not break the panel */
      }
    }
    /**
     * Filter library records for display.
     *
     * Extracted from the render body so the rule set has a name and one place to
     * change. `lib/wishlist.js` has an equivalent `searchLibrary` that the tests
     * cover; the Client cannot import an ESM module, so the two must be kept in
     * step by hand — the contract test in client-state asserts the rule shape.
     *
     * @param {object[]} records - Records to filter.
     * @param {{ query?: string, category?: string, view?: string, saved?: string[] }} options - Filters.
     * @returns {object[]} Matching records in source order.
     */
    function filterLibraryRecords(records, options = {}) {
      if (!Array.isArray(records)) return []
      const needle = typeof options.query === 'string' ? options.query.trim().toLowerCase() : ''
      const category = typeof options.category === 'string' ? options.category : 'all'
      const savedOnly = options.view === 'saved'
      const savedSet = new Set(Array.isArray(options.saved) ? options.saved : [])

      return records.filter((record) => {
        if (record === null || typeof record !== 'object') return false
        if (category !== 'all' && record.category !== category) return false
        if (savedOnly && !savedSet.has(record.id)) return false
        if (needle === '') return true
        // Every whitespace-separated word must appear somewhere in title, body or
        // tags, so a multi-word query narrows instead of widening.
        const haystack = `${record.title ?? ''}\n${record.body ?? ''}\n${(record.tags ?? []).join(' ')}`.toLowerCase()
        return needle.split(/\s+/).every((word) => haystack.includes(word))
      })
    }
    /** The one id shared by the sidebar icon and the `main` panel key. */
    const PANEL_KEY = 'wish-tree'
    /** Scene presets; keys only, the Host owns the wording. */
    const SCENES = [
      { key: 'general', zh: '通用', en: 'General' },
      { key: 'writing', zh: '写作', en: 'Writing' },
      { key: 'code', zh: '编程', en: 'Coding' },
      { key: 'analysis', zh: '分析', en: 'Analysis' },
      { key: 'design', zh: '设计', en: 'Design' },
      { key: 'learning', zh: '学习', en: 'Learning' },
    ]
    /** Audience presets; `auto` leaves the decision to the model. */
    const AUDIENCES = [
      { key: 'auto', zh: '自动判断', en: 'Auto' },
      { key: 'colleague', zh: '同事', en: 'Colleagues' },
      { key: 'client', zh: '客户', en: 'Clients' },
      { key: 'leader', zh: '领导', en: 'Management' },
      { key: 'public', zh: '大众', en: 'Public' },
    ]
    /** Library category chips. `all` is a view, not a stored category. */
    const CATEGORIES = [
      { key: 'all', zh: '全部', en: 'All' },
      { key: 'general', zh: '通用', en: 'General' },
      { key: 'writing', zh: '写作', en: 'Writing' },
      { key: 'code', zh: '编程', en: 'Coding' },
      { key: 'analysis', zh: '分析', en: 'Analysis' },
      { key: 'design', zh: '设计', en: 'Design' },
      { key: 'learning', zh: '学习', en: 'Learning' },
    ]
    /**
     * Optional delivery standards. These are CHECKLISTS, not personas: "at most
     * three type sizes" is verifiable, while "you are a design master" is not.
     * Keys only — the Host owns the wording.
     */
    const STANDARDS = [
      { key: 'deck', zh: '演示稿', en: 'Deck' },
      { key: 'document', zh: '文档', en: 'Document' },
      { key: 'code', zh: '代码', en: 'Code' },
      { key: 'writing', zh: '文案', en: 'Copy' },
    ]


    /**
     * Offline seed copy, inlined so the panel always has something to show.
     *
     * lib/seed.js is an ESM module the Client factory cannot import, so a
     * trimmed copy (title + first 70 characters of body) lives here. When the
     * Host route fails to answer, the panel falls back to these 25 entries
     * instead of rendering an empty box — "Refresh shows nothing" was reported
     * twice, and an empty list with no data is indistinguishable from a bug.
     */
    const FALLBACK_SEED_ROWS = [
      ["seed-gen-01", "讲给我这个外行听", "general", "请把下面这件事讲给完全不懂这个领域的人听。先用一句话说清它是什么，再用两三个日常类比展开，最后告诉我接下来该学什么。不要用行话；实在避不开的…"],
      ["seed-gen-02", "给我一份可执行的步骤", "general", "请把下面这个目标拆成分步骤的行动清单。每一步要写清做什么、大概花多久、做到什么程度算完成。把风险最高的一步放在最前面。最后告诉我今天就能开始…"],
      ["seed-gen-03", "公平地对比几个方案", "general", "请用同一套标准对比下面这几个选项，做成表格，一行一个选项，列写成本、投入精力、风险和适配度。然后给出你的推荐，并说明最强的反对理由。你不得不…"],
      ["seed-gen-04", "压缩但不能丢信息", "general", "请把下面的内容摘要成三层：一句话、五条要点、一小段话。原文里的数字、人名、日期一律原样保留。不要添加原文没有的信息。"],
      ["seed-gen-05", "帮我找出漏掉的东西", "general", "请通读下面的材料，重点列出现在还缺什么，而不是哪里写错了。每一条缺失都要说清为什么重要、补什么证据能填上。按「补上之后会不会改变结论」排序。"],
      ["seed-wri-01", "改写给特定的读者看", "writing", "请把下面的内容改写给指定的读者看。事实一律不变，只调整用词、句子长短和细节多少，使之贴合这位读者已经知道的东西。不要添加原文没有的说法。"],
      ["seed-wri-02", "删掉三成还不伤意思", "writing", "请把下面的文字删掉大约三成，但不能丢掉任何事实或细微差别。去掉填充词、含糊的限定和重复表达。保留作者原本的语气，以及那些承担了意义的技术词。"],
      ["seed-wri-03", "一封得体的工作邮件", "writing", "请就下面这件事写一封工作邮件。前两行就说清你要对方做什么，然后给最少的必要背景，最后写明期限。全文控制在 150 字以内，语气中性，不用感叹…"],
      ["seed-wri-04", "让别人五秒内找到答案", "writing", "请把下面这段文字重新组织，使读者五秒钟内能找到任何一个答案。用短标题，一段只讲一件事，原文里一口气罗列的内容改成分条。内容一个字都不要少。"],
      ["seed-cod-01", "要能跑的代码，不是草稿", "code", "请为下面这个任务写出完整可运行的代码。包含依赖导入、错误处理，以及一段简短的使用示例。说明语言版本和所有依赖的版本。不要留 TODO 占位；…"],
      ["seed-cod-02", "先说清 bug 是什么", "code", "对下面这段出错的代码：先用一句话说它本来要做什么，再说什么情况实际发生了什么，然后结合代码给出最可能的原因。这些说完才提修改方案，并且只给能…"],
      ["seed-cod-03", "只审正确性", "code", "请审查下面这段代码的正确性，不用管风格。逐条列出具体缺陷，写明出现在哪一行、什么输入会触发、期望结果与实际结果分别是什么。把确定的 bug …"],
      ["seed-cod-04", "安全地重构", "code", "请在不改变外部可见行为的前提下重构下面的代码。每处改动用一句话说明理由，并指出有什么测试能发现回归。如果某处必须改变行为，请停下来把差异列给…"],
      ["seed-ana-01", "先给结论", "analysis", "请分析下面的数据，按这个顺序回答：一句话结论、支撑它的三个最强事实（带数字）、最大的保留意见、还需要什么数据才会改变结论。不要复述数据本身来…"],
      ["seed-ana-02", "替我核对数字", "analysis", "请审计下面材料里的数字。每一个都要说明：它内部是否自洽、它是跟什么在比较、这个比较是否公平。凡是看着像基数或分母有问题的，都要标出来。"],
      ["seed-ana-03", "找根因，不是现象", "analysis", "针对下面这个情况，请把现象和原因分开。先列出所有可能的原因，再逐个说明什么证据能证实或排除它。最后给出最可能的那一个原因，以及验证它最省事的…"],
      ["seed-des-01", "层级清楚的版面", "design", "请为下面这个界面设计版面。先指出唯一最重要的元素，再说阅读顺序，然后说哪些可以删掉。字号和间距用相对关系表达，不要写死像素。同时说明窄屏下怎…"],
      ["seed-des-02", "无障碍要成为默认", "design", "请检查下面这个界面的无障碍问题，看对比度、焦点可见性、键盘顺序、标签和报错提示。每个问题都给出具体改法。会导致整个任务做不下去的，排在前面。"],
      ["seed-des-03", "能引导操作的界面文案", "design", "请为下面这个流程写界面文案：按钮文字、空状态、错误提示和一个确认提示。每一句都要让用户知道发生了什么、接下来该干什么。不要用行话，不要怪用户…"],
      ["seed-des-04", "演示稿：编辑级验收清单", "design", "交付前请按这张清单自查并修正不达标的地方：全文最多三种字号；每页只讲一个结论，且标题就是这个结论，而不是「产品功能」这类归类词；正文不超过五…"],
      ["seed-des-05", "演示稿：先结构后装饰", "design", "请按这个顺序做，结构没定下来之前不要动手做视觉：第一步，用一句话写清观众看完之后要做什么；第二步，只写每一页的标题，列成清单；第三步，每个标…"],
      ["seed-des-06", "演示稿：给清单，不给意见", "design", "请像一位资深设计负责人那样审下面这份演示稿，但结论要以清单形式给出，不要写成评价：每个问题都要写明页码、违反的是哪条规则、以及最小的修法。请…"],
      ["seed-lea-01", "用一个完整例子教会我", "learning", "请用下面这个概念教我。先给一个从头到尾走通的完整例子，再给第二个例子但留最后一步让我自己填。然后指出大多数人通常在哪一步出错。"],
      ["seed-lea-02", "配答案的练习题", "learning", "请就下面这个主题出一套练习题：五道题按难度递增，每题只考一个点。答案和解析放在最后，并用分隔线隔开，让我可以先自己做。其中要有一道题看起来相…"],
      ["seed-lea-03", "考考我到底懂没懂", "learning", "请就下面这个主题问我五个问题，一次只问一个，等我回答之后再问下一个。每次回答后告诉我答对没有、漏了什么。在我尝试之前不要先公布正确答案。"],
      ["seed-wri-05", "翻译并保住原意", "writing", "请把下面的内容翻译成英文。要求：不增不减信息，专有名词首次出现时保留原文并在括号里给中文；原文的语气和正式程度必须一致；数字、日期、单位按目…"],
      ["seed-wri-06", "查重与雷同风险", "writing", "请检查下面的文字是否存在与常见表述高度雷同的部分。逐段标注风险等级（高/中/低），对高风险段落指出雷同的典型表达是什么，并给出两个改写方向。…"],
      ["seed-wri-07", "一封有针对性的求职信", "writing", "请根据下面的岗位要求和个人经历写一封求职信。开头一段直接说明我能解决对方什么问题，中间用两段各讲一个具体经历并给出可核验的结果数字，结尾写清…"],
      ["seed-wri-08", "标题给多个方向", "writing", "请为下面的内容生成 8 个候选标题，覆盖四种思路各 2 个：直陈结论、点出数字、提出反常识、给出利益。每个标题不超过 20 字，不要用问号和…"],
      ["seed-cod-05", "审查技术文档", "code", "请审查下面的技术文档。逐条列出：哪句话会让读者产生歧义、哪个步骤缺了前提条件、哪个术语前后不一致。每条都要给出改写后的句子。不要评价文风，只…"],
      ["seed-cod-06", "写正则并解释", "code", "请为下面的匹配需求写出正则表达式。要求：先写正则，再用一句话说明它匹配什么、不匹配什么；列出至少 3 个应该匹配和 3 个不应该匹配的例子并…"],
      ["seed-cod-07", "规范的提交信息", "code", "请为下面的代码改动写一条提交信息。格式：第一行是祈使句摘要，不超过 50 字，说明改了什么；空一行；正文分点说明为什么改、有什么影响、是否需…"],
      ["seed-ana-04", "找出论证里的逻辑漏洞", "analysis", "请检查下面这段论证，逐条列出其中的逻辑问题。每一条要写明：问题出现在哪句话、属于哪类谬误（如以偏概全、因果倒置、虚假两难）、以及补上什么前提…"],
      ["seed-lea-04", "用提问带我想明白", "learning", "请用提问的方式帮我想清楚下面这件事，不要直接给答案。一次只问一个问题，根据我的回答决定下一个问题。目标是让我自己说出结论。如果我的回答里有明…"],
    ]

    /** Build records from the inlined rows, in the shape the panel renders. */
    const FALLBACK_SEED = FALLBACK_SEED_ROWS.map(([id, title, category, body]) => ({
      id,
      title,
      category,
      tags: [],
      body,
      language: 'zh',
      source: '内置库',
      sourceUrl: '',
      license: 'CC0-1.0',
      fetchedAt: '',
    }))
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

    /** Arrow that bends back, for the restore control. */    function UndoIcon() {
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
     * Read the recent transcript from the live chat store.
     *
     * Shared by the composer button and the panel. Returns '' in a fresh session
     * or when the store shape is unexpected, so a missing API degrades to the
     * previous context-free behaviour instead of failing the rewrite.
     *
     * @param chat - Live ChatSnapshot, or undefined.
     * @returns Transcript text, or ''.
     */
    function readTranscript(chat) {
      try {
        const nodes = chat?.legacy?.nodes
        if (!Array.isArray(nodes) || nodes.length === 0) return ''
        const lines = []
        for (const node of nodes) {
          if (node === null || typeof node !== 'object') continue
          const kind = node.kind
          if (kind !== 'user' && kind !== 'assistant') continue
          const blocks = kind === 'user' ? node.content : node.blocks
          if (!Array.isArray(blocks)) continue
          const parts = []
          for (const block of blocks) {
            if (block === null || typeof block !== 'object') continue
            if (block.type !== 'text' && block.kind !== 'text') continue
            if (typeof block.text !== 'string') continue
            const piece = block.text.trim()
            if (piece !== '') parts.push(piece)
          }
          const text = parts.join(' ').trim()
          if (text === '') continue
          lines.push(`${kind === 'user' ? '用户' : '助手'}：${text.length > 800 ? `${text.slice(0, 800)}…` : text}`)
        }
        const transcript = lines.slice(-8).join('\n')
        return transcript.length > 4000 ? transcript.slice(transcript.length - 4000) : transcript
      } catch {
        return ''
      }
    }

    /**
     * The 许愿树 panel.
     *
     * Reads conversation history lazily, at click time, and only through a ref:
     * `chat.legacy.nodes` is rebuilt on every publication, so subscribing during
     * render would re-render this panel on every token of every reply.
     *
     * The `main` slot does not expose `useChat` (its standard props are session
     * and workspace selectors only), so the panel degrades to a context-free
     * rewrite when the hook is absent. That is a quality difference, not a
     * failure: generation, the library and everything else keep working, and the
     * composer button still supplies context because its slot does expose it.
     */
    function WishTreePanel(props) {
      const { t, inputActions, useChat } = props
      const chat = typeof useChat === 'function' ? useChat((state) => state) : undefined
      const chatRef = React.useRef(chat)
      chatRef.current = chat

      const [idea, setIdea] = React.useState('')
      const [scene, setScene] = React.useState('general')
      const [audience, setAudience] = React.useState('auto')
      const [standards, setStandards] = React.useState([])
      const [phase, setPhase] = React.useState('idle')
      const [result, setResult] = React.useState('')
      const [error, setError] = React.useState('')
      const [basedOn, setBasedOn] = React.useState('')
      const [note, setNote] = React.useState(null)

      // Start from the inlined seed, not an empty array: a failed load used to
      // leave the library literally blank with no way to tell why.
      const [records, setRecords] = React.useState(FALLBACK_SEED)
      const [saved, setSaved] = React.useState(loadSaved)
      const [libOpen, setLibOpen] = React.useState(true)
      const [libView, setLibView] = React.useState('browse')
      const [query, setQuery] = React.useState('')
      const [category, setCategory] = React.useState('all')
      const [libLoading, setLibLoading] = React.useState(false)
      const [libNotice, setLibNotice] = React.useState('')
      const [libSource, setLibSource] = React.useState('seed')
      /** ISO timestamp of the last successful fetch, shown next to the count. */
      const [libFetchedAt, setLibFetchedAt] = React.useState('')
      /**
       * Seconds elapsed since the current generation started.
       *
       * A reasoning model that cannot disable thinking (hy4free: efforts = [high],
       * canDisableThinking false) can legitimately take minutes. Without a counter
       * the panel looked frozen for the whole 240 s budget, so the user could not
       * tell "still working" from "stuck" — the exact complaint this fixes.
       */
      const [elapsed, setElapsed] = React.useState(0)

      const abortRef = React.useRef(null)
      const mountedRef = React.useRef(true)

      React.useEffect(
        () => () => {
          mountedRef.current = false
          abortRef.current?.abort()
        },
        [],
      )

      // Load the library once on mount. `list` never touches the network, so the
      // panel is interactive immediately; a refresh is always user-initiated.
      React.useEffect(() => {
        let cancelled = false
        postLibrary({ action: 'list' })
          .then(({ payload, failure }) => {
            if (cancelled || !mountedRef.current) return
            if (failure !== undefined) {
              // Surface it: a silent empty library was the reported bug.
              setLibNotice(failure)
              return
            }
            if (Array.isArray(payload?.records)) {
              setRecords(payload.records)
              setLibSource(typeof payload.source === 'string' ? payload.source : 'seed')
              if (typeof payload.fetchedAt === 'string') setLibFetchedAt(payload.fetchedAt.slice(0, 10))
            }
          })
          .catch(() => {
            if (mountedRef.current) setLibNotice('加载提示词宝库失败')
          })
        return () => {
          cancelled = true
        }
      }, [])

      const flash = (message, tone) => setNote({ message, tone })

      // Drive the elapsed counter only while a request is in flight, so no timer
      // keeps running after the panel settles.
      React.useEffect(() => {
        if (phase !== 'busy') {
          setElapsed(0)
          return undefined
        }
        const startedAt = Date.now()
        setElapsed(0)
        const timer = setInterval(() => {
          if (!mountedRef.current) return
          setElapsed(Math.floor((Date.now() - startedAt) / 1000))
        }, 1000)
        return () => clearInterval(timer)
      }, [phase])

      const visible = React.useMemo(
        () => filterLibraryRecords(records, { query, category, view: libView, saved }),
        [records, query, category, libView, saved],
      )

      const refreshLibrary = () => {
        if (libLoading) return
        setLibLoading(true)
        setLibNotice('')
        postLibrary({ action: 'refresh' })
          .then(({ payload, failure }) => {
            if (!mountedRef.current) return
            if (failure !== undefined) {
              setLibSource('seed')
              setLibNotice(failure)
              return
            }
            if (Array.isArray(payload?.records)) setRecords(payload.records)
            if (payload?.ok === true) {
              setLibSource('remote')
              if (typeof payload.fetchedAt === 'string') setLibFetchedAt(payload.fetchedAt.slice(0, 10))
              // Name a partial failure instead of reporting a clean success: a
              // source being down is worth knowing when the count looks low.
              const failed = Array.isArray(payload.failed) ? payload.failed : []
              if (failed.length > 0) {
                setLibNotice(`部分来源未拉取到：${failed.join('、')}`)
              }
              flash(tr(t, 'done', EN.done), 'done')
            } else {
              setLibSource('seed')
              setLibNotice('离线或来源不可用，正在使用内置库')
            }
          })
          .catch(() => {
            if (!mountedRef.current) return
            setLibSource('seed')
            setLibNotice('离线或来源不可用，正在使用内置库')
          })
          .finally(() => {
            if (mountedRef.current) setLibLoading(false)
          })
      }

      const generate = () => {
        const wish = idea.trim()
        if (wish === '' || phase === 'busy') return
        setPhase('busy')
        setError('')

        const controller = new AbortController()
        abortRef.current = controller
        const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
        const context = readTranscript(chatRef.current)
        const body = { text: wish, mode: 'rewrite', scene, audience }
        // Standards travel as keys. Nothing is sent when the list is empty, so an
        // untouched panel behaves exactly like the previous release.
        if (standards.length > 0) body.standards = standards
        if (context !== '') body.context = context
        if (basedOn !== '') body.basedOn = basedOn

        postJson(body, controller.signal)
          .then((payload) => {
            if (!mountedRef.current) return
            if (typeof payload?.text === 'string' && payload.text.trim() !== '') {
              setResult(payload.text.trim())
              setPhase('done')
              setError('')
            } else {
              setPhase('error')
              setError('模型没有返回内容')
            }
          })
          .catch((failure) => {
            if (!mountedRef.current) return
            setPhase('error')
            setError(errorText(t, failure))
          })
          .finally(() => {
            clearTimeout(timer)
            abortRef.current = null
            if (mountedRef.current) setPhase((current) => (current === 'busy' ? 'idle' : current))
          })
      }

      const copyResult = () => {
        const text = result
        if (text === '') return
        try {
          void navigator.clipboard?.writeText(text)
          flash(tr(t, 'copied', EN.copied), 'done')
        } catch {
          flash(tr(t, 'failed', EN.failed), 'error')
        }
      }

      const sendBack = () => {
        if (result === '' || typeof inputActions?.setDraft !== 'function') return
        inputActions.setDraft(result)
        flash(tr(t, 'sentBack', EN.sentBack), 'done')
      }

      const toggleSave = (id) => () =>
        setSaved((current) => {
          const next = current.includes(id) ? current.filter((value) => value !== id) : [id, ...current]
          storeSaved(next)
          return next
        })

      const field = (labelText, value, onChange, options, lang) =>
        h(
          'div',
          { className: 'dsh-wt-field' },
          h('span', { className: 'dsh-wt-label' }, labelText),
          h(
            'select',
            { className: 'dsh-wt-select', value, onChange: (event) => onChange(event.target.value) },
            options.map((option) =>
              h('option', { key: option.key, value: option.key }, lang === 'zh' ? option.zh : option.en),
            ),
          ),
        )

      const zh = /^zh/.test(typeof navigator !== 'undefined' ? navigator.language || '' : '')

      return h(
        'div',
        { className: 'dsh-wt-panel' },
        h(
          'div',
          { className: 'dsh-wt-head' },
          h('h2', { className: 'dsh-wt-title' }, tr(t, 'panelTitle', EN.panelTitle)),
          h('p', { className: 'dsh-wt-sub' }, tr(t, 'panelSubtitle', EN.panelSubtitle)),
          h('span', { className: 'dsh-wt-rename' }, tr(t, 'renamed', EN.renamed)),
        ),
        h(
          'div',
          { className: 'dsh-wt-section' },
          h('span', { className: 'dsh-wt-label' }, tr(t, 'wishLabel', EN.wishLabel)),
          h('textarea', {
            className: 'dsh-wt-textarea',
            value: idea,
            placeholder: tr(t, 'wishPlaceholder', EN.wishPlaceholder),
            onChange: (event) => setIdea(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) generate()
            },
          }),
        ),
        h(
          'div',
          { className: 'dsh-wt-row' },
          field(tr(t, 'sceneLabel', EN.sceneLabel), scene, setScene, SCENES, zh ? 'zh' : 'en'),
          field(tr(t, 'audienceLabel', EN.audienceLabel), audience, setAudience, AUDIENCES, zh ? 'zh' : 'en'),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-wt-primary',
              disabled: idea.trim() === '' || phase === 'busy',
              onClick: generate,
            },
            phase === 'busy'
              ? `${tr(t, 'generating', EN.generating)} ${String(elapsed)}s`
              : tr(t, 'generate', EN.generate),
          ),
        ),
        h(
          'div',
          { className: 'dsh-wt-section' },
          h(
            'div',
            { className: 'dsh-wt-row' },
            h('span', { className: 'dsh-wt-label' }, tr(t, 'standardsLabel', EN.standardsLabel)),
            ...STANDARDS.map((standard) =>
              h(
                'button',
                {
                  key: standard.key,
                  type: 'button',
                  className: 'dsh-wt-ghost',
                  'data-on': standards.includes(standard.key) ? 'true' : 'false',
                  onClick: () =>
                    setStandards((current) =>
                      current.includes(standard.key)
                        ? current.filter((value) => value !== standard.key)
                        : [...current, standard.key],
                    ),
                },
                zh ? standard.zh : standard.en,
              ),
            ),
          ),
          h('span', { className: 'dsh-wt-status' }, tr(t, 'standardsHint', EN.standardsHint)),
        ),
        phase !== 'busy'
          ? null
          : h(
              'div',
              { className: 'dsh-wt-row' },
              h(
                'span',
                { className: 'dsh-wt-status', 'data-tone': elapsed >= 30 ? 'error' : 'plain' },
                elapsed >= 30
                  ? tr(t, 'slowHint', EN.slowHint)
                  : tr(t, 'busyHint', EN.busyHint),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-wt-ghost',
                  onClick: () => abortRef.current?.abort(),
                },
                tr(t, 'cancel', EN.cancel),
              ),
            ),
        note === null
          ? null
          : h('span', { className: 'dsh-wt-status', 'data-tone': note.tone, role: 'status' }, note.message),
        error === ''
          ? null
          : h('span', { className: 'dsh-wt-status', 'data-tone': 'error', role: 'alert' }, error),
        result === ''
          ? null
          : h(
              'div',
              { className: 'dsh-wt-section' },
              h('span', { className: 'dsh-wt-label' }, tr(t, 'panelTitle', EN.panelTitle)),
              h('div', { className: 'dsh-wt-result' }, result),
              h(
                'div',
                { className: 'dsh-wt-actions' },
                h('button', { type: 'button', className: 'dsh-wt-ghost', onClick: copyResult }, tr(t, 'copy', EN.copy)),
                h(
                  'button',
                  { type: 'button', className: 'dsh-wt-ghost', onClick: sendBack },
                  tr(t, 'sendBack', EN.sendBack),
                ),
              ),
            ),
        h(
          'div',
          { className: 'dsh-wt-section' },
          h(
            'div',
            { className: 'dsh-wt-libhead' },
            h('span', { className: 'dsh-wt-label' }, tr(t, 'libraryTitle', EN.libraryTitle)),
            h('input', {
              className: 'dsh-wt-search',
              value: query,
              placeholder: tr(t, 'librarySearch', EN.librarySearch),
              onChange: (event) => setQuery(event.target.value),
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-wt-ghost',
                'data-on': libView === 'browse' ? 'true' : 'false',
                onClick: () => setLibView('browse'),
              },
              tr(t, 'libraryBrowse', EN.libraryBrowse),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-wt-ghost',
                'data-on': libView === 'saved' ? 'true' : 'false',
                onClick: () => setLibView('saved'),
              },
              tr(t, 'librarySaved', EN.librarySaved),
            ),
            h(
              'button',
              { type: 'button', className: 'dsh-wt-ghost', disabled: libLoading, onClick: refreshLibrary },
              libLoading ? tr(t, 'libraryRefreshing', EN.libraryRefreshing) : tr(t, 'libraryRefresh', EN.libraryRefresh),
            ),
          ),
          h(
            'div',
            { className: 'dsh-wt-cats' },
            CATEGORIES.map((item) =>
              h(
                'button',
                {
                  key: item.key,
                  type: 'button',
                  className: 'dsh-wt-ghost',
                  'data-on': category === item.key ? 'true' : 'false',
                  onClick: () => setCategory(item.key),
                },
                zh ? item.zh : item.en,
              ),
            ),
          ),
          libNotice === ''
            ? null
            : h('span', { className: 'dsh-wt-status', 'data-tone': 'error' }, libNotice),
          // A plain count, so the user can tell that a refresh actually stored
          // something instead of silently doing nothing.
          h(
            'span',
            { className: 'dsh-wt-status' },
            [
              zh ? `共 ${String(records.length)} 条` : `${String(records.length)} prompts`,
              libSource === 'cache'
                ? zh ? '已缓存' : 'cached'
                : libSource === 'remote'
                  ? zh ? '刚联网更新' : 'freshly fetched'
                  : zh ? '内置库' : 'built-in',
              libFetchedAt === '' ? '' : zh ? `上次 ${libFetchedAt}` : `last ${libFetchedAt}`,
            ]
              .filter((part) => part !== '')
              .join(' · '),
          ),
          visible.length === 0
            ? h(
                'span',
                { className: 'dsh-wt-status', 'data-tone': records.length === 0 ? 'error' : 'plain' },
                records.length === 0
                  ? tr(t, 'libraryNotLoaded', EN.libraryNotLoaded)
                  : tr(t, 'libraryEmpty', EN.libraryEmpty),
              )
            : h(
                'div',
                { className: 'dsh-wt-list' },
                visible.slice(0, 60).map((record) =>
                  h(
                    'div',
                    { key: record.id, className: 'dsh-wt-item', 'data-selected': basedOn === record.id ? 'true' : 'false' },
                    h('span', { className: 'dsh-wt-itemtitle' }, record.title ?? record.id),
                    h(
                      'span',
                      { className: 'dsh-wt-itemmeta' },
                      h('span', null, `${tr(t, 'librarySource', EN.librarySource)}: ${record.source ?? ''}`),
                      h('span', null, `${tr(t, 'libraryLicence', EN.libraryLicence)}: ${record.license ?? ''}`),
                    ),
                    h('span', { className: 'dsh-wt-itembody' }, record.body ?? ''),
                    h(
                      'div',
                      { className: 'dsh-wt-itemacts' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'dsh-wt-ghost',
                          'data-on': basedOn === record.id ? 'true' : 'false',
                          onClick: () => setBasedOn(basedOn === record.id ? '' : record.id),
                        },
                        basedOn === record.id ? tr(t, 'libraryUsing', EN.libraryUsing) : tr(t, 'libraryUse', EN.libraryUse),
                      ),
                      h(
                        'button',
                        { type: 'button', className: 'dsh-wt-ghost', onClick: toggleSave(record.id) },
                        saved.includes(record.id) ? tr(t, 'libraryUnsave', EN.libraryUnsave) : tr(t, 'librarySave', EN.librarySave),
                      ),
                    ),
                  ),
                ),
              ),
        ),
      )
    }

    /** Sidebar entry that selects the panel. */
    function WishTreeSidebarIcon(props) {
      const { t } = props
      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-wt-sidebtn',
          title: tr(t, 'panelTitle', EN.panelTitle),
          'aria-label': tr(t, 'panelTitle', EN.panelTitle),
        },
        h(WandIcon),
      )
    }

    /**
     * Composer control: one click opens the mode menu, choosing a mode starts the
     * rewrite, and a second click while running cancels it.
     */
    function WishTreeButton(props) {
      const { t, inputActions, useInput, useProjection, useChat } = props

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

      // Conversation history is read LAZILY, at click time, not during render.
      // `chat.legacy.nodes` is a flat ConversationNode[] rebuilt on every
      // publication; subscribing to it would re-render this button on every
      // token of every reply. `useChat` itself is only subscribed for a cheap
      // readiness signal, and the nodes are pulled from the live store on click.
      const chat = typeof useChat === 'function' ? useChat((state) => state) : undefined
      const chatRef = React.useRef(chat)
      chatRef.current = chat

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
          // Keep the ORIGINAL draft with the pending result. applyPending used to
          // record the current draft here, so after the user edited mid-flight
          // the undo button restored their edit instead of what they first wrote.
          setPending({ text: payload.text, snapshot })
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
        setOriginal(pending.snapshot)
        setEnhanced(pending.text)
        setUndoUntil(Date.now() + UNDO_WINDOW_MS)
        setPending(null)
        setFailed(false)
        flash(tr(t, 'applied', EN.applied), 'done')
      }

      /**
       * Read the recent transcript from the live chat store.
       *
       * Delegates to the shared `readTranscript`, which returns '' in a fresh
       * session or when the store shape is unexpected, so a missing API degrades
       * to the previous context-free behaviour instead of failing the rewrite.
       */
      const readConversation = () => readTranscript(chatRef.current)

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
        // History is context, so it is skipped for "polish only": that mode
        // promises to touch wording and nothing else, and feeding it background
        // invites drift. It is also skipped on a re-run of an already-enhanced
        // draft, where the source is the user's original text.
        if (chosenMode === 'rewrite') {
          const context = readConversation()
          if (context !== '') body.context = context
        }
        if (typeof selection?.provider === 'string') body.provider = selection.provider
        if (typeof selection?.model === 'string') body.model = selection.model

        setBusy(true)
        setFailed(false)

        const controller = new AbortController()
        abortRef.current = controller
        canceledRef.current = false
        const timer = setTimeout(() => {
          controller.abort()
        }, DEFAULT_TIMEOUT_MS)

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
          () => ctx.locale.register('dsh-wish-tree', { en: EN, 'zh-CN': ZH, zh: ZH }),
          'dsh-wish-tree: composer and panel copy',
        )
        ctx.effect(() => {
          const element = document.createElement('style')
          element.dataset.promptEnhancer = 'styles'
          element.textContent = STYLE
          document.head.appendChild(element)
          return () => {
            element.remove()
          }
        }, 'dsh-wish-tree: stylesheet')
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register(
            { name: 'conversation.input.right', id: 'wish-tree', order: 28, locale: 'dsh-wish-tree' },
            WishTreeButton,
          ),
        )
        // Panel registrations. The sidebar icon and the `main` key share one id
        // so the icon selects this panel; the composer button above is a
        // fallback entry in case a future host stops routing icon clicks.
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_KEY, order: 40, label: '许愿树', locale: 'dsh-wish-tree' },
            WishTreeSidebarIcon,
          ),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_KEY, locale: 'dsh-wish-tree' }, WishTreePanel),
        )
      },
    }
  },
})
