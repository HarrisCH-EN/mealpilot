const { RecommendationDomainError, SLOT_KEYS } = require('./constants')

function validateMealStructure(structure) {
  if (!structure || typeof structure !== 'object' || Array.isArray(structure)) {
    throw new RecommendationDomainError('INVALID_MEAL_STRUCTURE', '菜单结构必须是对象')
  }
  const keys = Object.keys(structure).sort()
  const expected = [...SLOT_KEYS].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new RecommendationDomainError('INVALID_MEAL_STRUCTURE', '菜单结构必须只包含 meat、vegetable、soup、staple')
  }
  const normalized = {}
  let total = 0
  for (const key of SLOT_KEYS) {
    const value = structure[key]
    if (!Number.isInteger(value) || value < 0) {
      throw new RecommendationDomainError('INVALID_MEAL_STRUCTURE', '菜单结构数量必须是非负整数', { key })
    }
    normalized[key] = value
    total += value
  }
  if (total < 1 || total > 12) {
    throw new RecommendationDomainError('INVALID_MEAL_STRUCTURE', '菜单结构总数量必须在 1 到 12 之间', { total })
  }
  return normalized
}

function normalizeMealStructure(structure) {
  return validateMealStructure(structure)
}

function expandMealStructure(structure) {
  const normalized = validateMealStructure(structure)
  return SLOT_KEYS.flatMap((key) => Array.from({ length: normalized[key] }, () => key))
}

module.exports = { expandMealStructure, normalizeMealStructure, validateMealStructure }
