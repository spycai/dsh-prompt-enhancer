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
    /** Library browse/refresh route on the same bridge. */
    const LIBRARY_ENDPOINT = '/api/wish-tree/library'
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

      const [records, setRecords] = React.useState([])
      const [saved, setSaved] = React.useState([])
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
        fetch(LIBRARY_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'list' }),
        })
          .then((response) => (response.ok ? response.json() : undefined))
          .then((payload) => {
            if (cancelled || !mountedRef.current) return
            if (Array.isArray(payload?.records)) {
              setRecords(payload.records)
              setLibSource(typeof payload.source === 'string' ? payload.source : 'seed')
              if (typeof payload.fetchedAt === 'string') setLibFetchedAt(payload.fetchedAt.slice(0, 10))
            }
          })
          .catch(() => {
            /* a missing seed leaves the panel usable: generation still works */
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

      const visible = React.useMemo(() => {
        const needle = query.trim().toLowerCase()
        const savedSet = new Set(saved)
        return records.filter((record) => {
          if (record === null || typeof record !== 'object') return false
          if (category !== 'all' && record.category !== category) return false
          if (libView === 'saved' && !savedSet.has(record.id)) return false
          if (needle === '') return true
          const haystack = `${record.title ?? ''}\n${record.body ?? ''}\n${(record.tags ?? []).join(' ')}`.toLowerCase()
          return needle.split(/\s+/).every((word) => haystack.includes(word))
        })
      }, [records, query, category, libView, saved])

      const refreshLibrary = () => {
        if (libLoading) return
        setLibLoading(true)
        setLibNotice('')
        fetch(LIBRARY_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'refresh' }),
        })
          .then((response) => response.json())
          .then((payload) => {
            if (!mountedRef.current) return
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
        setSaved((current) => (current.includes(id) ? current.filter((v) => v !== id) : [id, ...current]))

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
            ? h('span', { className: 'dsh-wt-status' }, tr(t, 'libraryEmpty', EN.libraryEmpty))
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
