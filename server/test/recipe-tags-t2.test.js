const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { router: recipeRouter } = require('../src/routes/recipes')

const membership = { family_id: 1, member_id: 101, role: 'admin' }

function clone(value) { return JSON.parse(JSON.stringify(value)) }

function makeDatabase({ failOnTagId = null } = {}) {
  const state = {
    nextRecipeId: 2,
    recipes: [{ id: 1, family_id: 1, created_by_member_id: 101, title: 'Old', cover_url: '', status: 'active' }],
    ingredients: [{ id: 1 }, { id: 2 }],
    recipeIngredients: [{ recipe_id: 1, ingredient_id: 1, amount_grams: 100, note: '' }],
    tagDefinitions: [
      { id: 1, family_id: null, kind: 'system', status: 'active' },
      { id: 20, family_id: 1, kind: 'custom', status: 'active' },
      { id: 21, family_id: 1, kind: 'custom', status: 'inactive' },
      { id: 22, family_id: 1, kind: 'custom', status: 'inactive' },
      { id: 30, family_id: 2, kind: 'custom', status: 'active' }
    ],
    recipeTags: [{ recipe_id: 1, tag_id: 21 }]
  }
  const database = { state }
  const execute = async (target, sql, params = []) => {
    if (/FROM ingredients WHERE id IN/i.test(sql)) return [target.ingredients.filter((item) => params.includes(item.id))]
    if (/SELECT created_by_member_id AS author/i.test(sql)) {
      const recipe = target.recipes.find((item) => item.id === Number(params[0]) && item.family_id === params[1] && item.status === 'active')
      return [recipe ? [{ author: recipe.created_by_member_id, coverFileId: recipe.cover_url, coverUrl: recipe.cover_url }] : []]
    }
    if (/UPDATE recipes SET title/i.test(sql)) return [{ affectedRows: 1 }]
    if (/DELETE FROM recipe_ingredients/i.test(sql)) { target.recipeIngredients = target.recipeIngredients.filter((item) => item.recipe_id !== Number(params[0])); return [{ affectedRows: 1 }] }
    if (/INSERT INTO recipe_ingredients/i.test(sql)) { target.recipeIngredients.push({ recipe_id: Number(params[0]), ingredient_id: Number(params[1]), amount_grams: params[2], note: params[3] }); return [{ affectedRows: 1 }] }
    if (/SELECT tag_id AS tagId FROM recipe_tags/i.test(sql)) return [target.recipeTags.filter((item) => item.recipe_id === Number(params[0])).map((item) => ({ tagId: item.tag_id }))]
    if (/FROM tag_definitions WHERE id IN/i.test(sql)) return [target.tagDefinitions.filter((item) => params.includes(item.id) && item.status === 'active').map((item) => ({ id: item.id, familyId: item.family_id, kind: item.kind }))]
    if (/DELETE FROM recipe_tags/i.test(sql)) { target.recipeTags = target.recipeTags.filter((item) => item.recipe_id !== Number(params[0])); return [{ affectedRows: 1 }] }
    if (/INSERT INTO recipe_tags/i.test(sql)) {
      if (Number(params[1]) === failOnTagId) throw new Error('simulated tag relation failure')
      target.recipeTags.push({ recipe_id: Number(params[0]), tag_id: Number(params[1]) }); return [{ affectedRows: 1 }]
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }
  database.execute = (sql, params) => execute(state, sql, params)
  database.getConnection = async () => {
    const connection = {
      working: null,
      beginTransaction: async () => { connection.working = clone(state) },
      commit: async () => { Object.assign(state, connection.working); connection.working = null },
      rollback: async () => { connection.working = null },
      release: () => {},
      execute: (sql, params) => execute(connection.working || state, sql, params)
    }
    return connection
  }
  return database
}

function makeApp(database) {
  const app = express()
  app.use(express.json())
  app.use('/api', recipeRouter({
    database,
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

function body(tagIds) {
  return { title: 'Updated', category: '荤菜', steps: '步骤', cookMinutes: 20, difficulty: 2, ingredients: [{ ingredientId: 1, amountGrams: 100 }], ...(tagIds === undefined ? {} : { tagIds }) }
}

function recipeTagIds(database) { return database.state.recipeTags.filter((item) => item.recipe_id === 1).map((item) => item.tag_id) }

test('Recipe update replaces tags only when tagIds is supplied and deduplicates ids', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database), async (baseUrl) => {
    let response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body([1, 20, 20])) })
    assert.equal(response.status, 200)
    assert.deepEqual(recipeTagIds(database), [1, 20])
    response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body()) })
    assert.equal(response.status, 200)
    assert.deepEqual(recipeTagIds(database), [1, 20])
    response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body([])) })
    assert.equal(response.status, 200)
    assert.deepEqual(recipeTagIds(database), [])
  })
})

test('Recipe tag edits preserve an existing bundled cover URL', async () => {
  const database = makeDatabase()
  database.state.recipes[0].cover_url = '/assets/recipes/tomato-scrambled-eggs.jpg'
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes/1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Old', category: '荤菜', steps: '步骤', cookMinutes: 20, difficulty: 2,
        ingredients: [{ ingredientId: 1, amountGrams: 100 }],
        coverUrl: '/assets/recipes/tomato-scrambled-eggs.jpg',
        tagIds: []
      })
    })
    assert.equal(response.status, 200)
  })
  assert.equal(database.state.recipes[0].cover_url, '/assets/recipes/tomato-scrambled-eggs.jpg')
  assert.deepEqual(recipeTagIds(database), [])
})

test('Recipe create and update reject more than three tags', async () => {
  const database = makeDatabase()
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes/1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Old', category: '荤菜', steps: '步骤', cookMinutes: 20, difficulty: 2,
        ingredients: [{ ingredientId: 1, amountGrams: 100 }], tagIds: [1, 20, 21, 22]
      })
    })
    assert.equal(response.status, 400)
    assert.match((await response.json()).message, /最多选择3个/)
  })
})

test('Recipe tag validation rejects cross-family and deleted tag references without partial update', async () => {
  for (const tagIds of [[30], [22]]) {
    const database = makeDatabase()
    await withServer(makeApp(database), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body(tagIds)) })
      assert.equal(response.status, 404)
    })
    assert.deepEqual(recipeTagIds(database), [21])
    assert.equal(database.state.recipes[0].title, 'Old')
  }
})

test('Recipe tag relation failure rolls back the Recipe fields, ingredients, and tag set together', async () => {
  const database = makeDatabase({ failOnTagId: 20 })
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body([1, 20])) })
    assert.equal(response.status, 500)
  })
  assert.equal(database.state.recipes[0].title, 'Old')
  assert.deepEqual(database.state.recipeIngredients.map((item) => item.ingredient_id), [1])
  assert.deepEqual(recipeTagIds(database), [21])
})
