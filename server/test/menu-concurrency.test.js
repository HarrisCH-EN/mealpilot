const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { addMenuItem } = require('../src/services/menu-item-service')
const { router: menuRouter } = require('../src/routes/menus')

const familyA = 1
const memberA = 101
const recipeA = 11
const recipeA2 = 12

function barrier(expected) {
  let count = 0
  let release
  const released = new Promise((resolve) => { release = resolve })
  return async () => {
    count++
    if (count === expected) release()
    await released
  }
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

test('concurrent additions of the same Recipe produce one MenuItem and stable business results', async () => {
  const waitForInitialReads = barrier(2)
  const state = { menu: { id: 7, family_id: familyA }, items: [], insertAttempts: 0, existingReads: 0 }
  const connection = {
    async execute(sql, params) {
      if (sql.includes('FROM family_members')) return [[{ id: memberA }]]
      if (sql.includes('FROM recipes')) return [[{ id: Number(params[0]) }]]
      if (sql.includes('INSERT INTO menus')) return [{ insertId: state.menu.id }]
      if (sql.includes('SELECT id, note')) {
        state.existingReads++
        if (state.existingReads <= 2) {
          await waitForInitialReads()
          return [[]]
        }
        return [[{ id: 99, note: state.items[0].note }]]
      }
      if (sql.includes('INSERT INTO menu_items')) {
        state.insertAttempts++
        if (state.insertAttempts === 1) {
          state.items.push({ menu_id: state.menu.id, recipe_id: recipeA, note: params[3] })
          return [{ insertId: 99 }]
        }
        const error = new Error('Duplicate entry')
        error.code = 'ER_DUP_ENTRY'
        error.errno = 1062
        throw error
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }

  const results = await Promise.all([
    addMenuItem({ connection, familyId: familyA, memberId: memberA, menuDate: '2026-09-08', mealType: 'lunch', recipeId: recipeA, note: '第一个备注' }),
    addMenuItem({ connection, familyId: familyA, memberId: memberA, menuDate: '2026-09-08', mealType: 'lunch', recipeId: recipeA, note: '第二个备注' })
  ])

  assert.deepEqual(results.map((result) => result.status).sort(), ['already-present', 'created'])
  assert.equal(state.items.length, 1)
  assert.equal(results.find((result) => result.status === 'already-present').note, state.items[0].note)
})

test('concurrent additions of different Recipes reuse one Menu slot', async () => {
  const state = { menus: [], items: [], menuInsertAttempts: 0 }
  const connection = {
    async execute(sql, params) {
      if (sql.includes('FROM family_members')) return [[{ id: memberA }]]
      if (sql.includes('FROM recipes')) return [[{ id: Number(params[0]) }]]
      if (sql.includes('INSERT INTO menus')) {
        state.menuInsertAttempts++
        if (!state.menus.length) state.menus.push({ id: 7, family_id: params[0], date: params[2], mealType: params[3] })
        if (state.menuInsertAttempts > 1) {
          const error = new Error('Duplicate entry')
          error.code = 'ER_DUP_ENTRY'
          error.errno = 1062
          throw error
        }
        return [{ insertId: 7 }]
      }
      if (sql.includes('SELECT id FROM menus')) return [[{ id: 7 }]]
      if (sql.includes('SELECT id, note')) return [[]]
      if (sql.includes('INSERT INTO menu_items')) {
        state.items.push({ menu_id: params[0], recipe_id: params[1] })
        return [{ insertId: state.items.length }]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }

  const results = await Promise.all([recipeA, recipeA2].map((recipeId) => addMenuItem({ connection, familyId: familyA, memberId: memberA, menuDate: '2026-09-08', mealType: 'lunch', recipeId })))
  assert.deepEqual(results.map((result) => result.status).sort(), ['created', 'created'])
  assert.equal(state.menus.length, 1)
  assert.deepEqual(state.items.map((item) => item.recipe_id).sort(), [recipeA, recipeA2])
})

test('deleting the last MenuItem keeps the Menu and Recipe', async () => {
  const state = {
    menus: [{ id: 7, family_id: familyA }],
    menuItems: [{ id: 99, menu_id: 7, recipe_id: recipeA }],
    recipes: [{ id: recipeA, family_id: familyA, status: 'active' }]
  }
  const database = {
    execute: async (sql, params) => {
      if (sql.includes('DELETE mi FROM menu_items')) {
        const item = state.menuItems.find((candidate) => candidate.id === Number(params[0]))
        const menu = state.menus.find((candidate) => candidate.id === item?.menu_id && candidate.family_id === params[1])
        if (!item || !menu) return [{ affectedRows: 0 }]
        state.menuItems = state.menuItems.filter((candidate) => candidate.id !== item.id)
        return [{ affectedRows: 1 }]
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const app = express()
  app.use(express.json())
  app.use('/api', menuRouter({
    database,
    auth: (_request, _response, next) => next(),
    family: (request, _response, next) => { request.membership = { family_id: familyA, member_id: memberA, role: 'owner' }; next() }
  }))
  app.use((error, _request, response, _next) => response.status(error.status || 500).json({ message: error.message }))

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/menus/items/99`, { method: 'DELETE' })
    assert.equal(response.status, 200)
  })
  assert.deepEqual(state.menuItems, [])
  assert.deepEqual(state.menus, [{ id: 7, family_id: familyA }])
  assert.deepEqual(state.recipes, [{ id: recipeA, family_id: familyA, status: 'active' }])
})
