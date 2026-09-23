const test = require('node:test')
const assert = require('node:assert/strict')

const {
  CATEGORY_BY_SLOT,
  HIGH_PROTEIN_THRESHOLD_GRAMS,
  MAX_RAW_MENU_CANDIDATES,
  MAX_RECOMMENDATION_CANDIDATES
} = require('../src/services/recommendation/constants')
const { RecommendationDomainError } = require('../src/services/recommendation/constants')
const { normalizeMealStructure, validateMealStructure } = require('../src/services/recommendation/menu-structure')
const { calculateRecipeNutrition, deriveHighProtein } = require('../src/services/recommendation/nutrition')
const { calculateSeasonalFit } = require('../src/services/recommendation/seasonal')
const {
  scoreRecipePreferenceMatch,
  scoreMenuPreferenceMatch,
  scoreFamilyCategoryPreference,
  validateSessionPreferences
} = require('../src/services/recommendation/preference-matcher')
const { estimateMenuPrepTime } = require('../src/services/recommendation/prep-time-estimator')
const { filterEligibleRecipes } = require('../src/services/recommendation/recipe-filter')
const { generateRawMenuCandidates } = require('../src/services/recommendation/menu-generator')
const { calculateRecentNoveltyScore } = require('../src/services/recommendation/recent-history')
const { selectDiverseCandidates, selectQualityWindow } = require('../src/services/recommendation/diversifier')
const { generateMenuCandidates, getAvailableTagIds } = require('../src/services/recommendation/menu-recommendation-engine')
const { loadRecipeDomainData } = require('../src/services/recommendation/recipe-candidate-loader')

function ingredient(id, protein = 10, seasonalMonths = [8]) {
  return {
    ingredientId: id,
    amountGrams: 100,
    caloriesPer100g: 100,
    proteinPer100g: protein,
    fatPer100g: 2,
    carbohydratePer100g: 5,
    seasonalMonths
  }
}

function recipe(id, category, overrides = {}) {
  return {
    id,
    familyId: 1,
    status: 'active',
    title: `Recipe ${id}`,
    category,
    cookMinutes: 10,
    difficulty: 1,
    servings: 2,
    ingredients: [ingredient(id)],
    tags: {
      taste: ['light'],
      dietary: [],
      method: ['stir_fry']
    },
    ...overrides
  }
}

function completePool({ familyId = 1, perCategory = 4 } = {}) {
  const categories = [
    ['荤菜', 'meat'],
    ['素菜', 'vegetable'],
    ['汤', 'soup'],
    ['主食', 'staple']
  ]
  let id = 1
  return categories.flatMap(([category]) => Array.from({ length: perCategory }, () => recipe(id++, category, { familyId })))
}

function explorationInput(overrides = {}) {
  return {
    familyId: 1,
    memberId: 101,
    activeMember: { id: 101, familyId: 1, status: 'active' },
    menuDate: '2026-08-08',
    mealType: 'dinner',
    peopleCount: 2,
    maxPrepMinutes: 60,
    structure: { meat: 1, vegetable: 2, soup: 1, staple: 0 },
    preferences: { tasteTags: [], dietaryTags: [], seasonal: false },
    recipes: completePool({ perCategory: 8 }),
    restrictedIngredientIds: [],
    recentUsage: {},
    ...overrides
  }
}

function candidateSignature(result) {
  return result.candidates.map((candidate) => candidate.recipeIds.join(',')).join('|')
}

test('meal structure requires exactly the four canonical non-negative integer slots', () => {
  assert.deepEqual(normalizeMealStructure({ meat: 1, vegetable: 1, soup: 1, staple: 0 }), { meat: 1, vegetable: 1, soup: 1, staple: 0 })
  assert.throws(() => validateMealStructure({ meat: 1, vegetable: 1, soup: 1 }), (error) => error.code === 'INVALID_MEAL_STRUCTURE')
  assert.throws(() => validateMealStructure({ meat: 1, vegetable: 1, soup: 1, staple: 0, snack: 1 }), (error) => error.code === 'INVALID_MEAL_STRUCTURE')
  assert.throws(() => validateMealStructure({ meat: 0, vegetable: 0, soup: 0, staple: 0 }), (error) => error.code === 'INVALID_MEAL_STRUCTURE')
  assert.throws(() => validateMealStructure({ meat: 1.5, vegetable: 1, soup: 1, staple: 0 }), (error) => error.code === 'INVALID_MEAL_STRUCTURE')
})

test('nutrition is derived from ingredient grams and exposes the seed-based high-protein rule', () => {
  const result = calculateRecipeNutrition({ ingredients: [
    { ...ingredient(1, 20), amountGrams: 200 },
    { ...ingredient(2, 10), amountGrams: 50 }
  ] })
  assert.deepEqual(result, {
    calories: 250,
    proteinGrams: 45,
    fatGrams: 5,
    carbohydrateGrams: 12.5,
    highProtein: false
  })
  assert.equal(HIGH_PROTEIN_THRESHOLD_GRAMS, 61.32)
  assert.equal(deriveHighProtein(61.32), true)
  assert.equal(deriveHighProtein(61.31), false)
})

test('seasonal fit is neutral when metadata is unavailable and ratio-based when present', () => {
  assert.deepEqual(calculateSeasonalFit({ ingredients: [ingredient(1, 10, [])] }, 8), {
    score: 50,
    matchedCount: 0,
    metadataCount: 0,
    neutral: true
  })
  assert.deepEqual(calculateSeasonalFit({ ingredients: [ingredient(1, 10, [8]), ingredient(2, 10, [1])] }, 8), {
    score: 50,
    matchedCount: 1,
    metadataCount: 2,
    neutral: false
  })
})

test('session preference matching uses stored tags and saturates menu-level matches', () => {
  const spicy = recipe(1, '荤菜', { tags: { taste: ['spicy'], dietary: [], method: ['stir_fry'] } })
  const plain = recipe(2, '荤菜')
  const one = scoreRecipePreferenceMatch(spicy, { tasteTags: ['spicy'], dietaryTags: [] })
  assert.deepEqual(one.matched, { tasteTags: ['spicy'], dietaryTags: [] })
  assert.deepEqual(one.unmatched, { tasteTags: [], dietaryTags: [] })
  assert.equal(one.score, 100)
  const oneMatch = scoreMenuPreferenceMatch([spicy, plain, plain, plain], { tasteTags: ['spicy'], dietaryTags: [] })
  const twoMatch = scoreMenuPreferenceMatch([spicy, spicy, plain, plain], { tasteTags: ['spicy'], dietaryTags: [] })
  assert.ok(oneMatch.score > 0)
  assert.ok(twoMatch.score > oneMatch.score)
  assert.ok(twoMatch.score < 100)
  assert.equal(scoreMenuPreferenceMatch([plain], { tasteTags: [], dietaryTags: [] }).score, 50)
  assert.equal(scoreFamilyCategoryPreference([recipe(3, '荤菜')], { 荤菜: 5 }).score, 100)
  assert.equal(scoreRecipePreferenceMatch(recipe(4, '荤菜', { ingredients: [ingredient(4, 70)] }), { dietaryTags: ['high_protein'] }).score, 100)
  assert.throws(() => validateSessionPreferences({ seasonal: 'false' }), (error) => error.code === 'INVALID_SESSION_PREFERENCE')
  assert.throws(() => validateSessionPreferences({ tasteTags: ['unknown'] }), (error) => error.code === 'INVALID_SESSION_PREFERENCE')
  assert.throws(() => validateSessionPreferences({ cuisineTags: ['home'] }), (error) => error.code === 'INVALID_SESSION_PREFERENCE')
})

test('canonical selected tags are hard requirements for every generated menu', () => {
  const input = explorationInput({
    preferences: { selectedTagIds: [101, 102] },
    recipes: [
      recipe(1, '荤菜', { tagIds: [101] }),
      recipe(2, '荤菜', { tagIds: [102] }),
      recipe(3, '素菜', { tagIds: [101, 102] }),
      recipe(4, '汤', { tagIds: [] })
    ],
    structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 }
  })
  const result = generateMenuCandidates(input)
  assert.ok(result.candidates.length > 0)
  assert.ok(result.candidates.every((candidate) => candidate.recipeIds.includes(3)))
  assert.ok(result.candidates.every((candidate) => candidate.scoreBreakdown.tagPreference.matchedTagIds.sort((a, b) => a - b).join(',') === '101,102'))
})

test('canonical tag availability only includes tags that can complete the current structure', () => {
  const input = explorationInput({
    recipes: [
      recipe(1, '荤菜', { tagIds: [101] }),
      recipe(2, '素菜', { tagIds: [102] }),
      recipe(3, '汤', { tagIds: [] })
    ],
    structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 },
    preferences: { selectedTagIds: [] }
  })
  assert.deepEqual(getAvailableTagIds(input, [101, 102, 103]), [101, 102])
  assert.deepEqual(getAvailableTagIds({ ...input, preferences: { selectedTagIds: [101] } }, [101, 102, 103]), [101, 102])
})

test('prep time uses longest path plus half of remaining cook time', () => {
  assert.deepEqual(estimateMenuPrepTime([{ cookMinutes: 30 }, { cookMinutes: 20 }, { cookMinutes: 10 }]), {
    sumCookMinutes: 60,
    longestCookMinutes: 30,
    estimatedPrepMinutes: 45
  })
})

test('eligible recipe filter enforces active status, family boundary, restrictions, and category pools', () => {
  const recipes = [
    recipe(1, '荤菜'),
    recipe(2, '素菜', { ingredients: [ingredient(99)] }),
    recipe(3, '汤', { familyId: 2 }),
    recipe(4, '主食', { status: 'deleted' })
  ]
  const filtered = filterEligibleRecipes(recipes, { familyId: 1, restrictedIngredientIds: [99] })
  assert.deepEqual(filtered.counts, { meat: 1, vegetable: 0, soup: 0, staple: 0 })
  assert.deepEqual(filtered.pools.meat.map((item) => item.id), [1])
  assert.equal(filtered.excluded.restricted, 1)
  assert.equal(filtered.excluded.family, 1)
  assert.equal(filtered.excluded.inactive, 1)
})

test('raw candidate generation is exact, duplicate-free, deterministic, and bounded', () => {
  const result = generateRawMenuCandidates({
    pools: {
      meat: completePool({ perCategory: 20 }).filter((item) => item.category === '荤菜'),
      vegetable: completePool({ perCategory: 20 }).filter((item) => item.category === '素菜'),
      soup: completePool({ perCategory: 20 }).filter((item) => item.category === '汤'),
      staple: []
    },
    structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 }
  })
  assert.ok(result.candidates.length <= MAX_RAW_MENU_CANDIDATES)
  assert.equal(result.truncated, true)
  for (const candidate of result.candidates) {
    assert.equal(new Set(candidate.map((item) => item.id)).size, candidate.length)
  }
  assert.deepEqual(result.candidates[0].map((item) => item.id), [1, 21, 41])
})

test('recent usage applies soft novelty penalties without filtering recipes', () => {
  assert.equal(calculateRecentNoveltyScore([recipe(1)], { 1: 2 }), 80)
  assert.equal(calculateRecentNoveltyScore([recipe(1)], { 1: 5 }), 92)
  assert.equal(calculateRecentNoveltyScore([recipe(1)], { 1: 8 }), 100)
  assert.equal(calculateRecentNoveltyScore([recipe(1)], {}), 100)
})

test('diversifier prefers overlap at most one and reports deterministic relaxation', () => {
  const make = (ids, score) => ({ recipeIds: ids, totalScore: score, withinTimeLimit: true, timeOverageMinutes: 0 })
  const selected = selectDiverseCandidates([
    make([1, 2, 3], 99),
    make([1, 4, 5], 98),
    make([6, 7, 8], 90),
    make([9, 10, 11], 89)
  ], { maxCandidates: 3 })
  assert.equal(selected.candidates.length, 3)
  assert.equal(selected.candidates[0].totalScore, 99)
  assert.ok(selected.candidates[1].recipeIds.filter((id) => selected.candidates[0].recipeIds.includes(id)).length <= 1)
  assert.equal(selected.relaxationLevel, 0)
})

test('diversifier prefers completely disjoint recommendation groups before relaxing', () => {
  const make = (ids, score) => ({ recipeIds: ids, totalScore: score, withinTimeLimit: true, timeOverageMinutes: 0 })
  const selected = selectDiverseCandidates([
    make([1, 2, 3], 99),
    make([1, 4, 5], 98),
    make([6, 7, 8], 90),
    make([9, 10, 11], 89)
  ], { maxCandidates: 3, maxOverlap: 0 })
  assert.deepEqual(selected.candidates.map((candidate) => candidate.recipeIds), [[1, 2, 3], [6, 7, 8], [9, 10, 11]])
})

test('engine returns exact structure, preferred-time candidates first, diagnostics, and bounded output', () => {
  const recipes = completePool({ perCategory: 5 }).map((item, index) => ({
    ...item,
    cookMinutes: index % 5 === 0 ? 70 : 10,
    ingredients: [ingredient(item.id, index % 5 === 0 ? 20 : 8, [8])]
  }))
  const result = generateMenuCandidates({
    familyId: 1,
    memberId: 101,
    activeMember: { id: 101, familyId: 1, status: 'active' },
    menuDate: '2026-08-08',
    mealType: 'dinner',
    peopleCount: 2,
    maxPrepMinutes: 45,
    structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 },
    preferences: { tasteTags: ['light'], dietaryTags: [], seasonal: true },
    recipes,
    restrictedIngredientIds: [],
    familyCategoryPreferenceScores: { 荤菜: 5, 素菜: 3, 汤: 3 },
    recentUsage: {}
  })
  assert.equal(result.candidates.length, MAX_RECOMMENDATION_CANDIDATES)
  assert.ok(result.rawCandidateCount <= MAX_RAW_MENU_CANDIDATES)
  assert.ok(result.candidates.every((candidate) => candidate.items.length === 3))
  assert.ok(result.candidates.every((candidate) => candidate.scoreBreakdown && candidate.reasonParts))
  assert.ok(result.candidates.every((candidate) => candidate.items.filter((item) => item.category === '荤菜').length === 1))
  for (const candidate of result.candidates) {
    for (const item of candidate.items) {
      const sourceRecipe = recipes.find((recipe) => recipe.id === item.recipeId)
      assert.equal(item.cookMinutes, sourceRecipe.cookMinutes)
      assert.equal(item.difficulty, sourceRecipe.difficulty)
    }
  }
  const firstOvertime = result.candidates.findIndex((candidate) => !candidate.withinTimeLimit)
  if (firstOvertime >= 0) assert.ok(result.candidates.slice(firstOvertime).every((candidate) => !candidate.withinTimeLimit))
})

test('engine falls back to overtime candidates instead of failing on preferred-time miss', () => {
  const recipes = [recipe(1, '荤菜', { cookMinutes: 40 }), recipe(2, '素菜', { cookMinutes: 30 }), recipe(3, '汤', { cookMinutes: 30 })]
  const result = generateMenuCandidates({
    familyId: 1,
    memberId: 101,
    activeMember: { id: 101, familyId: 1, status: 'active' },
    menuDate: '2026-08-08',
    mealType: 'dinner',
    peopleCount: 2,
    maxPrepMinutes: 10,
    structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 },
    preferences: {},
    recipes,
    restrictedIngredientIds: []
  })
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].withinTimeLimit, false)
  assert.equal(result.candidates[0].timeOverageMinutes, 60)
  assert.match(result.candidates[0].timeWarning, /比你设定的 10 分钟多约 60 分钟/)
})

test('engine raises structured hard infeasibility errors', () => {
  assert.throws(() => generateMenuCandidates({
    familyId: 1,
    memberId: 101,
    activeMember: { id: 101, familyId: 1, status: 'active' },
    menuDate: '2026-08-08',
    mealType: 'dinner',
    peopleCount: 2,
    maxPrepMinutes: 45,
    structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 },
    preferences: {},
    recipes: [recipe(1, '荤菜')],
    restrictedIngredientIds: []
  }), (error) => error instanceof RecommendationDomainError && error.code === 'INSUFFICIENT_CATEGORY_CAPACITY' && error.details.category === CATEGORY_BY_SLOT.vegetable)
})

test('engine keeps restriction filtering ahead of preference scoring and protects active member context', () => {
  const restrictedHighPreference = recipe(1, '荤菜', { ingredients: [ingredient(77, 90)] })
  const eligibleMeat = recipe(2, '荤菜', { ingredients: [ingredient(2, 10)] })
  const input = {
    familyId: 1,
    memberId: 101,
    activeMember: { id: 101, familyId: 1, status: 'active' },
    menuDate: '2026-08-08',
    mealType: 'dinner',
    peopleCount: 2,
    maxPrepMinutes: 45,
    structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 },
    preferences: { dietaryTags: ['high_protein'] },
    familyCategoryPreferenceScores: { 荤菜: 5 },
    recipes: [restrictedHighPreference, eligibleMeat, recipe(3, '素菜'), recipe(4, '汤')],
    restrictedIngredientIds: [77]
  }
  const result = generateMenuCandidates(input)
  assert.equal(result.candidates[0].recipeIds.includes(1), false)
  assert.equal(result.candidates[0].recipeIds.includes(2), true)
  assert.throws(() => generateMenuCandidates({ ...input, activeMember: { id: 101, familyId: 1, status: 'left' } }), (error) => error.code === 'INACTIVE_MEMBER_CONTEXT')
  assert.throws(() => generateMenuCandidates({ ...input, activeMember: { id: 101, familyId: 2, status: 'active' } }), (error) => error.code === 'FAMILY_CONTEXT_MISMATCH')
})

test('engine excludes only the current member low-rated recipes before ranking', () => {
  const result = generateMenuCandidates({
    familyId: 1,
    memberId: 101,
    activeMember: { id: 101, familyId: 1, status: 'active' },
    menuDate: '2026-08-08',
    mealType: 'dinner',
    peopleCount: 2,
    maxPrepMinutes: 60,
    structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 },
    preferences: {},
    recipes: [recipe(1, '荤菜'), recipe(2, '荤菜'), recipe(3, '素菜'), recipe(4, '汤')],
    restrictedIngredientIds: [],
    lowRatedRecipeIds: [1]
  })
  assert.ok(result.candidates.length > 0)
  assert.equal(result.candidates.every((candidate) => !candidate.recipeIds.includes(1)), true)
  assert.equal(result.excludedCounts.lowRated, 1)
})

test('recipe candidate loader uses bulk queries and groups recipe metadata without N+1 access', async () => {
  const calls = []
  const database = {
    async execute(sql, params) {
      calls.push({ sql, params })
      if (/FROM recipes r/i.test(sql)) return [[{ id: 1, familyId: 1, status: 'active', title: 'A', category: '荤菜', cookMinutes: 10, difficulty: 1, servings: 2 }]]
      if (/FROM recipe_ingredients/i.test(sql)) return [[{ recipeId: 1, ingredientId: 11, amountGrams: 100, ingredientName: '鸡肉', caloriesPer100g: 100, proteinPer100g: 20, fatPer100g: 2, carbohydratePer100g: 0 }]]
      if (/FROM recipe_tags/i.test(sql)) return [[{ recipeId: 1, tagType: 'taste', tagValue: 'light' }]]
      if (/FROM ingredient_seasons/i.test(sql)) return [[{ ingredientId: 11, month: 8 }]]
      throw new Error(`Unexpected SQL: ${sql}`)
    }
  }
  const recipes = await loadRecipeDomainData(database, { familyId: 1 })
  assert.equal(calls.length, 4)
  assert.deepEqual(recipes[0].ingredients[0].seasonalMonths, [8])
  assert.deepEqual(recipes[0].tags, { taste: ['light'], dietary: [], method: [] })
})

test('synthetic seed-sized generation stays bounded and completes quickly', () => {
  const recipes = completePool({ perCategory: 12 })
  const start = Date.now()
  const result = generateMenuCandidates({
    familyId: 1,
    memberId: 101,
    activeMember: { id: 101, familyId: 1, status: 'active' },
    menuDate: '2026-08-08',
    mealType: 'dinner',
    peopleCount: 4,
    maxPrepMinutes: 90,
    structure: { meat: 2, vegetable: 2, soup: 1, staple: 0 },
    preferences: {},
    recipes,
    restrictedIngredientIds: []
  })
  assert.ok(Date.now() - start < 1000)
  assert.ok(result.rawCandidateCount <= MAX_RAW_MENU_CANDIDATES)
  assert.ok(result.candidates.length <= MAX_RECOMMENDATION_CANDIDATES)
})

test('the same exploration seed reproduces the complete candidate result', () => {
  const results = Array.from({ length: 5 }, () => generateMenuCandidates(explorationInput({ explorationSeed: 'seed-a' })))
  const baseline = results[0]
  for (const result of results.slice(1)) {
    assert.deepEqual(result.candidates, baseline.candidates)
    assert.equal(result.rawCandidateCount, baseline.rawCandidateCount)
    assert.equal(result.diversityRelaxationLevel, baseline.diversityRelaxationLevel)
  }
})

test('different exploration seeds vary only bounded high-quality candidate sets', () => {
  const results = ['seed-a', 'seed-b', 'seed-c', 'seed-d', 'seed-e']
    .map((explorationSeed) => generateMenuCandidates(explorationInput({ explorationSeed })))
  assert.ok(new Set(results.map(candidateSignature)).size > 1)
  for (const result of results) {
    assert.ok(result.rawCandidateCount <= MAX_RAW_MENU_CANDIDATES)
    assert.ok(result.candidates.length <= MAX_RECOMMENDATION_CANDIDATES)
    assert.ok(result.candidates.every((candidate) => candidate.withinTimeLimit))
    assert.ok(result.candidates.every((candidate) => candidate.items.length === 4))
    assert.ok(result.candidates.every((candidate) => candidate.items.filter((item) => item.category === '荤菜').length === 1))
    assert.ok(result.candidates.every((candidate) => candidate.items.filter((item) => item.category === '素菜').length === 2))
    assert.ok(result.candidates.every((candidate) => candidate.items.filter((item) => item.category === '汤').length === 1))
  }
})

test('quality window excludes clearly lower-scoring candidates before exploration', () => {
  const high = { recipeIds: [1, 2, 3, 4], totalScore: 90, withinTimeLimit: true, timeOverageMinutes: 0 }
  const near = { recipeIds: [5, 6, 7, 8], totalScore: 88, withinTimeLimit: true, timeOverageMinutes: 0 }
  const low = { recipeIds: [9, 10, 11, 12], totalScore: 60, withinTimeLimit: true, timeOverageMinutes: 0 }
  const window = selectQualityWindow([low, near, high], { scoreDelta: 2, topK: 20 })
  assert.deepEqual(window.map((candidate) => candidate.recipeIds), [[1, 2, 3, 4], [5, 6, 7, 8]])
})

test('exploration never lets Tier2 replace an available Tier1 candidate', () => {
  const highCookIds = new Set([7, 8, 15, 16, 23, 24])
  const recipes = completePool({ perCategory: 8 }).map((item) => ({
    ...item,
    cookMinutes: highCookIds.has(item.id) ? 200 : 10
  }))
  for (const explorationSeed of ['seed-a', 'seed-b', 'seed-c', 'seed-d']) {
    const result = generateMenuCandidates(explorationInput({ recipes, explorationSeed }))
    assert.ok(result.candidates.length >= 3)
    assert.ok(result.candidates.every((candidate) => candidate.withinTimeLimit))
  }
})

test('exploration keeps the existing Tier2 fallback when Tier1 has fewer than three candidates', () => {
  const recipes = [
    recipe(1, '荤菜', { cookMinutes: 10 }),
    recipe(2, '荤菜', { cookMinutes: 10 }),
    recipe(3, '素菜', { cookMinutes: 10 }),
    recipe(4, '素菜', { cookMinutes: 200 }),
    recipe(5, '汤', { cookMinutes: 10 })
  ]
  const result = generateMenuCandidates(explorationInput({
    recipes,
    maxPrepMinutes: 60,
    structure: { meat: 1, vegetable: 1, soup: 1, staple: 0 },
    explorationSeed: 'tier-fallback-seed'
  }))
  assert.equal(result.candidates.length, 3)
  assert.equal(result.candidates.filter((candidate) => candidate.withinTimeLimit).length, 2)
  assert.equal(result.candidates.filter((candidate) => !candidate.withinTimeLimit).length, 1)
})

test('exploration preserves session preference evidence for spicy requests', () => {
  const recipes = completePool({ perCategory: 8 }).filter((item) => item.category !== '荤菜' || item.id <= 2).map((item) => item.id === 1 ? {
    ...item,
    tags: { ...item.tags, taste: ['spicy'] }
  } : item)
  const preferences = { tasteTags: ['spicy'], dietaryTags: [], seasonal: false }
  for (const explorationSeed of ['seed-a', 'seed-b', 'seed-c']) {
    const result = generateMenuCandidates(explorationInput({ recipes, preferences, explorationSeed }))
    const preferred = result.candidates.filter((candidate) => candidate.recipeIds.includes(1))
    assert.ok(preferred.length > 0)
    assert.equal(Math.max(...result.candidates.map((candidate) => candidate.totalScore)), Math.max(...preferred.map((candidate) => candidate.totalScore)))
  }
})
