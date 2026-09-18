const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const starterRecipes = require('../src/data/starter-recipes')
const { systemRecipeCovers } = require('../src/data/system-recipe-covers')
const { seedStarterRecipes } = require('../src/services/starter-recipe-service')

const assetDir = path.resolve(__dirname, '../..', 'miniprogram/assets/recipes')

test('starter storage mapping has 47 existing images and only red-bean millet porridge is missing', () => {
  assert.equal(starterRecipes.length, 48)
  assert.equal(Object.keys(systemRecipeCovers).length, 47)
  assert.equal(systemRecipeCovers['红豆小米粥'], undefined)
  assert.equal(systemRecipeCovers['猪肉白菜包子'], 'system/recipes/猪肉白菜包.jpg')
})

test('every starter storage mapping points to a real bundled image', () => {
  const files = new Set(fs.readdirSync(assetDir))
  for (const cloudPath of Object.values(systemRecipeCovers)) {
    const filename = cloudPath.replace(/^system\/recipes\//, '')
    assert.equal(files.has(filename), true, `${filename} must exist in the bundled recipe assets`)
  }
})

test('starter seeding writes stable CloudBase file IDs and leaves the missing image empty', async () => {
  const covers = []
  let nextId = 0
  const connection = {
    async execute(sql, params = []) {
      if (/SELECT id FROM ingredients/i.test(sql)) return [starterRecipes.flatMap((recipe) => recipe.ingredients).map((item) => ({ id: item.ingredientId }))]
      if (/SELECT id, code FROM tag_definitions/i.test(sql)) return [starterRecipes.flatMap((recipe) => recipe.systemTagCodes).filter((value, index, all) => all.indexOf(value) === index).map((code, index) => ({ id: index + 1, code }))]
      if (/INSERT INTO recipes/i.test(sql)) { covers.push(params[9]); return [{ insertId: ++nextId }] }
      if (/INSERT INTO recipe_ingredients|INSERT INTO recipe_tags/i.test(sql)) return [{ affectedRows: 1 }]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  await seedStarterRecipes(connection, { familyId: 7, ownerMemberId: 70, fileIdForPath: (cloudPath) => `cloud://test.bucket/${cloudPath}` })
  assert.equal(covers.length, 48)
  assert.equal(covers.filter(Boolean).length, 47)
  assert.equal(covers.find((value) => value === ''), '')
  assert.equal(covers.includes('cloud://test.bucket/system/recipes/猪肉白菜包.jpg'), true)
})
