const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { router: recipeRouter } = require('../src/routes/recipes')

const membership = { family_id: 1, member_id: 101, role: 'owner' }

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function makeRecipeDatabase({ failOnIngredientId = null, initial } = {}) {
  const state = clone(initial || {
    nextRecipeId: 2,
    recipes: [{ id: 1, family_id: 1, created_by_member_id: 101, title: 'Old Recipe', cover_url: '', status: 'active' }],
    ingredients: [{ id: 1 }, { id: 2 }, { id: 3 }],
    recipeIngredients: [
      { recipe_id: 1, ingredient_id: 1, amount_grams: 100, note: 'A' },
      { recipe_id: 1, ingredient_id: 2, amount_grams: 50, note: 'B' }
    ]
  })
  const calls = { pool: [], connection: [], begin: 0, commit: 0, rollback: 0, release: 0 }

  const execute = async (target, sql, params) => {
    if (/FROM ingredients WHERE id IN/i.test(sql)) {
      return [target.ingredients.filter((ingredient) => params.includes(ingredient.id))]
    }
    if (/SELECT created_by_member_id AS author(?:, cover_url AS coverUrl)? FROM recipes/i.test(sql)) {
      const recipe = target.recipes.find((item) => item.id === Number(params[0]) && item.family_id === params[1] && item.status === 'active')
      return [recipe ? [{ author: recipe.created_by_member_id, coverUrl: recipe.cover_url || '' }] : []]
    }
    if (/INSERT INTO recipes/i.test(sql)) {
      const [familyId, memberId, title] = params
      const recipe = { id: target.nextRecipeId++, family_id: familyId, created_by_member_id: memberId, title, cover_url: params[9] || '', status: 'active' }
      target.recipes.push(recipe)
      return [{ insertId: recipe.id }]
    }
    if (/UPDATE recipes SET title/i.test(sql)) {
      const [title, _category, _description, _steps, _cookMinutes, _difficulty, _servings, coverUrl, recipeId, familyId] = params
      const recipe = target.recipes.find((item) => item.id === Number(recipeId) && item.family_id === familyId && item.status === 'active')
      if (recipe) {
        recipe.title = title
        recipe.cover_url = coverUrl || ''
      }
      return [{ affectedRows: recipe ? 1 : 0 }]
    }
    if (/DELETE FROM recipe_ingredients/i.test(sql)) {
      target.recipeIngredients = target.recipeIngredients.filter((item) => item.recipe_id !== Number(params[0]))
      return [{ affectedRows: 1 }]
    }
    if (/INSERT INTO recipe_ingredients/i.test(sql)) {
      const [recipeId, ingredientId, amountGrams, note] = params
      if (Number(ingredientId) === failOnIngredientId) throw new Error('simulated ingredient insert failure')
      target.recipeIngredients.push({ recipe_id: Number(recipeId), ingredient_id: Number(ingredientId), amount_grams: amountGrams, note })
      return [{ affectedRows: 1 }]
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }

  const database = {
    state,
    calls,
    execute: async (sql, params) => {
      calls.pool.push(sql)
      return execute(state, sql, params)
    },
    getConnection: async () => {
      const connection = {
        working: null,
        beginTransaction: async () => {
          calls.begin++
          connection.working = clone(state)
        },
        commit: async () => {
          calls.commit++
          state.nextRecipeId = connection.working.nextRecipeId
          state.recipes = connection.working.recipes
          state.ingredients = connection.working.ingredients
          state.recipeIngredients = connection.working.recipeIngredients
          connection.working = null
        },
        rollback: async () => {
          calls.rollback++
          connection.working = null
        },
        release: () => { calls.release++ },
        execute: async (sql, params) => {
          calls.connection.push(sql)
          return execute(connection.working || state, sql, params)
        }
      }
      return connection
    }
  }
  return database
}

function makeApp(database) {
  const app = express()
  app.use(express.json())
  app.use('/api', recipeRouter({
    database,
    auth: (request, _response, next) => { request.user = { id: 7 }; next() },
    family: (request, _response, next) => { request.membership = membership; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ message: error.message }))
  return app
}

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance))
  })
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

function recipeBody(title, ingredients, coverUrl) {
  return { title, category: '荤菜', steps: '步骤', cookMinutes: 20, difficulty: 2, ingredients, ...(coverUrl === undefined ? {} : { coverUrl }) }
}

function relationIds(database) {
  return database.state.recipeIngredients
    .filter((item) => item.recipe_id === 1)
    .map((item) => item.ingredient_id)
}

test('create rolls back the Recipe and all relations when a later ingredient insert fails', async () => {
  const database = makeRecipeDatabase({ failOnIngredientId: 2, initial: { nextRecipeId: 2, recipes: [], ingredients: [{ id: 1 }, { id: 2 }], recipeIngredients: [] } })
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody('New Recipe', [{ ingredientId: 1, amountGrams: 100 }, { ingredientId: 2, amountGrams: 50 }])) })
    assert.equal(response.status, 500)
  })
  assert.deepEqual(database.state.recipes, [])
  assert.deepEqual(database.state.recipeIngredients, [])
  assert.equal(database.calls.begin, 1)
  assert.equal(database.calls.rollback, 1)
  assert.equal(database.calls.commit, 0)
  assert.equal(database.calls.release, 1)
  assert.equal(database.calls.pool.filter((sql) => /INSERT INTO recipes|recipe_ingredients/i.test(sql)).length, 0)
})

test('create rejects a missing Ingredient ID before inserting the Recipe', async () => {
  const database = makeRecipeDatabase()
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody('New Recipe', [{ ingredientId: 999, amountGrams: 100 }])) })
    assert.equal(response.status, 400)
  })
  assert.equal(database.state.recipes.length, 1)
  assert.deepEqual(relationIds(database), [1, 2])
})

test('create rejects duplicate Ingredients without relying on the database primary key', async () => {
  const database = makeRecipeDatabase({ initial: { nextRecipeId: 2, recipes: [], ingredients: [{ id: 1 }], recipeIngredients: [] } })
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody('New Recipe', [{ ingredientId: 1, amountGrams: 100 }, { ingredientId: 1, amountGrams: 50 }])) })
    assert.equal(response.status, 400)
  })
  assert.deepEqual(database.state.recipes, [])
  assert.deepEqual(database.state.recipeIngredients, [])
})

test('create rejects empty Ingredients without writing anything', async () => {
  const database = makeRecipeDatabase({ initial: { nextRecipeId: 2, recipes: [], ingredients: [], recipeIngredients: [] } })
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody('New Recipe', [])) })
    assert.equal(response.status, 400)
  })
  assert.deepEqual(database.state.recipes, [])
})

test('create rejects a non-positive or non-numeric amount without writing anything', async () => {
  for (const amountGrams of [0, -1, 'not-a-number']) {
    const database = makeRecipeDatabase({ initial: { nextRecipeId: 2, recipes: [], ingredients: [{ id: 1 }], recipeIngredients: [] } })
    await withServer(makeApp(database), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/recipes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody('New Recipe', [{ ingredientId: 1, amountGrams }])) })
      assert.equal(response.status, 400)
    })
    assert.deepEqual(database.state.recipes, [])
  }
})

test('edit rolls back new Recipe fields and new relations when a later ingredient insert fails', async () => {
  const database = makeRecipeDatabase({ failOnIngredientId: 2 })
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody('New Recipe', [{ ingredientId: 3, amountGrams: 80 }, { ingredientId: 2, amountGrams: 20 }])) })
    assert.equal(response.status, 500)
  })
  assert.equal(database.state.recipes[0].title, 'Old Recipe')
  assert.deepEqual(relationIds(database), [1, 2])
  assert.equal(database.calls.begin, 1)
  assert.equal(database.calls.rollback, 1)
  assert.equal(database.calls.commit, 0)
  assert.equal(database.calls.release, 1)
})

test('edit commits the Recipe fields and complete new relation set together', async () => {
  const database = makeRecipeDatabase()
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody('New Recipe', [{ ingredientId: 3, amountGrams: 80 }])) })
    assert.equal(response.status, 200)
  })
  assert.equal(database.state.recipes[0].title, 'New Recipe')
  assert.deepEqual(relationIds(database), [3])
  assert.equal(database.calls.begin, 1)
  assert.equal(database.calls.commit, 1)
  assert.equal(database.calls.rollback, 0)
  assert.equal(database.calls.release, 1)
  assert.equal(database.calls.pool.some((sql) => /INSERT INTO recipes|UPDATE recipes|recipe_ingredients/i.test(sql)), false)
  assert.ok(database.calls.connection.some((sql) => /FROM ingredients WHERE id IN/i.test(sql)))
  assert.ok(database.calls.connection.some((sql) => /UPDATE recipes SET/i.test(sql)))
  assert.ok(database.calls.connection.some((sql) => /DELETE FROM recipe_ingredients/i.test(sql)))
  assert.ok(database.calls.connection.some((sql) => /INSERT INTO recipe_ingredients/i.test(sql)))
})

test('edit rejects empty Ingredients and preserves the old relation set', async () => {
  const database = makeRecipeDatabase()
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody('New Recipe', [])) })
    assert.equal(response.status, 400)
  })
  assert.equal(database.state.recipes[0].title, 'Old Recipe')
  assert.deepEqual(relationIds(database), [1, 2])
  assert.equal(database.calls.begin, 0)
})

test('edit rejects duplicate Ingredients and preserves the old relation set', async () => {
  const database = makeRecipeDatabase()
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody('New Recipe', [{ ingredientId: 3, amountGrams: 80 }, { ingredientId: 3, amountGrams: 20 }])) })
    assert.equal(response.status, 400)
  })
  assert.equal(database.state.recipes[0].title, 'Old Recipe')
  assert.deepEqual(relationIds(database), [1, 2])
  assert.equal(database.calls.begin, 0)
})

test('edit rejects a missing Ingredient ID and preserves the old relation set', async () => {
  const database = makeRecipeDatabase()
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody('New Recipe', [{ ingredientId: 999, amountGrams: 80 }])) })
    assert.equal(response.status, 400)
  })
  assert.equal(database.state.recipes[0].title, 'Old Recipe')
  assert.deepEqual(relationIds(database), [1, 2])
  assert.equal(database.calls.begin, 1)
  assert.equal(database.calls.rollback, 1)
  assert.equal(database.calls.release, 1)
})

test('create persists a validated cover URL with the Recipe', async () => {
  const database = makeRecipeDatabase({ initial: { nextRecipeId: 2, recipes: [], ingredients: [{ id: 1 }], recipeIngredients: [] } })
  await withServer(makeApp(database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recipes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody('Covered Recipe', [{ ingredientId: 1, amountGrams: 100 }], '/uploads/recipes/abcdef01.jpg')) })
    assert.equal(response.status, 201)
  })
  assert.equal(database.state.recipes[0].cover_url, '/uploads/recipes/abcdef01.jpg')
})

test('edit preserves an existing cover when omitted and updates it when replaced', async () => {
  const database = makeRecipeDatabase({ initial: { nextRecipeId: 2, recipes: [{ id: 1, family_id: 1, created_by_member_id: 101, title: 'Old Recipe', cover_url: '/assets/recipes/old.jpg', status: 'active' }], ingredients: [{ id: 1 }, { id: 2 }, { id: 3 }], recipeIngredients: [{ recipe_id: 1, ingredient_id: 1, amount_grams: 100, note: '' }] } })
  await withServer(makeApp(database), async (baseUrl) => {
    let response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody('Preserved Recipe', [{ ingredientId: 2, amountGrams: 100 }])) })
    assert.equal(response.status, 200)
    assert.equal(database.state.recipes[0].cover_url, '/assets/recipes/old.jpg')
    response = await fetch(`${baseUrl}/api/recipes/1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody('Replaced Recipe', [{ ingredientId: 3, amountGrams: 100 }], '/uploads/recipes/abcdef02.webp')) })
    assert.equal(response.status, 200)
  })
  assert.equal(database.state.recipes[0].cover_url, '/uploads/recipes/abcdef02.webp')
})

test('recipe rejects non-persistable local or absolute cover paths', async () => {
  for (const coverUrl of ['wxfile://tmp/cover.jpg', 'C:\\tmp\\cover.jpg', '../../secret.jpg', 'javascript:alert(1)']) {
    const database = makeRecipeDatabase({ initial: { nextRecipeId: 2, recipes: [], ingredients: [{ id: 1 }], recipeIngredients: [] } })
    await withServer(makeApp(database), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/recipes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recipeBody('Invalid Cover', [{ ingredientId: 1, amountGrams: 100 }], coverUrl)) })
      assert.equal(response.status, 400)
    })
    assert.deepEqual(database.state.recipes, [])
  }
})
