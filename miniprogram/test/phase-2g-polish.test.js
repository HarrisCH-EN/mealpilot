const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

test('core pages expose a product-level no-Family state with a path to Family setup', () => {
  const recipesScript = read('pages', 'recipes', 'index.js')
  const recipesTemplate = read('pages', 'recipes', 'index.wxml')
  const menuScript = read('pages', 'menu', 'index.js')
  const menuTemplate = read('pages', 'menu', 'index.wxml')
  const recommendScript = read('pages', 'recommend', 'index.js')
  const recommendTemplate = read('pages', 'recommend', 'index.wxml')
  for (const script of [recipesScript, menuScript, recommendScript]) assert.match(script, /isNoActiveFamilyError|noFamily/)
  for (const template of [recipesTemplate, menuTemplate, recommendTemplate]) {
    assert.match(template, /还没有加入家庭/)
    assert.match(template, /创建家庭|加入家庭|去设置/)
  }
  assert.match(recipesScript, /goFamilySetup/)
  assert.match(menuScript, /goFamilySetup/)
  assert.match(recommendScript, /goFamilySetup/)
})

test('deferred interactions are hidden or static instead of clickable fake actions', () => {
  const settingsTemplate = read('pages', 'settings', 'index.wxml')
  const settingsScript = read('pages', 'settings', 'index.js')
  const aboutTemplate = read('pages', 'about', 'index.wxml')
  const aboutScript = read('pages', 'about', 'index.js')
  const detailScript = read('pages', 'recipe-detail', 'index.js')
  assert.doesNotMatch(settingsTemplate, /即将开放/)
  assert.doesNotMatch(settingsTemplate, /bindtap="showUnavailable"/)
  assert.doesNotMatch(settingsScript, /showUnavailable\(/)
  assert.doesNotMatch(aboutTemplate, /即将开放/)
  assert.doesNotMatch(aboutTemplate, /bindtap="showUnavailable"/)
  assert.doesNotMatch(aboutScript, /showUnavailable\(/)
  assert.doesNotMatch(detailScript, /分享菜品（待开发）|分享功能待开发|shareRecipe\(/)
})

test('frontend request errors preserve HTTP status for accurate UX mapping', () => {
  const apiScript = read('utils', 'api.js')
  assert.match(apiScript, /error\.status\s*=\s*res\.statusCode/)
})

test('recommendation presentation keeps the backend explanation instead of replacing it', () => {
  const recommendScript = read('pages', 'recommend', 'index.js')
  assert.match(recommendScript, /reason: String\(item\.reason \|\| '符合本次搭配条件'\)/)
  assert.match(recommendScript, /reason: String\(candidate\.reason \|\| '符合本次搭配条件'\)/)
})

test('recommendation copy does not claim unsupported recent-menu personalization', () => {
  const recommendTemplate = read('pages', 'recommend', 'index.wxml')
  assert.doesNotMatch(recommendTemplate, /最近的菜单|根据最近的菜单/)
  assert.match(recommendTemplate, /今晚想吃什么|这些选择只影响本次推荐/)
})
