const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const pagesRoot = path.join(__dirname, '..', 'pages')
const readPage = (page, file) => fs.readFileSync(path.join(pagesRoot, page, file), 'utf8')

test('menu feedback edits and displays the persisted comment with a 200-character guard', () => {
  const script = readPage('menu', 'index.js')
  const template = readPage('menu', 'index.wxml')

  assert.match(script, /editable:\s*true/)
  assert.match(script, /comment\.length\s*>\s*200/)
  assert.match(script, /PUT',\s*\{\s*rating,\s*comment\s*\}/)
  assert.match(template, /menu-dish__feedback-comment/)
})

test('recommendation cards keep backend reasons in data while omitting explanatory copy from the result UI', () => {
  const script = readPage('recommend', 'index.js')
  const template = readPage('recommend', 'index.wxml')

  assert.match(script, /reason: String\(item\.reason \|\| '符合本次搭配条件'\)/)
  assert.match(script, /reason: String\(candidate\.reason \|\| '符合本次搭配条件'\)/)
  assert.doesNotMatch(template, /recommend-result__reason|recommend-dish__reason|item\.reason/)
})

test('recipe detail skips the initial onShow reload and refreshes after returning from edit', () => {
  const script = readPage('recipe-detail', 'index.js')

  assert.match(script, /_initialShowPending\s*=\s*true/)
  assert.match(script, /if \(this\._initialShowPending\)/)
  assert.match(script, /this\.load\(\)/)
})

test('recommendation does not regenerate when it returns to the page', () => {
  const script = readPage('recommend', 'index.js')
  const onShow = script.match(/  onShow\(\) \{[\s\S]*?\n  \},/)?.[0] || ''

  assert.match(onShow, /onShow\(\)/)
  assert.doesNotMatch(onShow, /generate\(\)/)
})
