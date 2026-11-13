# 安装说明

作者：spycai <9680871@qq.com>

## 前置条件

- 已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（Desktop 或 CLI）
- Node.js ≥ 20
- 插件会借用**你当前会话所选的模型**做改写，因此那个模型必须可用（有凭证、有额度）

插件本身**不需要任何 API 密钥**，也不自带模型。

## 方式一：从本地目录安装（推荐试玩）

1. 下载源码：
   ```bash
   git clone https://github.com/spycai/dsh-prompt-enhancer.git
   cd dsh-prompt-enhancer
   ```
   或直接下载 ZIP 解压。

2. 在 DSH 的 **设置 → 插件** 里选择「从本地目录安装」，指向**仓库根目录**（也就是含 `package.json` 的那一层）。

3. 装完在插件列表启用「提示词增强 / Prompt enhancer」。

> `package.json` 就在仓库根，不要指到任何子目录。

本机开发者也可以直接用 `link:` 协议把它挂到 profile 里，改源码后禁用/启用插件即可热重载，无需重启。

## 方式二：从 Git 仓库安装

在 DSH 的插件安装入口使用：

```
github:spycai/dsh-prompt-enhancer
```

或在 profile 的 `package.json` 依赖里写：

```json
"dsh-prompt-enhancer": "github:spycai/dsh-prompt-enhancer"
```

然后重新加载 profile。

> 本包已从 `private: true` 改为可发布，但**目前没有发布到 npm**。若要 `npm install`，需要先发版或等作者发布。

## 装完怎么确认

1. 打开任意对话，看输入框工具栏 —— 模型选择器左边应出现一个魔棒按钮。
2. 写一句话，点魔棒，应弹出「专业提示词 / 仅润色」两个选项。
3. 选一个，转圈结束后输入框内容被替换，旁边出现 ↩ 还原按钮。

### 配置界面可能不显示（正常）

`schemastery` 是可选依赖。以 `link:` / GitHub 协议安装的插件**没有自己的依赖树**，解析不到它时：

- 插件**功能完全正常**（`Config` 走动态导入 + 失败降级）
- 只是设置里的可视化配置校验界面不出现，Host 的 `listConfigs` 显示 `absent` 而不是 `schema`

如果你想要那个界面，在插件目录手工建一个指向 profile 内 `node_modules/@deepseek-ai/schemastery` 的本地链接即可。详见 [`产出/README.md`](产出/README.md)「依赖约束」。

## 常见问题

**Q：点按钮报「HTTP 405」或「提示词服务未就绪」？**

这表示插件的 **Host 半边没把路由注册上**，浏览器请求落到了静态资源兜底（它对 GET 答 404、对 POST 答空 405），所以看起来像 HTTP 错误。

v1.5.4 之前的原因：插件用 `ctx.get('webServer')` / `ctx.get('connection')` 在启动瞬间探测一次服务。DSH 桌面版升级后启动顺序变了——插件先激活、服务后创建——探测拿到 `undefined` 就**永久跳过注册**，插件显示“已启用/active”，但路由根本不存在。

**处理**：升级到 **v1.5.4 及以上**（改为 `ctx.inject([...])`，等服务就绪时注册）。仍报此错时，重启 DSH 一次。

**Q：装完显示「包元信息错误：ENOENT ... scandir '...\locale'」？**

这通常出现在用**简易安装器**（逐项复制文件、不支持通配符）安装旧版本时：旧版 `package.json` 的 `files` 写成 `locale/*.json`（通配符），简易安装器把这一项当成字面文件名、找不到就跳过，导致整个 `locale` 目录没被复制。DSH 读取插件标题/描述时要扫描该目录，于是报 ENOENT。

**处理**（任选其一）：

- 升级到 **v1.5.3 及以上**（`files` 已改为目录形式 `locale/`，两种安装器都能复制）
- 或手工把仓库里的 `locale/` 目录补到插件的安装目录下
- 这个错误**只影响标题/描述的显示**，插件功能本身正常（按钮照样出现）

**Q：点按钮没反应 / 提示"连不上服务"？**
多半是会话还没选模型，或模型凭证不可用。插件用的是当前会话的 provider/model 路由；先在模型选择器里选一个能用的模型再试。

**Q：改写会不会把我的话发给外部？**
不会。请求只发往本机 DSH 的 `/api/prompt-enhancer/enhance`，再由 DSH 用它自己配置的模型服务发起调用——和你正常聊天走的是同一条链路、同一份凭证。

**Q：会消耗我的额度吗？**
会，一次改写 = 一次模型调用，和正常提问一样。默认有每分钟 10 次的限流（`rateLimitPerMinute`），防止误触反复触发。

**Q：能撤销吗？**
能。改写后 120 秒内点 ↩ 可还原原文；也可以按 `Ctrl+Z`。

**Q：支持哪些语言？**
输入输出都保持原语言（中文进中文出、英文进英文出，不翻译）。

## 卸载

设置 → 插件 → 关闭或卸载「提示词增强」，或从 profile 的 `package.json` / bundles 里移除 `dsh-prompt-enhancer`。
