const SLOT_KEYS = Object.freeze(['meat', 'vegetable', 'soup', 'staple'])

const CATEGORY_BY_SLOT = Object.freeze({
  meat: '荤菜',
  vegetable: '素菜',
  soup: '汤',
  staple: '主食'
})

const TAG_GROUPS = Object.freeze({
  tasteTags: 'taste',
  dietaryTags: 'dietary'
})

const MAX_RAW_MENU_CANDIDATES = 300
const MAX_RECOMMENDATION_CANDIDATES = 3
const EXPLORATION_SCORE_DELTA = 1
const EXPLORATION_WINDOW_TOP_K = 6
const HIGH_PROTEIN_THRESHOLD_GRAMS = 61.32

const MENU_SCORE_WEIGHTS = Object.freeze({
  preference: 30,
  ingredientDiversity: 15,
  methodDiversity: 10,
  nutrition: 15,
  seasonal: 10,
  novelty: 20
})

const NOVELTY_PENALTIES = Object.freeze({
  recent: 20,
  previousWeek: 8
})

class RecommendationDomainError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'RecommendationDomainError'
    this.code = code
    this.details = details
  }
}

module.exports = {
  CATEGORY_BY_SLOT,
  EXPLORATION_SCORE_DELTA,
  EXPLORATION_WINDOW_TOP_K,
  HIGH_PROTEIN_THRESHOLD_GRAMS,
  MAX_RAW_MENU_CANDIDATES,
  MAX_RECOMMENDATION_CANDIDATES,
  MENU_SCORE_WEIGHTS,
  NOVELTY_PENALTIES,
  RecommendationDomainError,
  SLOT_KEYS,
  TAG_GROUPS
}
