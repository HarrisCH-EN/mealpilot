const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { router: menuRouter } = require('../src/routes/menus')
const { applyRecommendationRun } = require('../src/services/recommendation-run-service')

const familyId = 1
const memberId = 101

function makeConnection({ creatorStatus = 'active', recipes = [], items = [], existingItems = [] } = {}) {
  const state = {
    menus: [],
    menuItems: [...existingItems],
    commits: 0,
    rollbacks: 0
  }
  const connection = {
    state,
    async beginTransaction() {},
    async commit() { state.commits++ },
    async rollback() { state.rollbacks++ },
    release() {},
    async execute(sql, params) {
      if (/FROM family_members/i.test(sql)) return [[{ id: memberId, family_id: familyId, status: creatorStatus }]]
      if (/FROM recommendation_runs/i.test(sql)) return [[{ menuDate: '2026-09-08', mealType: 'dinner', creatorId: memberId, creatorFamilyId: familyId, creatorStatus }]]
      if (/FROM recommendation_items/i.test(sql)) {
        return [items.map((item) => ({
          recipeId: item.recipeId,
          recipeFamilyId: item.recipeFamilyId,
          recipeStatus: item.recipeStatus,
          familyRecipeId: item.recipeFamilyId === familyId ? item.recipeId : null
        }))]
      }
      if (/INSERT INTO menus/i.test(sql)) {
        state.menus.push({ familyId: params[0], runId: params[2] })
        return [{ insertId: 77 }]
      }
      if (/SELECT id, note FROM menu_items/i.test(sql)) {
        const existing = state.menuItems.find((item) => item.menuId === params[0] && item.recipeId === params[1])
        return [existing ? [{ id: existing.itemId, note: existing.note }] : []]
      }
      if (/INSERT INTO menu_items/i.test(sql)) {
        const item = { menuId: params[0], recipeId: params[1], source: params[2], note: params[3], itemId: state.menuItems.length + 1 }
        state.menuItems.push(item)
        return [{ insertId: item.itemId }]
      }
      if (/FROM recipes/i.test(sql)) return [recipes]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  return connection
}

test('applyRecommendationRun accepts only active same-Family recipes and preserves existing items', async () => {
  const connection = makeConnection({
    recipes: [{ id: 11, family_id: familyId, status: 'active' }, { id: 12, family_id: familyId, status: 'active' }],
    items: [
      { recipeId: 11, recipeFamilyId: familyId, recipeStatus: 'active' },
      { recipeId: 12, recipeFamilyId: familyId, recipeStatus: 'active' }
    ],
    existingItems: [{ menuId: 77, recipeId: 11, itemId: 90, source: 'manual', note: '手工备注' }]
  })

  const result = await applyRecommendationRun({ connection, familyId, memberId, runId: 9 })

  assert.deepEqual(result, { menuId: 77, addedCount: 1, alreadyPresentCount: 1 })
  assert.deepEqual(connection.state.menuItems[0], { menuId: 77, recipeId: 11, itemId: 90, source: 'manual', note: '手工备注' })
  assert.equal(connection.state.menuItems.filter((item) => item.recipeId === 11).length, 1)
})

test('applyRecommendationRun rejects a Run whose creator is no longer active before writing a Menu', async () => {
  const connection = makeConnection({
    creatorStatus: 'left',
    items: [{ recipeId: 11, recipeFamilyId: familyId, recipeStatus: 'active' }]
  })

  await assert.rejects(
    applyRecommendationRun({ connection, familyId, memberId, runId: 9 }),
    (error) => error.status === 409 && error.message === '推荐结果已失效，请重新生成'
  )
  assert.deepEqual(connection.state.menus, [])
  assert.deepEqual(connection.state.menuItems, [])
})

test('applyRecommendationRun rejects a deleted Recipe as a stale recommendation before writing a Menu', async () => {
  const connection = makeConnection({
    items: [{ recipeId: 11, recipeFamilyId: familyId, recipeStatus: 'deleted' }]
  })

  await assert.rejects(
    applyRecommendationRun({ connection, familyId, memberId, runId: 9 }),
    (error) => error.status === 409 && error.message === '推荐结果已过期，请重新生成'
  )
  assert.deepEqual(connection.state.menus, [])
  assert.deepEqual(connection.state.menuItems, [])
})

test('applyRecommendationRun treats a missing Recipe as a stale recommendation and does not partially write', async () => {
  const connection = makeConnection({
    items: [
      { recipeId: 11, recipeFamilyId: familyId, recipeStatus: 'active' },
      { recipeId: 12, recipeFamilyId: null, recipeStatus: null }
    ]
  })

  await assert.rejects(
    applyRecommendationRun({ connection, familyId, memberId, runId: 9 }),
    (error) => error.status === 409 && error.message === '推荐结果已过期，请重新生成'
  )
  assert.deepEqual(connection.state.menus, [])
  assert.deepEqual(connection.state.menuItems, [])
})

test('applyRecommendationRun rejects a cross-Family Recipe relationship as inaccessible', async () => {
  const connection = makeConnection({
    items: [{ recipeId: 22, recipeFamilyId: 2, recipeStatus: 'active' }]
  })

  await assert.rejects(
    applyRecommendationRun({ connection, familyId, memberId, runId: 9 }),
    (error) => error.status === 404
  )
  assert.deepEqual(connection.state.menus, [])
  assert.deepEqual(connection.state.menuItems, [])
})

test('apply route rolls back and releases its connection when the final recommendation item is stale', async () => {
  const connection = makeConnection({
    items: [
      { recipeId: 11, recipeFamilyId: familyId, recipeStatus: 'active' },
      { recipeId: 12, recipeFamilyId: familyId, recipeStatus: 'deleted' }
    ]
  })
  let released = 0
  const release = connection.release
  connection.release = () => { released++; release() }
  const database = { getConnection: async () => connection }
  const app = express()
  app.use(express.json())
  app.use('/api', menuRouter({
    database,
    auth: (_request, _response, next) => next(),
    family: (request, _response, next) => { request.membership = { family_id: familyId, member_id: memberId }; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ message: error.message }))
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)) })
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/recommendations/9/apply`, { method: 'POST' })
    assert.equal(response.status, 409)
    assert.equal(connection.state.rollbacks, 1)
    assert.equal(connection.state.commits, 0)
    assert.equal(released, 1)
    assert.deepEqual(connection.state.menus, [])
    assert.deepEqual(connection.state.menuItems, [])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
