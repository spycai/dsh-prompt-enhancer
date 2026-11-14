# dsh-prompt-enhancer

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：在对话框工具栏、模型选择器左边加一个魔棒按钮，把你随手写的一句话改写成专业提示词。

**作者**：spycai <9680871@qq.com> · **许可证**：MIT

## 它能做什么

在输入框里写一句需求（中文或英文都行），点魔棒，选一种模式：

| 模式 | 效果 |
| --- | --- |
| **专业提示词** | 重写成完整、可直接执行的提示词；技术细节由模型自己定主流方案并标 `[默认：…，可改]`，不要求你懂技术 |
| **仅润色** | 保持长度与结构，只把措辞改得更清楚专业 |

改写结果直接替换输入框内容，旁边出现 **↩ 还原**（120 秒内可一键恢复）。改写中再点按钮可取消；菜单支持键盘（方向键、`Home`/`End`、`Esc`）。

## 它怎么工作（关于你的 API 密钥）

**这个插件不自带模型，也不接触你的 API 密钥。**

它调用 DSH 宿主提供的 `ctx.llm.stream({ provider, model, ... })`，用你**当前会话正在使用的模型**做一次改写。凭证由 DSH 自己持有和读取，插件只传入「provider/model 名字 + 文本」，网络请求只发往**本机**的 `/api/prompt-enhancer/enhance`，不访问任何外部地址。

因此：别人拿到这个仓库的源码，也拿不到你的任何密钥或账号信息——源码里没有。

## 安装

见 [INSTALL.md](INSTALL.md)。支持：

- 从本地目录安装（`link:`）
- 从 Git 仓库安装（`github:spycai/dsh-prompt-enhancer`）

## 配置

`cordis.patch.yml` 里 9 个可选字段（都有默认值，不填也能用）：

`mode`、`maxTokens`、`temperature`、`reasoningEffort`、`maxInputChars`、`maxOutputChars`、`rateLimitPerMinute`、`provider`、`model`

`reasoningEffort` 留空表示跟随模型默认。**改写很慢时先把它设成 `low`**，再考虑换模型——推理模型的思考 token 也计入 `maxTokens`，所以默认值给了 4000 而不是 1400。

客户端超时会**自动适配**：插件在响应里带回该模型需要的等待时间（推理模型 4 分钟，普通模型 90 秒），下次点击沿用。不需要手动配置。

`schemastery` 是**可选**依赖：装不上时插件照常工作，只是没有可视化的配置校验界面。

## 开发

```bash
npm test              # 自动发现并运行 test/*.test.mjs（当前 98 条）
npm run baseline:check # 提示词质量门禁：用已录制样本对比，回退即失败
```

`npm test` 通过 `test/lib/run-tests.mjs` 自动发现所有 `*.test.mjs`，新增测试文件无需改配置；`test/manifest.test.mjs` 会校验 CI 的语法检查覆盖了全部生产源文件。

Host 半在 `index.js`（路由、鉴权、模型调用），Client 半在 `client.js`（按钮、菜单、还原、取消），纯逻辑在 `lib/prompt.js`（提示词与配置）和 `lib/timeout.js`（超时策略）。测试用假 `ctx` + 假 `ctx.llm` 跑通真实 Host 代码，不需要真实模型。

提示词质量基线、评估器与录制样本在 `test/lib/` 与 `test/fixtures/`；v2「许愿式」结构化输出目前是**设计稿**（`产出/v2设计稿/`），尚未接入运行时。

更详细的实现说明、审计报告与维护备注见 [`产出/`](产出/)。

## 许可证

MIT
