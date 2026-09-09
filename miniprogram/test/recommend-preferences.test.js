const test = require('node:test')
const assert = require('node:assert/strict')
const {
  DEFAULT_STRUCTURE,
  PREP_TIME_OPTIONS,
  STRUCTURE_LABELS,
  buildCanonicalRequest,
  normalizeSelectedTagIds,
  normalizePeopleCount,
  normalizeStructure,
  structureDishCount,
  structureSummary,
  toggleTagId,
  validateStructure
} = require('../pages/recommend/preference-state')

test('R4 exposes the full legal preparation-time ruler range', () => {
  const values = PREP_TIME_OPTIONS.map((item) => item.value)
  assert.equal(values[0], 10)
  assert.equal(values.at(-1), 480)
  assert.equal(values.length, 471)
  assert.deepEqual(values.slice(0, 5), [10, 11, 12, 13, 14])
  assert.deepEqual(values.slice(-5), [476, 477, 478, 479, 480])
})

test('R4 keeps people count independent from menu structure', () => {
  assert.equal(normalizePeopleCount(0), 1)
  assert.equal(normalizePeopleCount(20), 12)
  assert.equal(structureDishCount(DEFAULT_STRUCTURE), 4)
  assert.equal(structureSummary(DEFAULT_STRUCTURE), '1荤菜 · 2素菜 · 1汤')
  assert.deepEqual(normalizeStructure({ meat: 2, vegetable: 0, soup: 1, staple: 1 }), { meat: 2, vegetable: 0, soup: 1, staple: 1 })
})

test('R4 validates a non-empty structure within the menu limit', () => {
  assert.deepEqual(validateStructure({ meat: 0, vegetable: 0, soup: 0, staple: 0 }), { valid: false, total: 0, message: '至少选择一道菜' })
  assert.equal(validateStructure({ meat: 12, vegetable: 1 }).valid, false)
  assert.equal(validateStructure(DEFAULT_STRUCTURE).valid, true)
  assert.equal(STRUCTURE_LABELS.length, 4)
})

test('R4 builds the exact canonical recommendation request', () => {
  const payload = buildCanonicalRequest({
    menuDate: '2026-09-07',
    mealType: 'dinner',
    peopleCount: 3,
    maxPrepMinutes: 80,
    structure: DEFAULT_STRUCTURE,
    preferences: { selectedTagIds: [8, '3', 8] }
  })
  assert.deepEqual(payload, {
    menuDate: '2026-09-07',
    mealType: 'dinner',
    peopleCount: 3,
    maxPrepMinutes: 80,
    structure: { meat: 1, vegetable: 2, soup: 1, staple: 0 },
    preferences: { selectedTagIds: [8, 3] }
  })
  assert.equal('mode' in payload, false)
  assert.equal('maxCookMinutes' in payload, false)
  assert.equal('recipeIds' in payload, false)
})

test('T4 keeps unified tag preferences session-scoped and toggleable', () => {
  assert.deepEqual(normalizeSelectedTagIds([8, '3', 8, 0, 'bad']), [8, 3])
  assert.deepEqual(toggleTagId([], 8), [8])
  assert.deepEqual(toggleTagId([8], 8), [])
  assert.deepEqual(toggleTagId([8, 8], 3), [8, 3])
})
