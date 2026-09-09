const { HIGH_PROTEIN_THRESHOLD_GRAMS } = require('./constants')

function round2(value) {
  return Math.round(value * 100) / 100
}

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function deriveHighProtein(proteinGrams) {
  return Number(proteinGrams) >= HIGH_PROTEIN_THRESHOLD_GRAMS
}

function calculateRecipeNutrition(recipe) {
  const totals = { calories: 0, proteinGrams: 0, fatGrams: 0, carbohydrateGrams: 0 }
  for (const item of recipe.ingredients || []) {
    const grams = numberOrZero(item.amountGrams)
    const ratio = grams / 100
    totals.calories += numberOrZero(item.caloriesPer100g) * ratio
    totals.proteinGrams += numberOrZero(item.proteinPer100g) * ratio
    totals.fatGrams += numberOrZero(item.fatPer100g) * ratio
    totals.carbohydrateGrams += numberOrZero(item.carbohydratePer100g) * ratio
  }
  return {
    calories: round2(totals.calories),
    proteinGrams: round2(totals.proteinGrams),
    fatGrams: round2(totals.fatGrams),
    carbohydrateGrams: round2(totals.carbohydrateGrams),
    highProtein: deriveHighProtein(round2(totals.proteinGrams))
  }
}

module.exports = { calculateRecipeNutrition, deriveHighProtein, round2 }
