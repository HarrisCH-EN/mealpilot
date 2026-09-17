const test = require('node:test')
const assert = require('node:assert/strict')
const {
  DEFAULT_STRUCTURE,
  PREFERENCE_STORAGE_KEY,
  PREP_RULER_TICK_WIDTH_PX,
  PREP_TIME_OPTIONS,
  STRUCTURE_LABELS,
  buildPersistedPreferences,
  buildCanonicalRequest,
  normalizeSelectedTagIds,
  normalizeMealType,
  normalizePeopleCount,
  normalizeStructure,
  prepRulerGeometry,
  prepRulerScrollLeft,
  prepRulerValueFromScrollLeft,
  restorePersistedPreferences,
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

test('recommendation meal types stay within the supported breakfast, lunch, and dinner options', () => {
  assert.equal(normalizeMealType('breakfast'), 'breakfast')
  assert.equal(normalizeMealType('lunch'), 'lunch')
  assert.equal(normalizeMealType('dinner'), 'dinner')
  assert.equal(normalizeMealType('brunch'), 'dinner')
  assert.equal(normalizeMealType(null), 'dinner')
})

test('persistent recommendation preferences restore the last valid custom choices', () => {
  const saved = buildPersistedPreferences({
    mealType: 'lunch',
    peopleCount: 3,
    maxPrepMinutes: 80,
    structure: { meat: 2, vegetable: 1, soup: 1, staple: 1 },
    preferences: { selectedTagIds: [9, '4', 9, 0, 'bad'] }
  })

  assert.equal(PREFERENCE_STORAGE_KEY, 'recommendation-preferences-v1')
  assert.deepEqual(saved, {
    version: 1,
    mealType: 'lunch',
    peopleCount: 3,
    maxPrepMinutes: 80,
    structure: { meat: 2, vegetable: 1, soup: 1, staple: 1 },
    preferences: { selectedTagIds: [9, 4] }
  })
  assert.deepEqual(restorePersistedPreferences(saved), saved)
})

test('persistent recommendation preferences fall back safely for missing or invalid storage', () => {
  assert.deepEqual(restorePersistedPreferences(null), {
    version: 1,
    mealType: 'dinner',
    peopleCount: 2,
    maxPrepMinutes: 60,
    structure: { meat: 1, vegetable: 2, soup: 1, staple: 0 },
    preferences: { selectedTagIds: [] }
  })
  assert.deepEqual(restorePersistedPreferences({ mealType: 'brunch', peopleCount: 99, maxPrepMinutes: 999, preferences: { selectedTagIds: ['7'] } }), {
    version: 1,
    mealType: 'dinner',
    peopleCount: 12,
    maxPrepMinutes: 480,
    structure: { meat: 1, vegetable: 2, soup: 1, staple: 0 },
    preferences: { selectedTagIds: [7] }
  })
})

test('canonical recommendation requests preserve the selected meal type', () => {
  for (const mealType of ['breakfast', 'lunch', 'dinner']) {
    const request = buildCanonicalRequest({
      menuDate: '2026-09-17',
      mealType,
      peopleCount: 2,
      maxPrepMinutes: 60,
      structure: DEFAULT_STRUCTURE,
      preferences: {}
    })
    assert.equal(request.mealType, mealType)
  }
})

test('preparation ruler centers its selected tick directly under the pointer', () => {
  const geometry = prepRulerGeometry(375)
  assert.equal(PREP_RULER_TICK_WIDTH_PX, 12)
  assert.equal(geometry.viewportWidth, 343)
  assert.equal(geometry.sidePadding, 165.5)
  assert.equal(geometry.sidePadding + PREP_RULER_TICK_WIDTH_PX / 2, geometry.viewportWidth / 2)
  assert.equal(prepRulerScrollLeft(60), 120)
  assert.equal(prepRulerValueFromScrollLeft(120), 60)
})
