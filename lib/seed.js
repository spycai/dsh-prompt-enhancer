/**
 * Built-in seed library for 许愿树.
 *
 * **Chinese only.** These started as English summaries of well-known prompt
 * patterns, but a Chinese user browsing English prompt bodies gets nothing from
 * them, so every entry was rewritten in Chinese. The library is single-language
 * by design now — see `LIBRARY_LANGUAGE` in `sources.js`.
 *
 * Why a seed exists at all: the panel must be fully usable with no network. The
 * remote source adds the long tail; these 25 entries guarantee the library is
 * never empty and always covers every category.
 *
 * Provenance: the patterns follow the widely published prompt collections whose
 * content is dedicated to the public domain under CC0 1.0 (`f/prompts.chat`
 * publishes its prompt data that way). The wording here is original, written for
 * this plugin. The `license` field is what makes shipping them legal.
 */

/** Where the seed patterns come from. */
const SEED_SOURCE = 'prompts.chat'
const SEED_URL = 'https://github.com/f/prompts.chat'
const SEED_LICENSE = 'CC0-1.0'

/**
 * Build one seed record with the shared provenance fields filled in.
 *
 * @param {string} id - Stable id.
 * @param {string} title - Display title.
 * @param {string} category - One of the library categories.
 * @param {string[]} tags - Search tags.
 * @param {string} body - The prompt pattern.
 * @returns {object} Record ready for `normalizeRecord`.
 */
function seed(id, title, category, tags, body) {
  return {
    id,
    title,
    category,
    tags,
    body,
    language: 'zh',
    source: SEED_SOURCE,
    sourceUrl: SEED_URL,
    license: SEED_LICENSE,
    fetchedAt: '2026-11-15T00:00:00.000Z',
  }
}

/**
 * The seed set, curated for coverage of the six categories rather than volume.
 */
export const SEED_RECORDS = [
  // 通用
  seed('seed-gen-01', '讲给我这个外行听', 'general', ['讲解', '入门'], '请把下面这件事讲给完全不懂这个领域的人听。先用一句话说清它是什么，再用两三个日常类比展开，最后告诉我接下来该学什么。不要用行话；实在避不开的术语，就在同一句里解释清楚。'),
  seed('seed-gen-02', '给我一份可执行的步骤', 'general', ['计划', '步骤'], '请把下面这个目标拆成分步骤的行动清单。每一步要写清做什么、大概花多久、做到什么程度算完成。把风险最高的一步放在最前面。最后告诉我今天就能开始的那个动作。'),
  seed('seed-gen-03', '公平地对比几个方案', 'general', ['对比', '决策'], '请用同一套标准对比下面这几个选项，做成表格，一行一个选项，列写成本、投入精力、风险和适配度。然后给出你的推荐，并说明最强的反对理由。你不得不做的假设请单独列出来。'),
  seed('seed-gen-04', '压缩但不能丢信息', 'general', ['摘要', '提炼'], '请把下面的内容摘要成三层：一句话、五条要点、一小段话。原文里的数字、人名、日期一律原样保留。不要添加原文没有的信息。'),
  seed('seed-gen-05', '帮我找出漏掉的东西', 'general', ['审查', '挑错'], '请通读下面的材料，重点列出现在还缺什么，而不是哪里写错了。每一条缺失都要说清为什么重要、补什么证据能填上。按「补上之后会不会改变结论」排序。'),

  // 写作
  seed('seed-wri-01', '改写给特定的读者看', 'writing', ['改写', '读者'], '请把下面的内容改写给指定的读者看。事实一律不变，只调整用词、句子长短和细节多少，使之贴合这位读者已经知道的东西。不要添加原文没有的说法。'),
  seed('seed-wri-02', '删掉三成还不伤意思', 'writing', ['精简', '删减'], '请把下面的文字删掉大约三成，但不能丢掉任何事实或细微差别。去掉填充词、含糊的限定和重复表达。保留作者原本的语气，以及那些承担了意义的技术词。'),
  seed('seed-wri-03', '一封得体的工作邮件', 'writing', ['邮件', '职场'], '请就下面这件事写一封工作邮件。前两行就说清你要对方做什么，然后给最少的必要背景，最后写明期限。全文控制在 150 字以内，语气中性，不用感叹号。另给一个主题。'),
  seed('seed-wri-04', '让别人五秒内找到答案', 'writing', ['结构', '排版'], '请把下面这段文字重新组织，使读者五秒钟内能找到任何一个答案。用短标题，一段只讲一件事，原文里一口气罗列的内容改成分条。内容一个字都不要少。'),

  // 编程
  seed('seed-cod-01', '要能跑的代码，不是草稿', 'code', ['代码', '实现'], '请为下面这个任务写出完整可运行的代码。包含依赖导入、错误处理，以及一段简短的使用示例。说明语言版本和所有依赖的版本。不要留 TODO 占位；确实做不到的部分要明说，并解释原因。'),
  seed('seed-cod-02', '先说清 bug 是什么', 'code', ['调试', '排查'], '对下面这段出错的代码：先用一句话说它本来要做什么，再说什么情况实际发生了什么，然后结合代码给出最可能的原因。这些说完才提修改方案，并且只给能解决问题的最小改动。'),
  seed('seed-cod-03', '只审正确性', 'code', ['审查', '质量'], '请审查下面这段代码的正确性，不用管风格。逐条列出具体缺陷，写明出现在哪一行、什么输入会触发、期望结果与实际结果分别是什么。把确定的 bug 和怀疑的分开列。不要整篇重写。'),
  seed('seed-cod-04', '安全地重构', 'code', ['重构', '质量'], '请在不改变外部可见行为的前提下重构下面的代码。每处改动用一句话说明理由，并指出有什么测试能发现回归。如果某处必须改变行为，请停下来把差异列给我，而不是直接改。'),

  // 分析
  seed('seed-ana-01', '先给结论', 'analysis', ['分析', '结构'], '请分析下面的数据，按这个顺序回答：一句话结论、支撑它的三个最强事实（带数字）、最大的保留意见、还需要什么数据才会改变结论。不要复述数据本身来凑篇幅。'),
  seed('seed-ana-02', '替我核对数字', 'analysis', ['核对', '数字'], '请审计下面材料里的数字。每一个都要说明：它内部是否自洽、它是跟什么在比较、这个比较是否公平。凡是看着像基数或分母有问题的，都要标出来。'),
  seed('seed-ana-03', '找根因，不是现象', 'analysis', ['诊断', '原因'], '针对下面这个情况，请把现象和原因分开。先列出所有可能的原因，再逐个说明什么证据能证实或排除它。最后给出最可能的那一个原因，以及验证它最省事的办法。'),

  // 设计
  seed('seed-des-01', '层级清楚的版面', 'design', ['版式', '界面'], '请为下面这个界面设计版面。先指出唯一最重要的元素，再说阅读顺序，然后说哪些可以删掉。字号和间距用相对关系表达，不要写死像素。同时说明窄屏下怎么退化。'),
  seed('seed-des-02', '无障碍要成为默认', 'design', ['无障碍', '界面'], '请检查下面这个界面的无障碍问题，看对比度、焦点可见性、键盘顺序、标签和报错提示。每个问题都给出具体改法。会导致整个任务做不下去的，排在前面。'),
  seed('seed-des-03', '能引导操作的界面文案', 'design', ['文案', '体验'], '请为下面这个流程写界面文案：按钮文字、空状态、错误提示和一个确认提示。每一句都要让用户知道发生了什么、接下来该干什么。不要用行话，不要怪用户，不要感叹号。'),

  // 演示稿验收口径：用可核验的检查项代替「你是一位大师」
  seed('seed-des-04', '演示稿：编辑级验收清单', 'design', ['PPT', '演示稿', '版式', '验收'], '交付前请按这张清单自查并修正不达标的地方：全文最多三种字号；每页只讲一个结论，且标题就是这个结论，而不是「产品功能」这类归类词；正文不超过五行；每页至少三成留白；除黑白灰之外最多两种颜色；不用渐变填充、不用艺术字、不用剪贴画。如果某一页确实必须破例，请指明破了哪一条以及原因，不要默默破例而不说明。'),
  seed('seed-des-05', '演示稿：先结构后装饰', 'design', ['PPT', '演示稿', '结构', '叙事'], '请按这个顺序做，结构没定下来之前不要动手做视觉：第一步，用一句话写清观众看完之后要做什么；第二步，只写每一页的标题，列成清单；第三步，每个标题下最多补三条支撑要点；第四步才开始选版式。凡是不能帮观众走到第一步那句话的视觉装饰，一律不要。做完标题清单先给我确认，确认后再出内容。'),
  seed('seed-des-06', '演示稿：给清单，不给意见', 'design', ['PPT', '评审', '验收'], '请像一位资深设计负责人那样审下面这份演示稿，但结论要以清单形式给出，不要写成评价：每个问题都要写明页码、违反的是哪条规则、以及最小的修法。请核查这些规则：每页只有一个结论且写在标题里；不依赖讲者口头补充也能看懂；数字带单位和比较对象；每张图都说明读者该注意什么；每页只有一个视觉焦点。最后按「对观众行为的影响大小」排序。'),

  // 学习
  seed('seed-lea-01', '用一个完整例子教会我', 'learning', ['教学', '例子'], '请用下面这个概念教我。先给一个从头到尾走通的完整例子，再给第二个例子但留最后一步让我自己填。然后指出大多数人通常在哪一步出错。'),
  seed('seed-lea-02', '配答案的练习题', 'learning', ['练习', '习题'], '请就下面这个主题出一套练习题：五道题按难度递增，每题只考一个点。答案和解析放在最后，并用分隔线隔开，让我可以先自己做。其中要有一道题看起来相似但需要用另一种思路。'),
  seed('seed-lea-03', '考考我到底懂没懂', 'learning', ['提问', '检验'], '请就下面这个主题问我五个问题，一次只问一个，等我回答之后再问下一个。每次回答后告诉我答对没有、漏了什么。在我尝试之前不要先公布正确答案。'),
]

/**
 * Seed records in the normalized shape, with provenance intact.
 *
 * @returns {object[]} A copy, so a caller cannot mutate the module constant.
 */
export function getSeedRecords() {
  return SEED_RECORDS.map((record) => ({ ...record, tags: [...record.tags] }))
}
