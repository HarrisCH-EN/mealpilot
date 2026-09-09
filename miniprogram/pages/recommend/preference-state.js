const MIN_PREP_MINUTES = 10
const MAX_PREP_MINUTES = 480
const PREP_TIME_STEP = 1
const PREP_TIME_OPTIONS = Array.from(
  { length: Math.floor((MAX_PREP_MINUTES - MIN_PREP_MINUTES) / PREP_TIME_STEP) + 1 },
  (_, index) => {
    const value = MIN_PREP_MINUTES + index * PREP_TIME_STEP
    return { label: `${value} 分钟`, value }
  }
)
const MIN_STRUCTURE_DISHES = 1
const MAX_STRUCTURE_DISHES = 12

const DEFAULT_STRUCTURE = Object.freeze({ meat: 1, vegetable: 2, soup: 1, staple: 0 })
const STRUCTURE_LABELS = Object.freeze([
  { key: 'meat', label: '荤菜' },
  { key: 'vegetable', label: '素菜' },
  { key: 'soup', label: '汤' },
  { key: 'staple', label: '主食' }
])

const { normalizeTagIds, toggleTagId } = require('../../utils/tags')

function normalizePeopleCount(value) {
  const number = Math.round(Number(value))
  return Number.isFinite(number) ? Math.min(12, Math.max(1, number)) : 1
}

function clampPrepMinutes(value) {
  const number = Math.round(Number(value))
  return Number.isFinite(number)
    ? Math.min(MAX_PREP_MINUTES, Math.max(MIN_PREP_MINUTES, number))
    : MIN_PREP_MINUTES
}

function prepTimeIndex(value) {
  const clamped = clampPrepMinutes(value)
  return Math.min(
    PREP_TIME_OPTIONS.length - 1,
    Math.max(0, Math.round((clamped - MIN_PREP_MINUTES) / PREP_TIME_STEP))
  )
}

function normalizeStructure(value = {}) {
  return STRUCTURE_LABELS.reduce((result, item) => {
    const number = Math.floor(Number(value[item.key]))
    result[item.key] = Number.isFinite(number) ? Math.max(0, number) : 0
    return result
  }, {})
}

function structureDishCount(value = {}) {
  return Object.values(normalizeStructure(value)).reduce((sum, number) => sum + number, 0)
}

function validateStructure(value = {}) {
  const structure = normalizeStructure(value)
  const total = structureDishCount(structure)
  if (total < MIN_STRUCTURE_DISHES) return { valid: false, total, message: '至少选择一道菜' }
  if (total > MAX_STRUCTURE_DISHES) return { valid: false, total, message: '一桌最多选择 12 道菜' }
  return { valid: true, total, message: '' }
}

function buildCanonicalRequest({ menuDate, mealType = 'dinner', peopleCount, maxPrepMinutes, structure, preferences = {} }) {
  return {
    menuDate: String(menuDate),
    mealType: String(mealType),
    peopleCount: normalizePeopleCount(peopleCount),
    maxPrepMinutes: clampPrepMinutes(maxPrepMinutes),
    structure: normalizeStructure(structure),
    preferences: {
      selectedTagIds: normalizeTagIds(preferences.selectedTagIds)
    }
  }
}

function structureSummary(value = {}) {
  const normalized = normalizeStructure(value)
  return STRUCTURE_LABELS
    .filter(({ key }) => normalized[key] > 0)
    .map(({ key, label }) => `${normalized[key]}${label}`)
    .join(' · ')
}

module.exports = {
  DEFAULT_STRUCTURE,
  MAX_PREP_MINUTES,
  MIN_PREP_MINUTES,
  PREP_TIME_OPTIONS,
  PREP_TIME_STEP,
  STRUCTURE_LABELS,
  buildCanonicalRequest,
  clampPrepMinutes,
  normalizePeopleCount,
  normalizeStructure,
  normalizeSelectedTagIds: normalizeTagIds,
  prepTimeIndex,
  structureDishCount,
  structureSummary,
  toggleTagId,
  validateStructure
}
