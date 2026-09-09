const test = require('node:test')
const assert = require('node:assert/strict')
const { applyRecommendationRun } = require('../src/services/recommendation-run-service')

test('applyRecommendationRun inserts only missing recommendation dishes', async () => {
  const calls = []
  const connection = {
    async execute(sql) {
      calls.push(sql)
      if (sql.includes('FROM family_members')) return [[{ id: 2 }]]
      if (sql.includes('FROM recommendation_runs')) return [[{ menuDate: '2026-09-08', mealType: 'dinner', creatorId: 2, creatorFamilyId: 1, creatorStatus: 'active' }]]
      if (sql.includes('FROM recommendation_items')) return [[{ recipeId: 3, familyRecipeId: 3, recipeFamilyId: 1, recipeStatus: 'active' }, { recipeId: 4, familyRecipeId: 4, recipeFamilyId: 1, recipeStatus: 'active' }]]
      if (sql.includes('INSERT INTO menus')) return [{ insertId: 8 }]
      if (sql.includes('SELECT id') && sql.includes('FROM menu_items') && calls.filter((entry) => entry.includes('SELECT id') && entry.includes('FROM menu_items')).length === 1) return [[{ id: 11, note: '已有备注' }]]
      if (sql.includes('SELECT id') && sql.includes('FROM menu_items')) return [[]]
      if (sql.includes('INSERT INTO menu_items')) return [{ insertId: 12 }]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const result = await applyRecommendationRun({ connection, familyId: 1, memberId: 2, runId: 9 })
  assert.deepEqual(result, { menuId: 8, addedCount: 1, alreadyPresentCount: 1 })
  assert.equal(calls.filter((sql) => sql.includes('INSERT INTO menu_items')).length, 1)
})
