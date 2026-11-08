# 提示词增强按钮（DSH 插件）v1.5

在对话框工具栏、**模型选择器正左边**加一个魔棒按钮：点一下弹出「专业提示词 / 仅润色」两种模式，选一个就把输入框里的话改写成对应结果，并替换回输入框。

版本脉络：v1.1 修审计 P0/P1 → v1.2 默认值优先（不让不懂的人填空）→ v1.3 点一下看两个模式 → v1.4 修完第二轮审计 4 必修 + 6 中等 → v1.5 补上 Config schema（M-9）→ **v1.5.1 补齐工程基建（engines / npm test / git / CI），审计清单归零**。

## 安装状态

| 项 | 值 |
| --- | --- |
| 包名 | `dsh-prompt-enhancer` |
| 版本 | 1.5.1 |
| 安装方式 | junction 链接（改源码后禁用/启用插件即可热重载，无需重启 Desktop） |
| 链接目标 | `E:\deepseek harmess\01_主项目\dsh-prompt-enhancer\源文件` |
| 所在界面 | 输入框工具栏 `conversation.input.right`，`order: 27` |

## 怎么用

1. 在对话框里写一句需求（中英文都行）。
2. 点魔棒 → 弹出两个模式：
   - **专业提示词** —— 专业细节它自己定，你只说需求
   - **仅润色** —— 保持长度与结构，只改措辞
3. 选一个即开始改写；改写中再点魔棒 = **取消**（不会标成失败）。
4. 替换后旁边出现 **↩ 还原**（120 秒后自动消失），点一下恢复原文。
5. 菜单支持键盘：打开即聚焦，`↑`/`↓` 切换，`Home`/`End` 跳首尾，`Esc` 关闭并把焦点还给魔棒。

## v1.4 修复清单（对应 `审计报告-v1.3.0.md`）

| 审计项 | 修法 | 验证 |
| --- | --- | --- |
| **H1** 分隔符可突破 | 包裹标签改为**每请求随机 nonce**：`<user_message-{nonce}>`；草稿里的 `</user_message>` 不再能提前闭合 | 单测断言「有且仅有一个真闭合标签」；真机注入尝试 → 输出正常周报提示词，未泄露系统提示词 |
| **H2** 模式被配置覆盖 | 新增 `resolveMode`：请求里显式指定的模式**优先于**配置默认 | 单测 4 条；真机 `mode=rewrite` / `mode=polish` 各自生效 |
| **H3** provider/model 跨厂商拼接 | 新增 `resolveRoute`：以「provider+model 成对」为单位，依次取 body → config → 默认；只给一半的来源直接跳过 | 单测 2 条（含原缺陷复现用例）；真机路由正确 |
| **H4** 上游英文报错外泄 | 新增 `llmFailureMessage`：9 个已知码映射为稳定短语，未知码统一 `The model call failed.`；上游原文只进日志 | 单测 2 条；集成测试断言 `req_abc123` 不出现在响应里 |
| **M-5** 还原按钮不消失 | 为 `undoUntil` 加 `setTimeout(UNDO_WINDOW_MS)`，到点置 0，随组件卸载清理 | 代码路径审查 |
| **M-6** 取消被标红 | `setFailed(true)` 移到「是否用户取消」判断之后；两处触发点统一走 `cancel()` | 集成测试经 Host 验证 |
| **M-7** 英文答案被塞中文尾巴 | `preserveMentions` 检测答案语言，英文用 `Reference context:` | 单测 2 条 |
| **M-8** 菜单无键盘操作 | 打开聚焦首项、`↑↓/Home/End` 循环、`Esc` 关闭并还原焦点；`role` 语义与行为一致 | 代码路径审查 |
| **M-9** 无 Config schema | **v1.5 已做**：导出 schemastery `Config`，8 个字段全部带中文描述、默认值与范围。实测非法值被拒（`mode: "summarize"` / `maxTokens: 999999` / `temperature: -1`），Host 侧 `listConfigs` 状态由 `absent` 变为 `schema` | 单测 2 条；真机 schema 投影已核对 |
| **M-10** `temperature` 字符串失效 | 所有数值字段统一走 `Number.parseFloat` 归一化，支持小数 | 单测 3 条（含 `0.3` 小数） |
| **M-11** 文案两处真值 | client.js 内字典成为唯一真值；`locale/*.json` 只留插件管理器用的 `meta` 与 `description` | 文件对比 |
| **M-12** 无限流 | 新增 `rateLimitPerMinute`（默认 10）：按分钟窗口拒绝，返回 `RATE_LIMITED`；0 关闭 | 集成测试 2 条；真机连打 12 次 → 前 9 次 200、后 3 次 429 |
| **M-13** 输入上限与体积上限打架 | body 上限由 `maxInputChars * 3 + 4096` 推导（绝对上限 1 MiB），汉字 3 字节不再被提前拒绝 | 代码核对 |
| 低-14 备用入口不死 | 请求失败或返回非 JSON 时清空 `workingEndpoint`，下次重新探测 | 代码路径审查 |
| 低-15 无用 import | 删除 `DEFAULT_CONFIG` | — |
| 低-16 logger 吞错 | `warn()` 兜底到 `console.warn`，不再静默 | — |
| 低-17 每次渲染重建 style | 样表改为 `apply()` 内一次性注入，卸载时移除 | — |
| 低-18 无 `engines` | 未做（见下方） | — |

## 测试覆盖

```
cd 源文件 && npm test
# 等价于 node --test test/prompt.test.mjs test/enhance.integration.test.mjs
```

**38/38 通过**，分两层：

- `test/prompt.test.mjs`（24 条）：纯函数。重点覆盖 4 个必修缺陷的**回归断言**——注入用例断言「有且仅有一个真闭合标签」、模式优先级、路由成对、上游文案脱敏；另加 2 条 schema 测试（字段覆盖与非法值拒绝）。
- `test/enhance.integration.test.mjs`（14 条）：用假 `ctx` + 假 `ctx.llm` **跑通真实 `index.js`**，覆盖路由注册、body 解析、模式与路由解析、nonce 分隔、失败映射、限流、`@引用` 回填、坏 JSON。这是之前"临时加后门再删掉"做法的替代——现在同样能测带鉴权的路径，不用改代码。

## 可配置项（`cordis.patch.yml`，8 项全部暴露）

`mode`、`maxTokens`、`temperature`、`maxInputChars`、`maxOutputChars`、`rateLimitPerMinute`、`provider`、`model`（`provider`+`model` 需**同时**填才生效，避免跨厂商拼接）。

## 未修的项（如实标注）

审计报告 `审计报告-v1.3.0.md` 的问题清单**已全部关闭**。此前挂账的三项已于本版收尾：

| 项 | 处理结果 |
| --- | --- |
| 低-18 `engines.node` | **已加**：`"engines": { "node": ">=20" }`。junction 安装下它不参与实际校验，但作为清单声明有意义，也让 CI 与本地对齐（CI 用 Node 20）。 |
| 无 `test` 脚本 | **已加**：`npm test` 一条命令跑完全部 38 条。 |
| 仓库无 git/CI/lint | **已收**：git 仓库已初始化并完成首个提交（`6f9f45c`），`.gitignore` 排除了 `node_modules` 与 `临时/`；GitHub Actions `verify.yml` 做三件事——语法检查、跑测试、验证 `Config` 导出不致命。**未引入 lint 工具**（见下）。 |

**仍未做的一项**：没有引入 ESLint/Prettier。理由：本仓库没有构建步骤、没有第三方运行时依赖，引入 lint 意味着新增 `devDependencies`、配置文件和 CI 安装步骤，收益主要是风格统一，而当前风格的唯一真值就是现有代码。如果团队要多人协作，再补不迟——这属于决策，不是缺陷。

### CI 与"可选 schema"如何共存

`schemastery` 是可选依赖（junction 安装没有依赖树）。CI 机器上通常解析不到它，所以：

- 测试里的两条 schema 用例用 `skip` 而非 `fail`：**实测本地有 junction 时 38/38 全过，把 junction 改名后 36 过 + 2 跳过，无失败**。
- CI 额外跑一步验证 `apply` 仍是函数、`Config` 导出与否都不报错，保证"少了 schema 插件也能用"这条契约不被破坏。

## 工程基建（v1.5.1）

```
dsh-prompt-enhancer/
├── .gitignore              # 排除 node_modules（含 schemastery junction）与 临时/
├── .github/workflows/verify.yml
├── 产出/                    # README、审计报告
└── 源文件/                  # package.json / index.js / client.js / lib/ / test/ / locale/
```

首个提交：`6f9f45c dsh-prompt-enhancer v1.5.0: composer prompt enhancer`（14 文件，2302 行）。

## ⚠️ 依赖约束（v1.5 实测得出，务必保留）

**junction 安装的插件没有自己的依赖树**，`pnpm` 不会为 `link:` 目录装依赖。因此：

1. **不能**在 Host/Client 代码里 `import` 任何非 `node:` 的包 —— 实测 `@deepseek-ai/schemastery` 从插件真实路径解析会报 `ERR_MODULE_NOT_FOUND`，插件直接激活失败。
2. 本插件用**两条措施**解决：`Config` 走**动态导入 + 失败降级**（解析不到就导出 `undefined`，功能不受影响）；同时在本目录建了一个 `node_modules/@deepseek-ai/schemastery` **junction** 指向 profile 里那份，让解析成功。
3. 那个本地 junction **不要提交、不要打包**，`package.json` 的 `files` 白名单里也没有它 —— 它只在这台机器上让 schema 生效。换机器重新安装后若 schema 显示 `absent`，按同样办法建 junction 即可，**功能不会因此损坏**。
4. `peerDependencies` 里已把 `schemastery` 声明为 `optional: true`，明确它是可选的。

## 维护备注

- 改含中文的文件**不要**用 PowerShell 的 `Set-Content`/`-replace`：本轮实测两个后果——① 按 ANSI 读、UTF-8 写导致中文变乱码；② `-replace` 会**吞掉行尾换行**，把 `maxTokens` 拼到上一行注释上。一律用文件写入工具。
- 真机验证带鉴权的路由时，临时改 `ANONYMOUS_LOCAL_TEST` 绕过，验证完**必须恢复**（本轮已恢复并复验 401）。更好的办法是写集成测试（见 `test/enhance.integration.test.mjs`），不用改代码。
