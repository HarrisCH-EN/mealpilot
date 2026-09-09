const RECIPE_TAG_TYPES = Object.freeze(['taste', 'dietary', 'method'])

const RECIPE_TAG_VALUES = Object.freeze({
  taste: Object.freeze(['spicy', 'sweet', 'light', 'sour', 'savory']),
  dietary: Object.freeze(['seafood', 'vegetarian']),
  method: Object.freeze(['stir_fry', 'steam', 'stew', 'soup', 'bake'])
})

function isAllowedRecipeTag(tagType, tagValue) {
  return RECIPE_TAG_TYPES.includes(tagType) && RECIPE_TAG_VALUES[tagType].includes(tagValue)
}

module.exports = { RECIPE_TAG_TYPES, RECIPE_TAG_VALUES, isAllowedRecipeTag }
