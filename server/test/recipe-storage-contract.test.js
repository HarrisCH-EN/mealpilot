const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

const { router } = require('../src/routes/recipes')

const membership = { family_id: 7, member_id: 70, role: 'owner' }
const stableCover = 'cloud://test.bucket/families/7/recipes/cover.jpg'

function makeDatabase({ coverFileId = stableCover } = {}) {
  const state = { recipes: [], updateCover: null }
  const execute = async (sql, params = []) => {
    if (/SELECT id, title, category.*FROM recipes/i.test(sql)) return [[{ id: 1, title: '菜谱', category: '荤菜', description: '', steps: '步骤', cookMinutes: 20, difficulty: 2, servings: 2, coverFileId, createdByMemberId: 70 }]]
    if (/SELECT ri\.ingredient_id/i.test(sql)) return [[]]
    if (/SELECT rt\.recipe_id/i.test(sql)) return [[]]
    if (/SELECT created_by_member_id AS author/i.test(sql)) return [[{ author: 70, coverFileId }]]
    if (/SELECT id FROM ingredients/i.test(sql)) return [[{ id: 1 }]]
    if (/INSERT INTO recipes/i.test(sql)) {
      state.recipes.push({ cover_url: params[9] })
      return [{ insertId: 2 }]
    }
    if (/UPDATE recipes SET title/i.test(sql)) {
      state.updateCover = params[7]
      return [{ affectedRows: 1 }]
    }
    if (/DELETE FROM recipe_ingredients/i.test(sql) || /INSERT INTO recipe_ingredients/i.test(sql)) return [{ affectedRows: 1 }]
    throw new Error(`unexpected SQL: ${sql}`)
  }
  return {
    state,
    execute,
    async getConnection() {
      return { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {}, execute }
    }
  }
}

function makeApp(database, mediaUrlService = { async resolveRecords(rows) { return rows } }) {
  const app = express()
  app.use(express.json())
  app.use('/api', router({
    database,
    mediaUrlService,
    cloudbaseStorageFileIdPrefix: 'cloud://test.bucket',
    auth: (_request, _response, next) => next(),
    family: (request, _response, next) => { request.membership = membership; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, message: error.message }))
  return app
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try { return await callback(`http://127.0.0.1:${server.address().port}`) } finally { await new Promise((resolve) => server.close(resolve)) }
}

function body(overrides = {}) {
  return { title: '新菜谱', category: '荤菜', steps: '步骤', cookMinutes: 20, difficulty: 2, ingredients: [{ ingredientId: 1, amountGrams: 100 }], ...overrides }
}

test('recipe create stores coverFileId and never stores the temporary display URL', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body({ coverFileId: stableCover, coverUrl: 'https://temp.test/preview' })) })
    assert.equal(response.status, 201)
  })
  assert.equal(database.state.recipes[0].cover_url, stableCover)
})

test('recipe contract rejects temporary URLs and another family cloud file IDs', async () => {
  for (const overrides of [{ coverFileId: 'https://temp.test/not-persistable' }, { coverFileId: 'cloud://test.bucket/families/8/recipes/other.jpg' }]) {
    const database = makeDatabase({ coverFileId: '' })
    await withServer(makeApp(database), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/recipes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body(overrides)) })
      assert.equal(response.status, 400)
    })
    assert.equal(database.state.recipes.length, 0)
  }
})

test('recipe GET returns stable coverFileId plus a temporary coverUrl', async () => {
  const database = makeDatabase()
  const media = { async resolveRecords(rows) { return rows.map((row) => ({ ...row, coverUrl: 'https://temp.test/cover' })) } }
  await withServer(makeApp(database, media), async (baseUrl) => {
    const list = await fetch(`${baseUrl}/api/recipes`)
    assert.equal(list.status, 200)
    assert.deepEqual((await list.json()).data[0], {
      id: 1,
      title: '菜谱',
      category: '荤菜',
      description: '',
      steps: '步骤',
      cookMinutes: 20,
      difficulty: 2,
      servings: 2,
      coverFileId: stableCover,
      coverUrl: 'https://temp.test/cover',
      createdByMemberId: 70,
      tags: []
    })
  })
})

test('recipe edit without a replacement preserves the stable cover ID instead of a temporary URL', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body()) })
    assert.equal(response.status, 200)
  })
  assert.equal(database.state.updateCover, stableCover)
})

test('starter recipe edit preserves an unchanged system cover ID', async () => {
  const systemCover = 'cloud://test.bucket/system/recipes/蒜蓉空心菜.jpg'
  const database = makeDatabase({ coverFileId: systemCover })
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body({ coverFileId: systemCover })) })
    assert.equal(response.status, 200)
  })
  assert.equal(database.state.updateCover, systemCover)
})

test('recipe edit still rejects a changed cover from another family', async () => {
  const systemCover = 'cloud://test.bucket/system/recipes/蒜蓉空心菜.jpg'
  const database = makeDatabase({ coverFileId: systemCover })
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body({ coverFileId: 'cloud://test.bucket/families/8/recipes/x.jpg' })) })
    assert.equal(response.status, 400)
  })
  assert.equal(database.state.updateCover, null)
})
