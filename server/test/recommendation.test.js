const test = require('node:test')
const assert = require('node:assert/strict')

const { buildRecommendation } = require('../src/services/recommendation-service')

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
})
