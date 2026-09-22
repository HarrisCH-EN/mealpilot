const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..', 'miniprogram')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

const pages = {
  recommend: '先加入家庭，再为一家人搭配一餐。',
  menu: '先加入家庭，再安排今天的菜单。',
  recipes: '先加入家庭，再收好家里的拿手菜。'
}

test('family-less core pages share one compact empty-state contract', () => {
  for (const [page, copy] of Object.entries(pages)) {
    const template = read('pages', page, 'index.wxml')
    assert.match(template, /class="family-empty"/)
    assert.match(template, /class="family-empty__icon"/)
    assert.match(template, /src="\/assets\/icons\/settings\/family\.png"/)
    assert.match(template, /class="family-empty__title">还没加入家庭<\/view>/)
    assert.ok(template.includes(`<view class="family-empty__copy">${copy}</view>`))
    assert.match(template, /class="family-empty__action"[^>]*bindtap="goFamilySetup"[^>]*>创建或加入<\/button>/)
  }
})

test('the shared family empty state defines a responsive visual system', () => {
  const styles = read('app.wxss')
  assert.match(styles, /\.family-empty\s*\{/)
  assert.match(styles, /\.family-empty__icon\s*\{/)
  assert.match(styles, /\.family-empty__title\s*\{/)
  assert.match(styles, /\.family-empty__copy\s*\{/)
  assert.match(styles, /\.family-empty__action\s*\{/)
  assert.match(styles, /@media\s*\(max-width:\s*340px\)/)
})

test('recommendation family empty state keeps its page header', () => {
  const template = read('pages', 'recommend', 'index.wxml')
  assert.match(template, /recommend-empty-header/)
  assert.match(template, />今天吃什么？<\/view>/)
})
