const test = require('node:test')
const assert = require('node:assert/strict')
const { HttpError } = require('../src/http')
const { validatePreferenceTagIds } = require('../src/services/tag-service')
const { scoreMenuPreferenceMatch, scoreRecipePreferenceMatch, validateSessionPreferences } = require('../src/services/recommendation/preference-matcher')
const { generateMenuCandidates } = require('../src/services/recommendation/menu-recommendation-engine')
const { loadRecipeDomainData } = require('../src/services/recommendation/recipe-candidate-loader')

function tagDatabase(rows) {
  return {
    async execute(sql, params) {
      assert.match(sql, /FROM tag_definitions/i)
      return [rows.filter((row) => params.includes(row.id) && (!/status\s*=\s*'active'/i.test(sql) || row.status === 'active'))]
    }
  }
}

function recipe(id, category, tagIds = []) {
  return {
    id, familyId: 1, status: 'active', title: `Recipe ${id}`, category,
    cookMinutes: 10, difficulty: 1, servings: 2, tagIds, tagDetails: tagIds.map((tagId) => ({ id: tagId, name: `标签${tagId}` })),
    ingredients: [{ ingredientId: id, amountGrams: 100, caloriesPer100g: 100, proteinPer100g: 10, fatPer100g: 2, carbohydratePer100g: 5, seasonalMonths: [] }]
  }
}

test('T3 preference validation canonicalizes duplicate IDs and rejects deleted/cross-family tags safely', async () => {
  const database = tagDatabase([
    { id: 1, familyId: null, kind: 'system', status: 'active' },
    { id: 101, familyId: 1, kind: 'custom', status: 'active' },
    { id: 102, familyId: 1, kind: 'custom', status: 'inactive' },
    { id: 201, familyId: 2, kind: 'custom', status: 'active' }
  ])
  assert.deepEqual(await validatePreferenceTagIds(database, 1, {}), { selectedTagIds: [] })
  assert.deepEqual(await validatePreferenceTagIds(database, 1, { selectedTagIds: [101, 1, 101] }), { selectedTagIds: [101, 1] })
  await assert.rejects(validatePreferenceTagIds(database, 1, { selectedTagIds: [201] }), (error) => error instanceof HttpError && error.status === 404)
  await assert.rejects(validatePreferenceTagIds(database, 1, { selectedTagIds: [102] }), (error) => error instanceof HttpError && error.status === 404)
  await assert.rejects(validatePreferenceTagIds(database, 1, { selectedTagIds: ['bad'] }), (error) => error instanceof HttpError && error.status === 400)
  await assert.rejects(validatePreferenceTagIds(database, 1, { selectedTagIds: [999] }), (error) => error instanceof HttpError && error.status === 404)
  await assert.rejects(validatePreferenceTagIds(database, 1, { tasteTags: ['spicy'] }), (error) => error instanceof HttpError && error.status === 400)
})

test('T3 canonical menu coverage uses tag identity, equal weights, and a 0-30 score', () => {
  const recipes = [recipe(1, '荤菜', [1]), recipe(2, '素菜', [101]), recipe(3, '汤', [999])]
  const result = scoreMenuPreferenceMatch(recipes, { selectedTagIds: [1, 101, 201] })
  assert.equal(result.score, 67)
  assert.equal(result.tagPreferenceScore, 20)
  assert.deepEqual(result.matchedTagIds, [1, 101])
  assert.deepEqual(result.matchedTagNames, ['标签1', '标签101'])
  assert.equal(scoreMenuPreferenceMatch([recipe(1, '荤菜')], { selectedTagIds: [1, 101] }).tagPreferenceScore, 0)
  assert.equal(scoreMenuPreferenceMatch([recipe(1, '荤菜', [1, 101])], { selectedTagIds: [101, 1, 1] }).tagPreferenceScore, 30)
  assert.equal(scoreRecipePreferenceMatch(recipe(1, '荤菜', [1]), { selectedTagIds: [1, 101] }).score, 50)
})

test('T3 canonical preferences do not require a match and preserve hard-feasible generation', () => {
  const result = generateMenuCandidates({
    familyId: 1, memberId: 101, activeMember: { id: 101, familyId: 1, status: 'active' },
    menuDate: '2026-08-08', mealType: 'dinner', peopleCount: 2, maxPrepMinutes: 60,
    structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 },
    preferences: { selectedTagIds: [999] },
    recipes: [recipe(1, '荤菜'), recipe(2, '素菜'), recipe(3, '汤')],
    restrictedIngredientIds: []
  })
  assert.equal(result.ok, true)
  assert.equal(result.candidates[0].scoreBreakdown.tagPreference.score, 0)
  assert.deepEqual(result.candidates[0].scoreBreakdown.tagPreference.selectedTagIds, [999])
})

test('T3 canonical validator rejects mixed legacy preference fields', () => {
  assert.throws(() => validateSessionPreferences({ selectedTagIds: [1], seasonal: false }), (error) => error.code === 'INVALID_SESSION_PREFERENCE')
})

test('T3 recipe loader batches active tag identity metadata for canonical scoring', async () => {
  const calls = []
  const database = {
    async execute(sql) {
      calls.push(sql)
      if (/FROM recipes r/i.test(sql)) return [[{ id: 1, familyId: 1, status: 'active', title: 'A', category: '荤菜', cookMinutes: 10, difficulty: 1, servings: 2 }]]
      if (/FROM recipe_ingredients/i.test(sql)) return [[{ recipeId: 1, ingredientId: 11, amountGrams: 100, ingredientName: '食材', caloriesPer100g: 100, proteinPer100g: 10, fatPer100g: 2, carbohydratePer100g: 3 }]]
      if (/FROM recipe_tags/i.test(sql)) return [[{ recipeId: 1, tagId: 101, tagCode: null, tagName: '家庭标签', tagKind: 'custom' }]]
      if (/FROM ingredient_seasons/i.test(sql)) return [[]]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const recipes = await loadRecipeDomainData(database, { familyId: 1 })
  assert.equal(calls.filter((sql) => /FROM recipe_tags/i.test(sql)).length, 1)
  assert.match(calls.find((sql) => /FROM recipe_tags/i.test(sql)), /td\.status = 'active'/i)
  assert.deepEqual(recipes[0].tagIds, [101])
  assert.deepEqual(recipes[0].tagDetails[0], { id: 101, code: null, name: '家庭标签', kind: 'custom' })
})
