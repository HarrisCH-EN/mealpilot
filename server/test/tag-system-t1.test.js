const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const schema = fs.readFileSync(path.join(root, 'database/01_schema.sql'), 'utf8')
const seed = fs.readFileSync(path.join(root, 'database/02_seed.sql'), 'utf8')
const migrationPath = path.join(root, 'database/08_tag_system_v1.sql')
const { loadRecipeDomainData } = require('../src/services/recommendation/recipe-candidate-loader')

const systemTags = [
  ['spicy', '辣'], ['sour', '酸'], ['sweet', '甜'],
  ['seafood', '海鲜'], ['fish', '鱼'], ['shrimp', '虾'], ['crab', '蟹'],
  ['bake', '烤'], ['steam', '蒸'], ['fried', '炸']
]

test('T1 fresh schema defines tag definitions and recipe-tag association', () => {
  assert.match(schema, /CREATE TABLE tag_definitions \(/)
  assert.match(schema, /kind ENUM\('system', 'custom'\) NOT NULL/)
  assert.match(schema, /code VARCHAR\(40\) NULL/)
  assert.match(schema, /normalized_name VARCHAR\(40\) NOT NULL/)
  assert.match(schema, /UNIQUE KEY uq_tag_system_code \(kind, code\)/)
  assert.match(schema, /UNIQUE KEY uq_tag_family_name \(family_id, normalized_name\)/)
  assert.match(schema, /CHECK \(/)
  assert.match(schema, /CREATE TABLE recipe_tags \(/)
  assert.match(schema, /tag_id BIGINT UNSIGNED NOT NULL/)
  assert.match(schema, /PRIMARY KEY \(recipe_id, tag_id\)/)
  assert.match(schema, /FOREIGN KEY \(tag_id\) REFERENCES tag_definitions\(id\) ON DELETE RESTRICT/)
  assert.match(schema, /CREATE TABLE recipe_tags_legacy \(/)
})

test('T1 fresh seed defines exactly the ten approved system tag identities', () => {
  for (const [code, name] of systemTags) {
    assert.match(seed, new RegExp(`'${code}'\\s*,\\s*'${name}'`), `${code} system tag is missing`)
  }
  assert.doesNotMatch(seed, /'cuisine'/i)
  assert.doesNotMatch(seed, /'vegetarian'/i)
  assert.doesNotMatch(seed, /'stir_fry'/i)
  assert.doesNotMatch(seed, /'stew'/i)
  assert.doesNotMatch(seed, /'soup'/i)
})

test('T1 migration archives legacy metadata and maps only approved semantics', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'T1 migration must exist')
  const migration = fs.readFileSync(migrationPath, 'utf8')
  assert.match(migration, /information_schema\./i)
  assert.match(migration, /recipe_tags_legacy/i)
  assert.match(migration, /INSERT/i)
  assert.match(migration, /spicy|sour|sweet/i)
  assert.match(migration, /steam/i)
  assert.match(migration, /清蒸鲈鱼|recipe_id\s*=\s*8/i)
  assert.match(migration, /冬瓜虾仁汤|recipe_id\s*=\s*3/i)
  assert.doesNotMatch(migration, /seafood.*fish|fish.*seafood/i)
  assert.doesNotMatch(migration, /stir_fry.*fried|fried.*stir_fry/i)
  assert.doesNotMatch(migration, /ADD COLUMN IF NOT EXISTS/i)
})

test('T1 fresh seed keeps zero-tag recipes valid and uses code lookups for relations', () => {
  assert.match(seed, /INSERT(?:\s+IGNORE)?\s+INTO recipe_tags\s*\(recipe_id, tag_id\)/i)
  assert.match(seed, /tag_definitions[^;]+kind = 'system'[^;]+code/i)
  assert.match(seed, /td\.code = seed\.code/i)
  assert.doesNotMatch(seed, /INSERT INTO recipe_tags\s*\(recipe_id,\s*tag_type/i)
})

test('recommendation loader reads V1 tag codes without changing the legacy engine shape', async () => {
  const database = {
    async execute(sql) {
      if (/FROM recipes r/i.test(sql)) return [[{ id: 1, familyId: 1, status: 'active', title: '鱼', category: '荤菜', cookMinutes: 20, difficulty: 2, servings: 2 }]]
      if (/FROM recipe_ingredients/i.test(sql)) return [[{ recipeId: 1, ingredientId: 9, amountGrams: 100, ingredientName: '鱼', caloriesPer100g: 100, proteinPer100g: 20, fatPer100g: 1, carbohydratePer100g: 0 }]]
      if (/FROM recipe_tags/i.test(sql)) return [[{ recipeId: 1, tagCode: 'fish', tagKind: 'system' }]]
      if (/FROM ingredient_seasons/i.test(sql)) return [[]]
      throw new Error(`Unexpected SQL: ${sql}`)
    }
  }
  const [recipe] = await loadRecipeDomainData(database, { familyId: 1 })
  assert.deepEqual(recipe.tags, { taste: [], dietary: ['fish'], method: [] })
})
