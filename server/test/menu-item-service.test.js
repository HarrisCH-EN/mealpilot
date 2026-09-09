const test = require('node:test')
const assert = require('node:assert/strict')
const { addMenuItem } = require('../src/services/menu-item-service')

test('addMenuItem reports an existing menu item without changing its note', async () => {
  const calls = []
  const connection = {
    async execute(sql) {
      calls.push(sql)
      if (sql.includes('FROM family_members')) return [[{ id: 2 }]]
      if (sql.includes('FROM recipes')) return [[{ id: 3 }]]
      if (sql.includes('INSERT INTO menus')) return [{ insertId: 7 }]
      if (sql.includes('SELECT id, note')) return [[{ id: 9, note: '少盐' }]]
      throw new Error('should not insert or update an existing menu item')
    }
  }
  const result = await addMenuItem({ connection, familyId: 1, memberId: 2, menuDate: '2026-09-08', mealType: 'lunch', recipeId: 3, note: '多放辣' })
  assert.deepEqual(result, { menuId: 7, itemId: 9, status: 'already-present', note: '少盐' })
  assert.equal(calls.some((sql) => sql.includes('UPDATE menu_items')), false)
})

test('addMenuItem creates a missing menu item with its supplied note', async () => {
  const connection = {
    async execute(sql) {
      if (sql.includes('FROM family_members')) return [[{ id: 2 }]]
      if (sql.includes('FROM recipes')) return [[{ id: 3 }]]
      if (sql.includes('INSERT INTO menus')) return [{ insertId: 7 }]
      if (sql.includes('SELECT id, note')) return [[]]
      if (sql.includes('INSERT INTO menu_items')) return [{ insertId: 10 }]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const result = await addMenuItem({ connection, familyId: 1, memberId: 2, menuDate: '2026-09-08', mealType: 'lunch', recipeId: 3, note: '少盐' })
  assert.deepEqual(result, { menuId: 7, itemId: 10, status: 'created', note: '少盐' })
})

test('addMenuItem rejects a deleted Recipe before creating a Menu', async () => {
  const calls = []
  const connection = {
    async execute(sql) {
      calls.push(sql)
      if (sql.includes('FROM family_members')) return [[{ id: 2 }]]
      if (sql.includes('FROM recipes')) return [[]]
      throw new Error('should not create a menu for a deleted recipe')
    }
  }

  await assert.rejects(
    addMenuItem({ connection, familyId: 1, memberId: 2, menuDate: '2026-09-08', mealType: 'lunch', recipeId: 3 }),
    (error) => error.status === 404
  )
  assert.equal(calls.some((sql) => sql.includes('INSERT INTO menus')), false)
})

test('addMenuItem converts a MenuItem unique conflict into already-present and preserves the stored note', async () => {
  let insertAttempts = 0
  let duplicateObserved = false
  const connection = {
    async execute(sql) {
      if (sql.includes('FROM family_members')) return [[{ id: 2 }]]
      if (sql.includes('FROM recipes')) return [[{ id: 3 }]]
      if (sql.includes('INSERT INTO menus')) return [{ insertId: 7 }]
      if (sql.includes('SELECT id, note')) return [duplicateObserved ? [{ id: 9, note: '原备注' }] : []]
      if (sql.includes('INSERT INTO menu_items')) {
        insertAttempts++
        duplicateObserved = true
        const error = new Error('Duplicate entry')
        error.code = 'ER_DUP_ENTRY'
        error.errno = 1062
        throw error
      }
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }

  const result = await addMenuItem({ connection, familyId: 1, memberId: 2, menuDate: '2026-09-08', mealType: 'lunch', recipeId: 3, note: '新备注' })
  assert.deepEqual(result, { menuId: 7, itemId: 9, status: 'already-present', note: '原备注' })
  assert.equal(insertAttempts, 1)
})
