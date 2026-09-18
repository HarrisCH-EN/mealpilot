const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..', 'miniprogram')
const menuScript = fs.readFileSync(path.join(root, 'pages', 'menu', 'index.js'), 'utf8')
const menuTemplate = fs.readFileSync(path.join(root, 'pages', 'menu', 'index.wxml'), 'utf8')
const settingsTemplate = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.wxml'), 'utf8')

test('menu exposes a real feedback entry and guarded rating actions for each MenuItem', () => {
  assert.match(menuTemplate, /feedback|评分/)
  assert.equal(menuTemplate.includes('catchtap="openFeedback"'), true)
  assert.match(menuTemplate, /item\.id/)
  assert.match(menuScript, /feedback|rating/i)
  assert.match(menuScript, /saving|submitting|loading/i)
  assert.match(menuScript, /request\([^\n]*(menu-items|feedback)/i)
})

test('settings insight card renders the persisted average rating', () => {
  assert.match(settingsTemplate, /averageRating|平均评分/)
})

test('feedback UI supports empty, update, delete and error states without local-only persistence', () => {
  assert.match(menuScript, /showModal|confirm/i)
  assert.match(menuScript, /DELETE|删除/i)
  assert.match(menuScript, /catch \(error\)/)
  assert.doesNotMatch(menuScript, /setStorageSync\([^)]*feedback/i)
})
