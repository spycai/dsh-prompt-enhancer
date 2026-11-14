/**
 * Build the extended entity-heavy evaluation set.
 *
 * The 40-case main fixture is frozen: `test/golden-baseline.test.mjs` asserts
 * its exact scores, so appending cases there would break the gate for a reason
 * unrelated to prompt quality. Instead this script derives a 12-case subset
 * (the original 6 entity-heavy cases + 6 new ones) and seeds two recorded
 * files with the already-collected outputs for the original 6.
 *
 * Run from the repo root:
 *   node test/lib/build-entity-heavy.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'

const FIXTURES = 'test/fixtures/wish-cases.json'
const OUT_CASES = 'test/fixtures/entity-heavy-cases.json'
const RECORDED_DIR = 'test/fixtures/recorded'

/** Six new cases covering entity shapes the original six did not. */
const EXTRA_CASES = [
  {
    id: 'e07',
    category: 'entity-heavy',
    input: '把 v1.4.2 升级到 v2.0.0 的步骤写成清单，接口地址 https://api.example.com/v2/users，超时设 3000 毫秒',
    note: '版本号 + URL + 毫秒数混合',
    expect: {
      deliverable: ['清单', '步骤', '文档'],
      mustPreserve: ['v1.4.2', 'v2.0.0', 'https://api.example.com/v2/users', '3000'],
      maxPlaceholders: 2,
    },
  },
  {
    id: 'e08',
    category: 'entity-heavy',
    input: '汇总 2026 年营收 850 万元、毛利率 18.6%、同比增长 22%，做成一页简报',
    note: '年份 + 金额 + 两个百分比',
    expect: {
      deliverable: ['简报', '报告', '汇总'],
      mustPreserve: ['2026', '850', '18.6%', '22%'],
      maxPlaceholders: 2,
    },
  },
  {
    id: 'e09',
    category: 'entity-heavy',
    input: '合并 report_final.docx 与 data_backup.csv，结果发到 team@company.com',
    note: '两个文件名 + 邮箱',
    expect: {
      deliverable: ['合并', '文件', '结果'],
      mustPreserve: ['report_final.docx', 'data_backup.csv', 'team@company.com'],
      maxPlaceholders: 2,
    },
  },
  {
    id: 'e10',
    category: 'entity-heavy',
    input: '把 v1.0、v1.1、v1.2 三个版本的变更记录整理成表格',
    note: '三个版本号连续出现',
    expect: {
      deliverable: ['表格', '变更记录'],
      mustPreserve: ['v1.0', 'v1.1', 'v1.2'],
      maxPlaceholders: 2,
    },
  },
  {
    id: 'e11',
    category: 'entity-heavy',
    input: '按 PRJ-2026-018 和 PRJ-2026-019 分别列预算：12.5 万与 8.75 万',
    note: '两个项目代号 + 两个小数金额',
    expect: {
      deliverable: ['预算', '表格', '清单'],
      mustPreserve: ['PRJ-2026-018', 'PRJ-2026-019', '12.5', '8.75'],
      maxPlaceholders: 2,
    },
  },
  {
    id: 'e12',
    category: 'entity-heavy',
    input: '通知 3 位评委，12 月 5 日下午 2 点在 A 栋 301 室评审，各备 5 份材料',
    note: '人数 + 日期 + 时间 + 房间号 + 份数',
    expect: {
      deliverable: ['通知'],
      mustPreserve: ['3', '12 月 5 日', '2 点', '301', '5'],
      maxPlaceholders: 2,
    },
  },
]

const main = JSON.parse(readFileSync(FIXTURES, 'utf8'))
const original = main.filter((c) => c.category === 'entity-heavy')
const cases = [...original, ...EXTRA_CASES]
writeFileSync(OUT_CASES, `${JSON.stringify(cases, null, 2)}\n`, 'utf8')

const runs = {
  'v1.5.4': JSON.parse(readFileSync(`${RECORDED_DIR}/v1.5.4-proxy.json`, 'utf8')),
  'v1.5.5': JSON.parse(readFileSync(`${RECORDED_DIR}/v1.5.5-proxy.json`, 'utf8')),
}

for (const [version, outputs] of Object.entries(runs)) {
  const seeded = {}
  for (const testCase of original) seeded[testCase.id] = outputs[testCase.id]
  const path = `${RECORDED_DIR}/${version}-entity-heavy.json`
  writeFileSync(path, `${JSON.stringify(seeded, null, 2)}\n`, 'utf8')
  const missing = EXTRA_CASES.filter((c) => seeded[c.id] === undefined).map((c) => c.id)
  console.log(`${path}: seeded ${Object.keys(seeded).length}/12, still missing ${missing.join(', ')}`)
}

console.log(`\n${OUT_CASES}: ${cases.length} cases (${original.length} original + ${EXTRA_CASES.length} new)`)
