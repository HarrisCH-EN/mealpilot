const { TAG_GROUPS } = require('./constants')
const { RecommendationDomainError } = require('./constants')
const { RECIPE_TAG_VALUES } = require('../recommendation-metadata')
const { calculateRecipeNutrition } = require('./nutrition')
const { normalizeTagIds } = require('../tag-service')

function normalizePreferences(preferences = {}) {
  return {
    tasteTags: Array.isArray(preferences.tasteTags) ? preferences.tasteTags : [],
    dietaryTags: Array.isArray(preferences.dietaryTags) ? preferences.dietaryTags : [],
    seasonal: Boolean(preferences.seasonal)
  }
}

function isCanonicalPreferences(preferences = {}) {
  return Object.prototype.hasOwnProperty.call(preferences, 'selectedTagIds')
}

function normalizeCanonicalPreferences(preferences = {}) {
  try {
    return { selectedTagIds: normalizeTagIds(preferences.selectedTagIds) || [] }
  } catch (error) {
    throw new RecommendationDomainError('INVALID_SESSION_PREFERENCE', 'selectedTagIds 必须是正整数数组')
  }
}

function tagsFor(recipe, tagType) {
  return recipe.tags && Array.isArray(recipe.tags[tagType]) ? recipe.tags[tagType] : []
}

function recipeMatchesTag(recipe, tagType, tag) {
  if (tagType === 'dietary' && tag === 'high_protein') return calculateRecipeNutrition(recipe).highProtein
  return tagsFor(recipe, tagType).includes(tag)
}

function validateSessionPreferences(preferences = {}) {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    throw new RecommendationDomainError('INVALID_SESSION_PREFERENCE', 'preferences 必须是对象')
  }
  if (isCanonicalPreferences(preferences)) {
    if (Object.keys(preferences).some((key) => key !== 'selectedTagIds')) {
      throw new RecommendationDomainError('INVALID_SESSION_PREFERENCE', '新旧推荐偏好不能混用')
    }
    return normalizeCanonicalPreferences(preferences)
  }
  const allowedKeys = new Set(['tasteTags', 'dietaryTags', 'seasonal'])
  if (Object.keys(preferences).some((key) => !allowedKeys.has(key))) {
    throw new RecommendationDomainError('INVALID_SESSION_PREFERENCE', '存在不受支持的推荐偏好字段')
  }
  for (const key of ['tasteTags', 'dietaryTags']) {
    if (preferences[key] !== undefined && !Array.isArray(preferences[key])) {
      throw new RecommendationDomainError('INVALID_SESSION_PREFERENCE', '偏好标签必须是数组', { preferenceKey: key })
    }
  }
  if (preferences.seasonal !== undefined && typeof preferences.seasonal !== 'boolean') {
    throw new RecommendationDomainError('INVALID_SESSION_PREFERENCE', 'seasonal 必须是布尔值')
  }
  const normalized = normalizePreferences(preferences)
  for (const [preferenceKey, tagType] of Object.entries(TAG_GROUPS)) {
    const allowed = tagType === 'dietary' ? [...RECIPE_TAG_VALUES[tagType], 'high_protein'] : RECIPE_TAG_VALUES[tagType]
    for (const tag of normalized[preferenceKey]) {
      if (!allowed.includes(tag)) {
        throw new RecommendationDomainError('INVALID_SESSION_PREFERENCE', '存在不受支持的推荐偏好', { preferenceKey, tag })
      }
    }
  }
  return normalized
}

function canonicalRecipeTagIds(recipe) {
  return normalizeTagIds(Array.isArray(recipe.tagIds) ? recipe.tagIds : []) || []
}

function canonicalTagNames(recipes, tagIds) {
  const names = new Map()
  for (const recipe of recipes) {
    for (const detail of Array.isArray(recipe.tagDetails) ? recipe.tagDetails : []) {
      const id = Number(detail.id ?? detail.tagId)
      if (Number.isInteger(id) && tagIds.includes(id) && detail.name && !names.has(id)) names.set(id, detail.name)
    }
  }
  return tagIds.map((id) => names.get(id)).filter(Boolean)
}

function scoreCanonicalRecipePreferenceMatch(recipe, preferences) {
  const selectedTagIds = preferences.selectedTagIds
  const recipeTagIds = canonicalRecipeTagIds(recipe)
  const matchedTagIds = selectedTagIds.filter((id) => recipeTagIds.includes(id))
  const unmatchedTagIds = selectedTagIds.filter((id) => !recipeTagIds.includes(id))
  return {
    score: selectedTagIds.length ? Math.round((matchedTagIds.length / selectedTagIds.length) * 100) : 50,
    matched: { selectedTagIds: matchedTagIds },
    unmatched: { selectedTagIds: unmatchedTagIds },
    matchedTagIds,
    unmatchedTagIds,
    matchedCount: matchedTagIds.length,
    requestedCount: selectedTagIds.length,
    tagPreferenceScore: selectedTagIds.length ? Math.round((matchedTagIds.length / selectedTagIds.length) * 30) : 0
  }
}

function scoreRecipePreferenceMatch(recipe, preferences = {}) {
  const normalized = validateSessionPreferences(preferences)
  if (isCanonicalPreferences(normalized)) return scoreCanonicalRecipePreferenceMatch(recipe, normalized)
  const matched = {}
  const unmatched = {}
  let requestedCount = 0
  let matchedCount = 0
  for (const [preferenceKey, tagType] of Object.entries(TAG_GROUPS)) {
    const requested = normalized[preferenceKey]
    const available = tagsFor(recipe, tagType)
    matched[preferenceKey] = requested.filter((tag) => recipeMatchesTag(recipe, tagType, tag))
    unmatched[preferenceKey] = requested.filter((tag) => !recipeMatchesTag(recipe, tagType, tag))
    requestedCount += requested.length
    matchedCount += matched[preferenceKey].length
  }
  return {
    score: requestedCount === 0 ? 50 : Math.round((matchedCount / requestedCount) * 100),
    matched,
    unmatched,
    matchedCount,
    requestedCount
  }
}

function scoreCanonicalMenuPreferenceMatch(recipes, preferences) {
  const selectedTagIds = preferences.selectedTagIds
  const candidateTagIds = [...new Set(recipes.flatMap((recipe) => canonicalRecipeTagIds(recipe)))]
  const matchedTagIds = selectedTagIds.filter((id) => candidateTagIds.includes(id))
  const matchedRecipeCount = recipes.filter((recipe) => canonicalRecipeTagIds(recipe).some((id) => selectedTagIds.includes(id))).length
  return {
    score: selectedTagIds.length ? Math.round((matchedTagIds.length / selectedTagIds.length) * 100) : 50,
    tagPreferenceScore: selectedTagIds.length ? Math.round((matchedTagIds.length / selectedTagIds.length) * 30) : 0,
    selectedTagIds,
    candidateTagIds,
    matchedTagIds,
    matchedTagNames: canonicalTagNames(recipes, matchedTagIds),
    groupScores: {},
    matchedRecipeCount
  }
}

function saturatingCoverageScore(matchedCount, totalCount) {
  if (matchedCount === 0 || totalCount === 0) return 0
  return Math.min(100, Math.round((matchedCount / totalCount) * 100 + Math.min(30, matchedCount * 15)))
}

function scoreMenuPreferenceMatch(recipes, preferences = {}) {
  const normalized = validateSessionPreferences(preferences)
  if (isCanonicalPreferences(normalized)) return scoreCanonicalMenuPreferenceMatch(recipes, normalized)
  const groupScores = {}
  const activeScores = []
  for (const [preferenceKey, tagType] of Object.entries(TAG_GROUPS)) {
    const requested = normalized[preferenceKey]
    if (requested.length === 0) continue
    const matchedCount = recipes.filter((recipe) => requested.some((tag) => recipeMatchesTag(recipe, tagType, tag))).length
    groupScores[preferenceKey] = saturatingCoverageScore(matchedCount, recipes.length)
    activeScores.push(groupScores[preferenceKey])
  }
  return {
    score: activeScores.length ? Math.round(activeScores.reduce((sum, value) => sum + value, 0) / activeScores.length) : 50,
    groupScores,
    matchedRecipeCount: recipes.filter((recipe) => Object.entries(TAG_GROUPS).some(([key, type]) => normalized[key].some((tag) => recipeMatchesTag(recipe, type, tag)))).length
  }
}

function scoreFamilyCategoryPreference(recipes, familyCategoryPreferenceScores = {}) {
  if (!recipes.length) return { score: 50, neutral: true }
  const values = recipes.map((recipe) => {
    const value = Number(familyCategoryPreferenceScores[recipe.category])
    return Number.isFinite(value) ? Math.max(1, Math.min(5, value)) : 3
  })
  const score = Math.round(values.reduce((sum, value) => sum + ((value - 1) / 4) * 100, 0) / values.length)
  return { score, neutral: values.every((value) => value === 3) }
}

module.exports = {
  isCanonicalPreferences,
  normalizePreferences,
  saturatingCoverageScore,
  scoreFamilyCategoryPreference,
  scoreMenuPreferenceMatch,
  scoreRecipePreferenceMatch,
  validateSessionPreferences
}
