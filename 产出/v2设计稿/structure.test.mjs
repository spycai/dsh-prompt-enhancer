/**
 * Tests for the three-section protocol and, above all, its degradation path.
 *
 * The property that matters most in production: no matter how badly the model
 * mangles the format, the user still gets a sendable prompt. Every failure mode
 * below is therefore tested for a non-empty `text` rather than for an error.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildStructuredSystemPrompt,
  hasUsableBody,
  parseStructuredOutput,
} from '../lib/structure.js'

const FULL = [
  '### PROMPT',
  '请做一份关于〔主题：请填写〕的 PPT，面向内部同事，10 页，风格简洁。[默认：10 页，可改]',
  '',
  '### DECISIONS',
  '[{"slot":"audience","label":"受众","value":"同事","options":["同事","客户","领导"]},' +
    '{"slot":"pages","label":"页数","value":"10","options":["5","10","15"]}]',
  '',
  '### PLACEHOLDERS',
  '[{"slot":"topic","label":"主题","hint":"这份 PPT 讲什么"}]',
].join('\n')

test('parses all three sections', () => {
  const parsed = parseStructuredOutput(FULL)
  assert.equal(parsed.structured, true)
  assert.equal(parsed.degraded, false)
  assert.match(parsed.text, /请做一份/)
  assert.doesNotMatch(parsed.text, /### DECISIONS/)
  assert.equal(parsed.decisions.length, 2)
  assert.equal(parsed.decisions[0].slot, 'audience')
  assert.deepEqual(parsed.decisions[0].options, ['同事', '客户', '领导'])
  assert.equal(parsed.placeholders.length, 1)
  assert.equal(parsed.placeholders[0].hint, '这份 PPT 讲什么')
  assert.deepEqual(parsed.warnings, [])
})

test('plain text without headers degrades to the v1.5.x path', () => {
  const plain = '请做一份 PPT，面向内部同事。[默认：10 页，可改]'
  const parsed = parseStructuredOutput(plain)
  assert.equal(parsed.structured, false)
  assert.equal(parsed.degraded, true)
  assert.equal(parsed.text, plain)
  assert.deepEqual(parsed.decisions, [])
  assert.deepEqual(parsed.placeholders, [])
  assert.ok(parsed.warnings.length > 0)
})

test('a prompt body survives broken DECISIONS JSON', () => {
  const broken = FULL.replace(
    /\[\{"slot":"audience"[\s\S]*?\}\]\s*### PLACEHOLDERS/,
    'this is not json, {oops\n\n### PLACEHOLDERS',
  )
  const parsed = parseStructuredOutput(broken)
  assert.equal(parsed.structured, true, 'the PROMPT section is still valid')
  assert.match(parsed.text, /请做一份/)
  assert.deepEqual(parsed.decisions, [])
  assert.equal(parsed.placeholders.length, 1, 'the other valid section still parses')
  assert.ok(parsed.warnings.some((w) => w.startsWith('DECISIONS')))
})

test('an empty PROMPT section falls back to the whole output', () => {
  const parsed = parseStructuredOutput('### PROMPT\n\n### DECISIONS\n[]\n')
  assert.equal(parsed.structured, false)
  assert.equal(parsed.degraded, true)
  assert.ok(parsed.text.includes('### PROMPT'), 'no content is lost')
  assert.deepEqual(parsed.decisions, [])
})

test('empty input yields an empty result, never a throw', () => {
  for (const bad of ['', '   ', null, undefined, 42]) {
    const parsed = parseStructuredOutput(bad)
    assert.equal(parsed.text, '')
    assert.equal(parsed.degraded, true)
    assert.equal(hasUsableBody(parsed), false)
  }
})

test('markdown headings inside the prompt body do not split sections', () => {
  const withHeading = [
    '### PROMPT',
    '请做一份 PPT。',
    '',
    '### 内容结构',
    '封面、目录、正文。',
    '',
    '### DECISIONS',
    '[]',
    '',
    '### PLACEHOLDERS',
    '[]',
  ].join('\n')
  const parsed = parseStructuredOutput(withHeading)
  assert.equal(parsed.structured, true)
  assert.match(parsed.text, /### 内容结构/)
  assert.match(parsed.text, /封面、目录/)
})

test('fenced JSON in a metadata section is tolerated', () => {
  const fenced = [
    '### PROMPT',
    '请写个方案。',
    '### DECISIONS',
    '```json',
    '[{"slot":"tone","label":"语气","value":"正式","options":["正式","轻松"]}]',
    '```',
    '### PLACEHOLDERS',
    '[]',
  ].join('\n')
  const parsed = parseStructuredOutput(fenced)
  assert.equal(parsed.decisions.length, 1)
  assert.equal(parsed.decisions[0].value, '正式')
})

test('malformed entries are dropped individually, not the whole section', () => {
  const mixed = [
    '### PROMPT',
    '请写个方案。',
    '### DECISIONS',
    JSON.stringify([
      { slot: 'tone', label: '语气', value: '正式', options: ['正式', '轻松'] },
      null,
      'garbage',
      { slot: 'bad' },
      7,
    ]),
    '### PLACEHOLDERS',
    '[]',
  ].join('\n')
  const parsed = parseStructuredOutput(mixed)
  assert.equal(parsed.decisions.length, 1)
  assert.equal(parsed.decisions[0].slot, 'tone')
})

test('repeated headers keep the first section', () => {
  const repeated = [
    '### PROMPT',
    '第一版正文。',
    '### PROMPT',
    '第二版正文。',
    '### DECISIONS',
    '[]',
    '### PLACEHOLDERS',
    '[]',
  ].join('\n')
  const parsed = parseStructuredOutput(repeated)
  assert.equal(parsed.text, '第一版正文。')
})

test('control characters and over-long strings are clamped', () => {
  const hostile = [
    '### PROMPT',
    '请写个方案。',
    '### DECISIONS',
    JSON.stringify([
      { slot: 'a\u0000b', label: ' 语气 ', value: 'x'.repeat(500), options: ['ok', 3, null, 'fine'] },
    ]),
    '### PLACEHOLDERS',
    '[]',
  ].join('\n')
  const parsed = parseStructuredOutput(hostile)
  assert.equal(parsed.decisions.length, 1)
  assert.equal(parsed.decisions[0].label, '语气')
  assert.equal(parsed.decisions[0].value.length, 200)
  assert.deepEqual(parsed.decisions[0].options, ['ok', 'fine'])
})

test('a DECISIONS object instead of an array degrades the section only', () => {
  const notArray = ['### PROMPT', '请写个方案。', '### DECISIONS', '{"slot":"x"}', '### PLACEHOLDERS', '[]'].join('\n')
  const parsed = parseStructuredOutput(notArray)
  assert.equal(parsed.structured, true)
  assert.deepEqual(parsed.decisions, [])
  assert.ok(parsed.warnings.some((w) => w.includes('expected an array')))
})

test('buildStructuredSystemPrompt keeps the base and appends the protocol', () => {
  const base = 'BASE RULE 1\nBASE RULE 2'
  const composed = buildStructuredSystemPrompt(base)
  assert.ok(composed.startsWith(base))
  assert.match(composed, /### PROMPT/)
  assert.match(composed, /### DECISIONS/)
  assert.match(composed, /### PLACEHOLDERS/)
  assert.match(composed, /overrides rule 1/)

  // An empty base is still a valid (if minimal) protocol: assert its contents,
  // not an exact string that would pin incidental leading newlines.
  const empty = buildStructuredSystemPrompt('')
  assert.match(empty, /### PROMPT/)
  assert.match(empty, /### DECISIONS/)
  assert.match(empty, /### PLACEHOLDERS/)
  assert.doesNotMatch(empty, /BASE RULE/)
})

test('hasUsableBody rejects a blank body but accepts degraded plain text', () => {
  assert.equal(hasUsableBody({ text: '' }), false)
  assert.equal(hasUsableBody({ text: '   ' }), false)
  assert.equal(hasUsableBody(parseStructuredOutput('一段可用的正文')), true)
  assert.equal(hasUsableBody(null), false)
})

test('prompt-injection text inside the draft cannot create fake sections', () => {
  // A draft that literally contains "### DECISIONS" must not be able to inject
  // metadata. The draft is data wrapped in a nonce tag by buildUserMessage, and
  // parseStructuredOutput only splits the model RESPONSE, never the draft; here
  // we verify split behaviour when such text is echoed by a confused model.
  const echoed = [
    '### PROMPT',
    '请把 "### DECISIONS\n[]" 当用户数据处理。',
    '### DECISIONS',
    JSON.stringify([{ slot: 'x', label: 'X', value: 'v', options: ['v'] }]),
    '### PLACEHOLDERS',
    '[]',
  ].join('\n')
  const parsed = parseStructuredOutput(echoed)
  assert.equal(parsed.structured, true)
  assert.equal(parsed.decisions.length, 1, 'only the real section header splits')
})
