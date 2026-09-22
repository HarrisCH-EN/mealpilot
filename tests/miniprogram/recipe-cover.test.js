const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..', 'miniprogram')
const formScript = fs.readFileSync(path.join(root, 'pages', 'recipe-form', 'index.js'), 'utf8')
const formTemplate = fs.readFileSync(path.join(root, 'pages', 'recipe-form', 'index.wxml'), 'utf8')
const apiScript = fs.readFileSync(path.join(root, 'utils', 'api', 'index.js'), 'utf8')

test('recipe form keeps the returned coverFileId for saving and coverUrl for display', () => {
  assert.match(formScript, /uploadFile/)
  assert.match(formScript, /uploadRecipeCover|uploadCover/)
  assert.match(formScript, /coverFileId/)
  assert.match(formScript, /coverUrl.*coverFileId|coverFileId.*coverUrl/s)
  assert.match(formScript, /uploadingCover/)
  assert.match(formTemplate, /uploadingCover|上传|编辑图片/)
  assert.match(apiScript, /uploadFile/)
})

test('recipe form preserves an existing cover when editing without replacement and handles upload failure', () => {
  assert.match(formScript, /coverPath|existingCover|recipe\.coverUrl/)
  assert.match(formScript, /catch \(error\)/)
  assert.match(formScript, /保存失败|上传失败|封面/)
  assert.match(formScript, /saving \|\|.*uploadingCover|uploadingCover.*saving/)
})

test('recipe list and detail continue rendering the persisted cover URL', () => {
  const listTemplate = fs.readFileSync(path.join(root, 'pages', 'recipes', 'index.wxml'), 'utf8')
  const detailTemplate = fs.readFileSync(path.join(root, 'pages', 'recipe-detail', 'index.wxml'), 'utf8')
  assert.match(listTemplate, /src="\{\{item\.coverUrl\}\}"/)
  assert.match(detailTemplate, /src="\{\{recipe\.coverUrl\}\}"/)
})
