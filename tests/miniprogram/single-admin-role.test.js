const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..', 'miniprogram')

test('family management exposes transfer-admin and removes creator controls', () => {
  const script = fs.readFileSync(path.join(root, 'pages', 'family-management', 'index.js'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'pages', 'family-management', 'index.wxml'), 'utf8')

  assert.match(script, /transfer-admin/)
  assert.doesNotMatch(script, /transfer-ownership|isOwner|owner/) 
  assert.match(template, /转移管理员/)
  assert.doesNotMatch(template, /创建者|移交创建者|设为管理员|取消管理员/)
})

test('settings recovery options include family creation time', () => {
  const script = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.js'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'pages', 'settings', 'index.wxml'), 'utf8')

  assert.match(script, /createdAt/)
  assert.match(template, /创建于/)
})
