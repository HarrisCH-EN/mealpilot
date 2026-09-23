const {
  MAX_RAW_MENU_CANDIDATES,
  MAX_RECOMMENDATION_CANDIDATES,
  EXPLORATION_SCORE_DELTA,
  EXPLORATION_WINDOW_TOP_K,
  RecommendationDomainError
} = require('./constants')
const { normalizeMealStructure } = require('./menu-structure')
const { filterEligibleRecipes } = require('./recipe-filter')
const { generateRawMenuCandidates } = require('./menu-generator')
const { evaluateMenuCandidate, findCommonIngredientIds } = require('./menu-evaluator')
const { selectDiverseCandidates, selectQualityWindow } = require('./diversifier')
const { orderBySeed, orderPoolsBySeed } = require('./exploration')
const { loadActiveFamilyRestrictionIds, loadFamilyCategoryPreferenceScores, loadRecipeDomainData } = require('./recipe-candidate-loader')
const { loadRecentRecipeUsage, loadLowRatedRecipeIds } = require('./recent-history')
const { validateSessionPreferences, canonicalMenuMatchesSelectedTags } = require('./preference-matcher')

function assertRequestContext(input) {
  if (!input.activeMember || input.activeMember.status !== 'active') {
    throw new RecommendationDomainError('INACTIVE_MEMBER_CONTEXT', '当前成员不是 active 状态')
  }
  if (Number(input.activeMember.familyId) !== Number(input.familyId) || Number(input.activeMember.id) !== Number(input.memberId)) {
    throw new RecommendationDomainError('FAMILY_CONTEXT_MISMATCH', '当前成员与家庭上下文不一致')
  }
  if (!Number.isInteger(input.peopleCount) || input.peopleCount < 1 || input.peopleCount > 12) {
    throw new RecommendationDomainError('INVALID_PEOPLE_COUNT', 'peopleCount 必须在 1 到 12 之间')
  }
  if (!Number.isInteger(input.maxPrepMinutes) || input.maxPrepMinutes < 10 || input.maxPrepMinutes > 480) {
    throw new RecommendationDomainError('INVALID_MAX_PREP_MINUTES', 'maxPrepMinutes 必须在 10 到 480 之间')
  }
}

function toCandidateView(evaluated, rank) {
  return {
    candidateId: `memory-${rank}`,
    rank,
    items: evaluated.recipeScores.map(({ recipe, dishScore, reason }) => ({
      recipeId: recipe.id,
      title: recipe.title,
      category: recipe.category,
      cookMinutes: Number(recipe.cookMinutes || 0),
      difficulty: Number(recipe.difficulty || 1),
      coverUrl: recipe.coverUrl || null,
      tags: recipe.tagDetails || [],
      dishScore,
      reason
    })),
    estimatedPrepMinutes: evaluated.estimatedPrepMinutes,
    withinTimeLimit: evaluated.withinTimeLimit,
    timeOverageMinutes: evaluated.timeOverageMinutes,
    timeWarning: evaluated.timeWarning,
    totalScore: evaluated.totalScore,
    scoreBreakdown: evaluated.scoreBreakdown,
    reason: evaluated.reasonParts.join('；'),
    reasonParts: evaluated.reasonParts,
    recipeIds: evaluated.recipeIds
  }
}

function generateMenuCandidates(input) {
  assertRequestContext(input)
  const structure = normalizeMealStructure(input.structure)
  const preferences = validateSessionPreferences(input.preferences || {})
  const filtered = filterEligibleRecipes(input.recipes || [], {
    familyId: input.familyId,
    restrictedIngredientIds: input.restrictedIngredientIds || [],
    excludedRecipeIds: input.lowRatedRecipeIds || []
  })
  for (const [slot, required] of Object.entries(structure)) {
    if (filtered.pools[slot].length < required) {
      throw new RecommendationDomainError('INSUFFICIENT_CATEGORY_CAPACITY', '可用菜谱无法满足指定菜单结构', {
        slot,
        category: require('./constants').CATEGORY_BY_SLOT[slot],
        required,
        available: filtered.pools[slot].length,
        excluded: filtered.excluded
      })
    }
  }
  const pools = orderPoolsBySeed(filtered.pools, input.explorationSeed)
  const raw = generateRawMenuCandidates({
    pools,
    structure,
    maxCandidates: MAX_RAW_MENU_CANDIDATES,
    requiredTagIds: preferences.selectedTagIds || []
  })
  if (!raw.candidates.length) {
    if ((preferences.selectedTagIds || []).length) {
      throw new RecommendationDomainError('NO_TAG_MATCHING_MENU', '当前条件下没有同时满足所选标签的完整菜单', {
        selectedTagIds: preferences.selectedTagIds
      })
    }
    throw new RecommendationDomainError('NO_COMPLETE_MENU', '没有满足结构和家庭限制的完整菜单')
  }
  const allEligible = Object.values(filtered.pools).flat()
  const context = {
    preferences,
    familyCategoryPreferenceScores: input.familyCategoryPreferenceScores || {},
    recentUsage: input.recentUsage || {},
    targetMonth: Number(String(input.menuDate).split('-')[1]) || new Date().getMonth() + 1,
    maxPrepMinutes: input.maxPrepMinutes,
    commonIngredientIds: findCommonIngredientIds(allEligible)
  }
  const evaluated = raw.candidates
    .filter((candidate) => canonicalMenuMatchesSelectedTags(candidate, preferences))
    .map((candidate) => evaluateMenuCandidate(candidate, context))
  if (!evaluated.length && (preferences.selectedTagIds || []).length) {
    throw new RecommendationDomainError('NO_TAG_MATCHING_MENU', '当前条件下没有同时满足所选标签的完整菜单', {
      selectedTagIds: preferences.selectedTagIds
    })
  }
  let selected
  if (input.explorationSeed) {
    const qualityWindow = selectQualityWindow(evaluated, { scoreDelta: EXPLORATION_SCORE_DELTA, topK: EXPLORATION_WINDOW_TOP_K })
    const exploredWindow = orderBySeed(qualityWindow, input.explorationSeed, (candidate) => candidate.recipeIds.join(','))
    selected = selectDiverseCandidates(exploredWindow, { maxCandidates: MAX_RECOMMENDATION_CANDIDATES, presorted: true })
  } else {
    selected = selectDiverseCandidates(evaluated, { maxCandidates: MAX_RECOMMENDATION_CANDIDATES })
  }
  const candidates = selected.candidates.map((candidate, index) => toCandidateView(candidate, index + 1))
  return {
    ok: true,
    candidates,
    nextCandidateAvailable: candidates.length > 1,
    rawCandidateCount: raw.candidates.length,
    rawCandidatesTruncated: raw.truncated,
    eligibleCounts: filtered.counts,
    excludedCounts: filtered.excluded,
    diversityRelaxationLevel: selected.relaxationLevel,
    diversityRelaxed: selected.diversityRelaxed
  }
}

async function generateMenuCandidatesFromDatabase({ connection, database, ...input }) {
  const db = connection || database
  if (!db || typeof db.execute !== 'function') throw new TypeError('connection or database with execute() is required')
  const [recipes, restrictedIngredientIds, familyCategoryPreferenceScores, recentUsage, lowRatedRecipeIds] = await Promise.all([
    loadRecipeDomainData(db, { familyId: input.familyId }),
    loadActiveFamilyRestrictionIds(db, { familyId: input.familyId }),
    loadFamilyCategoryPreferenceScores(db, { familyId: input.familyId }),
    loadRecentRecipeUsage(db, { familyId: input.familyId, targetDate: input.menuDate }),
    loadLowRatedRecipeIds(db, { familyId: input.familyId, memberId: input.memberId })
  ])
  return generateMenuCandidates({
    ...input,
    recipes,
    restrictedIngredientIds,
    familyCategoryPreferenceScores,
    recentUsage,
    lowRatedRecipeIds
  })
}

function getAvailableTagIds(input, candidateTagIds = []) {
  const structure = normalizeMealStructure(input.structure)
  const preferences = validateSessionPreferences(input.preferences || {})
  const filtered = filterEligibleRecipes(input.recipes || [], {
    familyId: input.familyId,
    restrictedIngredientIds: input.restrictedIngredientIds || [],
    excludedRecipeIds: input.lowRatedRecipeIds || []
  })
  const selected = preferences.selectedTagIds || []
  return candidateTagIds.map(Number).filter((tagId, index, ids) => ids.indexOf(tagId) === index)
    .filter((tagId) => {
      const requiredTagIds = [...new Set([...selected, tagId])]
      const result = generateRawMenuCandidates({
        pools: filtered.pools,
        structure,
        maxCandidates: 1,
        requiredTagIds
      })
      return result.candidates.length > 0
    })
}

module.exports = { generateMenuCandidates, generateMenuCandidatesFromDatabase, getAvailableTagIds }
