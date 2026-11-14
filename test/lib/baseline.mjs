/**
 * Baseline runner: score real rewrites against the fixture set.
 *
 * Two modes:
 *
 *  - `--outputs <file>`  score a recorded run. This is the reproducible mode and
 *                        the one CI uses; the file is `{ "<caseId>": "<output>" }`.
 *  - `--cases <file>`    use an alternate fixture set instead of the frozen
 *                        40-case main set. Needed for focused evaluations (e.g.
 *                        the 12-case entity-heavy set) without disturbing the
 *                        golden gate.
 *  - `--report <file>`   write a JSON + Markdown summary next to the run.
 *
 * The runner deliberately knows nothing about models or HTTP. Collecting outputs
 * and judging them are separate concerns: a benchmark that can also call the
 * model is a benchmark whose baseline silently moves when the model changes.
 *
 * Usage:
 *   node test/lib/baseline.mjs --outputs recorded.json --report baseline.json
 *   node test/lib/baseline.mjs --outputs recorded.json --print
 *   node test/lib/baseline.mjs --cases test/fixtures/entity-heavy-cases.json \
 *       --outputs test/fixtures/recorded/v1.5.5-entity-heavy.json
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { scoreOutput } from './evaluate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, '..', 'fixtures', 'wish-cases.json')

/**
 * Read a JSON file that must exist.
 *
 * @param {string} path - Absolute or relative path.
 * @returns {unknown} Parsed content.
 */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Parse `--flag value` pairs.
 *
 * @param {string[]} argv - Process arguments after the script name.
 * @returns {Record<string, string | true>} Parsed flags.
 */
function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      out[key] = true
    } else {
      out[key] = next
      i += 1
    }
  }
  return out
}

/**
 * Summarise per-category and overall results.
 *
 * @param {Array<object>} results - Scored entries.
 * @returns {object} Aggregate figures.
 */
export function summarise(results) {
  const byCategory = {}
  for (const result of results) {
    const bucket = (byCategory[result.category] ??= {
      count: 0,
      scoreSum: 0,
      fidelityPass: 0,
      completenessPass: 0,
      sendabilityPass: 0,
      targetingPass: 0,
      concisionPass: 0,
      defaultPass: 0,
    })
    bucket.count += 1
    bucket.scoreSum += result.score
    if (result.fidelity.pass) bucket.fidelityPass += 1
    if (result.completeness.pass) bucket.completenessPass += 1
    if (result.sendability.pass) bucket.sendabilityPass += 1
    if (result.targeting.pass) bucket.targetingPass += 1
    if (result.concision.pass) bucket.concisionPass += 1
    if (result.defaults.pass) bucket.defaultPass += 1
  }

  const shape = (bucket) => ({
    count: bucket.count,
    meanScore: Number((bucket.scoreSum / bucket.count).toFixed(1)),
    fidelityRate: Number((bucket.fidelityPass / bucket.count).toFixed(3)),
    completenessRate: Number((bucket.completenessPass / bucket.count).toFixed(3)),
    sendabilityRate: Number((bucket.sendabilityPass / bucket.count).toFixed(3)),
    targetingRate: Number((bucket.targetingPass / bucket.count).toFixed(3)),
    concisionRate: Number((bucket.concisionPass / bucket.count).toFixed(3)),
    defaultRate: Number((bucket.defaultPass / bucket.count).toFixed(3)),
  })

  const categories = {}
  for (const [name, bucket] of Object.entries(byCategory)) categories[name] = shape(bucket)

  const all = Object.values(byCategory).reduce(
    (acc, bucket) => ({
      count: acc.count + bucket.count,
      scoreSum: acc.scoreSum + bucket.scoreSum,
      fidelityPass: acc.fidelityPass + bucket.fidelityPass,
      completenessPass: acc.completenessPass + bucket.completenessPass,
      sendabilityPass: acc.sendabilityPass + bucket.sendabilityPass,
      targetingPass: acc.targetingPass + bucket.targetingPass,
      concisionPass: acc.concisionPass + bucket.concisionPass,
      defaultPass: acc.defaultPass + bucket.defaultPass,
    }),
    {
      count: 0,
      scoreSum: 0,
      fidelityPass: 0,
      completenessPass: 0,
      sendabilityPass: 0,
      targetingPass: 0,
      concisionPass: 0,
      defaultPass: 0,
    },
  )

  return { overall: shape(all), categories }
}

/**
 * Render a compact Markdown table for a human reading the result.
 *
 * @param {object} summary - Output of `summarise`.
 * @param {string} label - Version or run label.
 * @returns {string} Markdown.
 */
export function toMarkdown(summary, label) {
  const rows = [
    ['分类', '用例', '均分', '保真', '完整', '可发送', '占位精准', '无冗余', '默认标注'],
    ['——', '——', '——', '——', '——', '——', '——', '——', '——'],
    ...Object.entries(summary.categories).map(([name, row]) => [
      name,
      String(row.count),
      String(row.meanScore),
      `${Math.round(row.fidelityRate * 100)}%`,
      `${Math.round(row.completenessRate * 100)}%`,
      `${Math.round(row.sendabilityRate * 100)}%`,
      `${Math.round(row.targetingRate * 100)}%`,
      `${Math.round(row.concisionRate * 100)}%`,
      `${Math.round(row.defaultRate * 100)}%`,
    ]),
  ]
  const o = summary.overall
  rows.push([
    '**全部**',
    `**${o.count}**`,
    `**${o.meanScore}**`,
    `**${Math.round(o.fidelityRate * 100)}%**`,
    `**${Math.round(o.completenessRate * 100)}%**`,
    `**${Math.round(o.sendabilityRate * 100)}%**`,
    `**${Math.round(o.targetingRate * 100)}%**`,
    `**${Math.round(o.concisionRate * 100)}%**`,
    `**${Math.round(o.defaultRate * 100)}%**`,
  ])

  const lines = [`# 基线报告：${label}`, '', `确定性满分：60 / 用例 ${o.count} 条`, '']
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`)
  return lines.join('\n')
}

/**
 * Score every fixture that has an output, and report the ones that were skipped.
 *
 * @param {Array<object>} cases - Fixture entries.
 * @param {Record<string, string>} outputs - Recorded outputs keyed by case id.
 * @returns {{ results: Array<object>, missing: string[] }}
 */
export function runBaseline(cases, outputs) {
  const results = []
  const missing = []
  for (const testCase of cases) {
    const output = outputs[testCase.id]
    if (typeof output !== 'string' || output.trim() === '') {
      missing.push(testCase.id)
      continue
    }
    results.push(scoreOutput(testCase, output))
  }
  return { results, missing }
}

/**
 * Compare two summaries dimension by dimension.
 *
 * A regression is any dimension whose rate drops by more than `tolerance`, or a
 * mean score that drops at all. Fidelity is never allowed to drop: one changed
 * fact makes the rewrite worse than not rewriting.
 *
 * @param {object} before - Summary of the reference run.
 * @param {object} after - Summary of the candidate run.
 * @param {number} [tolerance=0.02] - Allowed rate drop.
 * @returns {{ pass: boolean, regressions: string[], improvements: string[] }}
 */
export function compareSummaries(before, after, tolerance = 0.02) {
  const dimensions = [
    ['fidelityRate', 0],
    ['completenessRate', tolerance],
    ['sendabilityRate', tolerance],
    ['targetingRate', tolerance],
    ['concisionRate', tolerance],
    ['defaultRate', tolerance],
  ]
  const regressions = []
  const improvements = []

  for (const [key, allowed] of dimensions) {
    const delta = after[key] - before[key]
    if (delta < -allowed) regressions.push(`${key} ${before[key]} -> ${after[key]}`)
    else if (delta > allowed) improvements.push(`${key} ${before[key]} -> ${after[key]}`)
  }

  if (after.meanScore < before.meanScore) {
    regressions.push(`meanScore ${before.meanScore} -> ${after.meanScore}`)
  } else if (after.meanScore > before.meanScore) {
    improvements.push(`meanScore ${before.meanScore} -> ${after.meanScore}`)
  }

  return { pass: regressions.length === 0, regressions, improvements }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (typeof args.outputs !== 'string') {
    console.error('用法: node test/lib/baseline.mjs --outputs <recorded.json> [--cases <cases.json>] [--report <out.json>] [--print]')
    process.exit(2)
  }

  const casesPath = typeof args.cases === 'string' ? resolve(args.cases) : FIXTURES
  const cases = readJson(casesPath)
  const outputs = readJson(resolve(args.outputs))
  const { results, missing } = runBaseline(cases, outputs)

  if (results.length === 0) {
    console.error('没有可评分的输出。recorded.json 需要 { "<caseId>": "<output>" } 形状。')
    process.exit(2)
  }

  const summary = summarise(results)
  const label = typeof args.label === 'string' ? args.label : String(args.outputs)

  if (args.print === true || args.print === undefined) {
    console.log(toMarkdown(summary, label))
    if (missing.length > 0) console.log(`\n未覆盖用例 (${missing.length}): ${missing.join(', ')}`)
  }

  if (typeof args.report === 'string') {
    const payload = {
      label,
      cases: casesPath,
      generatedAt: new Date().toISOString(),
      deterministicMax: 60,
      summary,
      missing,
      results: results.map((r) => ({
        id: r.id,
        category: r.category,
        score: r.score,
        fidelity: { pass: r.fidelity.pass, missing: r.fidelity.missing },
        completeness: { pass: r.completeness.pass, coverage: r.completeness.coverage },
        sendability: { pass: r.sendability.pass, count: r.sendability.count },
        targeting: { pass: r.targeting.pass, missingHints: r.targeting.missingHints },
        concision: { pass: r.concision.pass, ratio: Number(r.concision.ratio.toFixed(2)) },
        defaults: { pass: r.defaults.pass, markers: r.defaults.markers },
      })),
    }
    writeFileSync(resolve(args.report), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    console.log(`\n报告已写入 ${args.report}`)
  }

  // Comparison mode: fail loudly when a candidate run regresses against a
  // reference, so a prompt edit cannot quietly lower quality.
  //
  // `--compare` accepts either a report JSON (`{ summary: { overall } }`) or a
  // RECORDED OUTPUTS file (`{ "<caseId>": "<output>" }`). The latter is what CI
  // should use: recorded fixtures live under test/fixtures/ and are committed,
  // whereas 产出/ reports are generated artefacts and may be absent in a fresh
  // clone. Re-scoring the reference with the current evaluator also keeps both
  // sides on the same ruler.
  if (typeof args.compare === 'string') {
    const reference = readJson(resolve(args.compare))
    let before
    if (reference.summary?.overall !== undefined || reference.overall !== undefined) {
      before = reference.summary?.overall ?? reference.overall
    } else {
      const referenceResults = runBaseline(cases, reference)
      if (referenceResults.missing.length > 0) {
        console.error(`${args.compare} 不是合法的报告或录制输出文件（缺 ${referenceResults.missing.length} 条用例）。`)
        process.exit(2)
      }
      before = summarise(referenceResults.results).overall
    }
    if (before === undefined) {
      console.error(`${args.compare} 里没有可用的基线数据，无法对比。`)
      process.exit(2)
    }
    const verdict = compareSummaries(before, summary.overall)
    console.log(`\n=== 对比基线 ${reference.label ?? args.compare} ===`)
    if (verdict.improvements.length > 0) {
      console.log('改善:')
      for (const line of verdict.improvements) console.log(`  + ${line}`)
    }
    if (verdict.regressions.length > 0) {
      console.log('回退:')
      for (const line of verdict.regressions) console.log(`  - ${line}`)
    }
    if (verdict.pass) {
      console.log('结论: 无回退')
    } else {
      console.error('结论: 存在回退，门禁未通过')
      process.exitCode = 1
    }
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}
