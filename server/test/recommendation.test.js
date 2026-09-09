const test = require('node:test')
const assert = require('node:assert/strict')

const { buildRecommendation, aggregateFamilyPreferences } = require('../src/services/recommendation-service')

const dishes = [
  { id: 1, title: '番茄炒蛋', category: '荤菜', cookMinutes: 12, difficulty: 1, seasonalMonths: [7, 8, 9], nutrition: { protein: 22, vegetables: 1 } },
  { id: 2, title: '清炒时蔬', category: '素菜', cookMinutes: 8, difficulty: 1, seasonalMonths: [7, 8, 9], nutrition: { protein: 4, vegetables: 3 } },
  { id: 3, title: '冬瓜汤', category: '汤', cookMinutes: 20, difficulty: 1, seasonalMonths: [7, 8, 9], nutrition: { protein: 6, vegetables: 2 } },
  { id: 4, title: '红烧肉', category: '荤菜', cookMinutes: 55, difficulty: 4, seasonalMonths: [1, 2, 3], nutrition: { protein: 32, vegetables: 0 }, restrictedIngredientIds: [99] }
]

test('buildRecommendation excludes restricted dishes and respects maximum total minutes', () => {
  const result = buildRecommendation({
    dishes,
    restrictedIngredientIds: [99],
    month: 8,
    peopleCount: 2,
    maxCookMinutes: 45,
    mode: 'balanced'
  })

  assert.equal(result.items.some((item) => item.id === 4), false)
  assert.ok(result.totalCookMinutes <= 45)
  assert.deepEqual(result.items.map((item) => item.category).sort(), ['汤', '素菜', '荤菜'].sort())
  assert.equal(result.withinTimeLimit, true)
  assert.equal(result.timeOverageMinutes, 0)
})

test('buildRecommendation prefers a complete menu within the requested time when one exists', () => {
  const result = buildRecommendation({
    dishes: [
      { id: 11, title: '高分慢荤菜', category: '荤菜', cookMinutes: 40, difficulty: 1, seasonalMonths: [8], nutrition: { protein: 30, vegetables: 1 } },
      { id: 12, title: '快手荤菜', category: '荤菜', cookMinutes: 10, difficulty: 1, seasonalMonths: [8], nutrition: { protein: 10, vegetables: 1 } },
      { id: 13, title: '高分慢素菜', category: '素菜', cookMinutes: 30, difficulty: 1, seasonalMonths: [8], nutrition: { protein: 10, vegetables: 3 } },
      { id: 14, title: '快手素菜', category: '素菜', cookMinutes: 10, difficulty: 1, seasonalMonths: [8], nutrition: { protein: 4, vegetables: 2 } },
      { id: 15, title: '高分慢汤', category: '汤', cookMinutes: 30, difficulty: 1, seasonalMonths: [8], nutrition: { protein: 10, vegetables: 2 } },
      { id: 16, title: '快手汤', category: '汤', cookMinutes: 10, difficulty: 1, seasonalMonths: [8], nutrition: { protein: 4, vegetables: 1 } }
    ],
    month: 8,
    peopleCount: 2,
    maxCookMinutes: 45,
    mode: 'balanced'
  })

  assert.equal(result.ok, true)
  assert.equal(result.withinTimeLimit, true)
  assert.equal(result.totalCookMinutes, 30)
  assert.deepEqual(result.items.map((item) => item.id).sort((left, right) => left - right), [12, 14, 16])
})

test('buildRecommendation keeps the best available menu and reports the time overage when no menu fits', () => {
  const result = buildRecommendation({
    dishes: [
      { id: 21, title: '荤菜', category: '荤菜', cookMinutes: 20, difficulty: 1, seasonalMonths: [8], nutrition: { protein: 10, vegetables: 1 } },
      { id: 22, title: '素菜', category: '素菜', cookMinutes: 15, difficulty: 1, seasonalMonths: [8], nutrition: { protein: 4, vegetables: 3 } },
      { id: 23, title: '汤', category: '汤', cookMinutes: 25, difficulty: 1, seasonalMonths: [8], nutrition: { protein: 6, vegetables: 2 } }
    ],
    month: 8,
    peopleCount: 2,
    maxCookMinutes: 30,
    mode: 'balanced'
  })

  assert.equal(result.ok, true)
  assert.equal(result.withinTimeLimit, false)
  assert.equal(result.totalCookMinutes, 60)
  assert.equal(result.timeOverageMinutes, 30)
  assert.match(result.timeWarning, /需要 60 分钟才能完成/)
  assert.equal(result.items.length, 3)
})

test('family preference aggregation treats unset active members as neutral and ignores absent members', () => {
  assert.deepEqual(aggregateFamilyPreferences([
    { memberId: 1, category: '荤菜', preferenceScore: 5 },
    { memberId: 2, category: '荤菜', preferenceScore: 1 },
    { memberId: 3, category: null, preferenceScore: null }
  ]), { 荤菜: 3, 素菜: 3, 汤: 3, 主食: 3 })
  assert.equal(aggregateFamilyPreferences([
    { memberId: 1, category: '荤菜', preferenceScore: 5 },
    { memberId: 2, category: '荤菜', preferenceScore: 1 },
    { memberId: 3, category: '荤菜', preferenceScore: 5 }
  ]).荤菜, 11 / 3)
})

test('family category preference changes score and ordering without replacing hard restrictions', () => {
  const comparableDishes = [
    { id: 11, title: '偏好荤菜', category: '荤菜', cookMinutes: 20, difficulty: 1, seasonalMonths: [8], nutrition: { protein: 10, vegetables: 1 }, ingredientIds: [11] },
    { id: 12, title: '偏好素菜', category: '素菜', cookMinutes: 20, difficulty: 1, seasonalMonths: [8], nutrition: { protein: 10, vegetables: 1 }, ingredientIds: [12] },
    { id: 13, title: '中性汤', category: '汤', cookMinutes: 20, difficulty: 1, seasonalMonths: [8], nutrition: { protein: 10, vegetables: 1 }, ingredientIds: [13] }
  ]
  const meatFirst = buildRecommendation({ dishes: comparableDishes, familyPreferenceScores: { 荤菜: 5, 素菜: 1, 汤: 3 }, month: 8, peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' })
  const vegetableFirst = buildRecommendation({ dishes: comparableDishes, familyPreferenceScores: { 荤菜: 1, 素菜: 5, 汤: 3 }, month: 8, peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' })
  assert.equal(meatFirst.items[0].id, 11)
  assert.equal(vegetableFirst.items[0].id, 12)
  assert.ok(meatFirst.items.find((item) => item.id === 11).score.total > meatFirst.items.find((item) => item.id === 12).score.total)
  assert.match(meatFirst.items.find((item) => item.id === 11).score.reason, /更偏好荤菜/)

  const restricted = buildRecommendation({ dishes: comparableDishes, familyPreferenceScores: { 荤菜: 5, 素菜: 1, 汤: 3 }, restrictedIngredientIds: [11], month: 8, peopleCount: 2, maxCookMinutes: 90, mode: 'balanced' })
  assert.equal(restricted.items.some((item) => item.id === 11), false)
})
