const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { router: recipeRouter } = require('../src/routes/recipes')
const { router: menuRouter } = require('../src/routes/menus')
const { addMenuItem } = require('../src/services/menu-item-service')
const { persistRecommendationRun, applyRecommendationRun } = require('../src/services/recommendation-run-service')

const familyA = { id: 1, name: '家庭 A' }
const familyB = { id: 2, name: '家庭 B' }
const memberA = { id: 101, family_id: familyA.id, role: 'owner', status: 'active' }
const recipeA = { id: 11, family_id: familyA.id, title: '菜谱 A' }
const recipeB = { id: 22, family_id: familyB.id, title: '菜谱 B' }
const menuA = { id: 31, family_id: familyA.id }
const menuB = { id: 32, family_id: familyB.id }

function makeApp(route, database) {
  const app = express()
  app.use(express.json())
  app.use('/api', route({
    database,
    auth: (request, _response, next) => {
      request.user = { id: 1001, display_name: '成员 A' }
      next()
    },
    family: (request, _response, next) => {
      request.membership = memberA
      next()
    }
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

function recipeDatabase({ updateCalls = [], deleteCalls = [] } = {}) {
  const database = {
    updateCalls,
    deleteCalls,
    execute: async (sql, params) => {
      if (/FROM recipes WHERE id = \?/i.test(sql)) {
        const recipe = params[1] === familyA.id && Number(params[0]) === recipeA.id ? recipeA : null
        return [recipe ? [{ createdByMemberId: memberA.id, author: memberA.id }] : []]
      }
      if (/FROM ingredients WHERE id IN/i.test(sql)) return [[{ id: 1 }]]
      if (/SELECT ri\.ingredient_id/i.test(sql)) return [[]]
      if (/DELETE FROM recipe_ingredients/i.test(sql)) return [{ affectedRows: 1 }]
      if (/INSERT INTO recipe_ingredients/i.test(sql)) return [{ affectedRows: 1 }]
      if (/UPDATE recipes SET status/i.test(sql)) {
        deleteCalls.push({ sql, params })
        return [{ affectedRows: 1 }]
      }
      if (/UPDATE recipes SET/i.test(sql)) {
        updateCalls.push({ sql, params })
        return [{ affectedRows: 1 }]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  database.getConnection = async () => ({
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: database.execute
  })
  return database
}

test('GET, PUT, and DELETE cannot access Family B Recipe as a Family A member', async () => {
  const database = recipeDatabase()
  await withServer(makeApp(recipeRouter, database), async (baseUrl) => {
    const putBody = {
      title: '修改后的菜谱',
      category: '荤菜',
      steps: '步骤',
      cookMinutes: 20,
      difficulty: 2,
      ingredients: [{ ingredientId: 1, amountGrams: 100 }]
    }
    const requests = [
      fetch(`${baseUrl}/api/recipes/${recipeB.id}`),
      fetch(`${baseUrl}/api/recipes/${recipeB.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(putBody) }),
      fetch(`${baseUrl}/api/recipes/${recipeB.id}`, { method: 'DELETE' })
    ]
    const responses = await Promise.all(requests)
    assert.deepEqual(responses.map((response) => response.status), [404, 404, 404])
    assert.deepEqual(database.updateCalls, [])
    assert.deepEqual(database.deleteCalls, [])
  })
})

test('recipe writes retain the Family condition in their final UPDATE and DELETE statements', async () => {
  const updateCalls = []
  const deleteCalls = []
  const database = recipeDatabase({ updateCalls, deleteCalls })
  await withServer(makeApp(recipeRouter, database), async (baseUrl) => {
    const body = {
      title: '菜谱 A 新标题',
      category: '荤菜',
      steps: '步骤',
      cookMinutes: 20,
      difficulty: 2,
      ingredients: [{ ingredientId: 1, amountGrams: 100 }]
    }
    const putResponse = await fetch(`${baseUrl}/api/recipes/${recipeA.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const deleteResponse = await fetch(`${baseUrl}/api/recipes/${recipeA.id}`, { method: 'DELETE' })
    assert.equal(putResponse.status, 200)
    assert.equal(deleteResponse.status, 200)
    assert.match(updateCalls[0].sql, /WHERE id = \? AND family_id = \? AND status = 'active'/i)
    assert.deepEqual(updateCalls[0].params.slice(-2), [String(recipeA.id), familyA.id])
    assert.match(deleteCalls[0].sql, /WHERE id = \? AND family_id = \? AND status = 'active'/i)
    assert.deepEqual(deleteCalls[0].params, [String(recipeA.id), familyA.id])
  })
})

test('addMenuItem rejects Family B Recipe before creating a Family A Menu or MenuItem', async () => {
  const state = { menus: [], menuItems: [] }
  const connection = {
    async execute(sql, params) {
      if (/FROM family_members/i.test(sql)) return [[memberA]]
      if (/FROM recipes/i.test(sql)) return [[]]
      if (/INSERT INTO menus/i.test(sql)) throw new Error('must not create a menu')
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }

  await assert.rejects(
    addMenuItem({ connection, familyId: familyA.id, memberId: memberA.id, menuDate: '2026-09-08', mealType: 'lunch', recipeId: recipeB.id }),
    (error) => error.status === 404
  )
  assert.deepEqual(state, { menus: [], menuItems: [] })
})

test('addMenuItem permits a same-Family Recipe and creates only the Family A relationship', async () => {
  const state = { menus: [], menuItems: [] }
  const connection = {
    async execute(sql, params) {
      if (/FROM family_members/i.test(sql)) return [[memberA]]
      if (/FROM recipes/i.test(sql)) return [[recipeA]]
      if (/INSERT INTO menus/i.test(sql)) {
        state.menus.push({ family_id: params[0], created_by_member_id: params[1] })
        return [{ insertId: 31 }]
      }
      if (/SELECT id, note FROM menu_items/i.test(sql)) return [[]]
      if (/INSERT INTO menu_items/i.test(sql)) {
        state.menuItems.push({ menu_id: 31, recipe_id: params[1] })
        return [{ insertId: 41 }]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }

  const result = await addMenuItem({ connection, familyId: familyA.id, memberId: memberA.id, menuDate: '2026-09-08', mealType: 'lunch', recipeId: recipeA.id })
  assert.equal(result.status, 'created')
  assert.deepEqual(state.menus, [{ family_id: familyA.id, created_by_member_id: memberA.id }])
  assert.deepEqual(state.menuItems, [{ menu_id: menuA.id, recipe_id: recipeA.id }])
})

test('DELETE Family B MenuItem is a 404 and does not delete the relationship', async () => {
  const deleted = []
  const database = {
    execute: async (sql, params) => {
      if (/DELETE mi FROM menu_items/i.test(sql)) return [{ affectedRows: 0 }]
      if (/DELETE FROM menu_items/i.test(sql)) {
        deleted.push(params[0])
        return [{ affectedRows: 1 }]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }

  await withServer(makeApp(menuRouter, database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/menus/items/99`, { method: 'DELETE' })
    assert.equal(response.status, 404)
    assert.deepEqual(deleted, [])
  })
})

test('GET menus scopes joined Recipe data to the Menu Family even when a dirty cross-Family MenuItem exists', async () => {
  const database = {
    execute: async (sql) => {
      if (/FROM menus m/i.test(sql)) {
        assert.match(sql, /r\.family_id\s*=\s*m\.family_id/i)
        return [[{ id: menuA.id, menuDate: '2026-09-08', mealType: 'lunch', status: 'active', itemId: null, recipeId: null, title: null, category: null, source: 'manual', note: '' }]]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }

  await withServer(makeApp(menuRouter, database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/menus?date=2026-09-08`)
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.deepEqual(data.data[0].items, [])
  })
})

test('Family A insights query is Family-scoped and does not return Family B Recipe statistics', async () => {
  const database = {
    execute: async (sql, params) => {
      if (/usedCount/i.test(sql)) {
        assert.match(sql, /r\.family_id\s*=\s*\?/i)
        assert.deepEqual(params, [familyA.id, familyA.id])
        return [[{ id: recipeA.id, title: recipeA.title, category: '荤菜', usedCount: 0 }]]
      }
      if (/COUNT\(DISTINCT m\.id\)/i.test(sql)) return [[{ menuCount: 1, itemCount: 1, averageRating: 5 }]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }

  await withServer(makeApp(menuRouter, database), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/insights`)
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.deepEqual(data.data.popular.map((item) => item.id), [recipeA.id])
  })
})

test('persistRecommendationRun rejects a Family B Recipe before creating a Family A RecommendationItem', async () => {
  const state = { runs: [], items: [] }
  const connection = {
    async execute(sql) {
      if (/FROM family_members/i.test(sql)) return [[memberA]]
      if (/FROM recipes/i.test(sql)) return [[]]
      if (/INSERT INTO recommendation_runs/i.test(sql)) {
        state.runs.push({ family_id: familyA.id })
        return [{ insertId: 51 }]
      }
      if (/INSERT INTO recommendation_items/i.test(sql)) {
        state.items.push(true)
        return [{ insertId: 61 }]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }

  await assert.rejects(
    persistRecommendationRun({ connection, familyId: familyA.id, memberId: memberA.id, menuDate: '2026-09-08', mealType: 'dinner', peopleCount: 2, maxCookMinutes: 90, mode: 'balanced', recommendation: { totalScore: 80, totalCookMinutes: 30, scoreBreakdown: {}, items: [{ id: recipeB.id, score: { total: 80, reason: 'reason' } }] } }),
    (error) => error.status === 404
  )
  assert.deepEqual(state, { runs: [], items: [] })
})

test('applyRecommendationRun rejects a dirty Run A to Recipe B relationship before creating a Menu', async () => {
  const state = { menus: [], items: [] }
  const connection = {
    async execute(sql) {
      if (/FROM family_members/i.test(sql)) return [[memberA]]
      if (/FROM recommendation_runs/i.test(sql)) return [[{ menuDate: '2026-09-08', mealType: 'dinner', creatorId: memberA.id, creatorFamilyId: familyA.id, creatorStatus: 'active' }]]
      if (/FROM recommendation_items/i.test(sql)) return [[{ recipeId: recipeB.id, familyRecipeId: recipeB.id, recipeFamilyId: familyB.id, recipeStatus: 'active' }]]
      if (/INSERT INTO menus/i.test(sql)) {
        state.menus.push(true)
        return [{ insertId: 71 }]
      }
      if (/INSERT INTO menu_items/i.test(sql)) {
        state.items.push(true)
        return [{ insertId: 81 }]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }

  await assert.rejects(
    applyRecommendationRun({ connection, familyId: familyA.id, memberId: memberA.id, runId: 51 }),
    (error) => error.status === 404
  )
  assert.deepEqual(state, { menus: [], items: [] })
})

test('applyRecommendationRun cannot apply Family B Run through the Family A boundary', async () => {
  const state = { menus: [], items: [] }
  const connection = {
    async execute(sql) {
      if (/FROM family_members/i.test(sql)) return [[memberA]]
      if (/FROM recommendation_runs/i.test(sql)) return [[]]
      if (/INSERT INTO menus/i.test(sql)) {
        state.menus.push(true)
        return [{ insertId: 71 }]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }

  await assert.rejects(
    applyRecommendationRun({ connection, familyId: familyA.id, memberId: memberA.id, runId: 52 }),
    (error) => error.status === 404
  )
  assert.deepEqual(state, { menus: [], items: [] })
})
