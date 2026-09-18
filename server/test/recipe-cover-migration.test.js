const test = require('node:test')
const assert = require('node:assert/strict')

const starterRecipes = require('../src/data/starter-recipes')
const { systemRecipeCovers } = require('../src/data/system-recipe-covers')
const { classifyRecipeForStorageMigration, runMigration } = require('../src/scripts/migrate-recipe-cover-storage')

const prefix = 'cloud://test.bucket'
const fileIdForPath = (cloudPath) => `${prefix}/${cloudPath}`
const tomato = starterRecipes.find((recipe) => recipe.title === '番茄炒蛋')
const target = fileIdForPath(systemRecipeCovers[tomato.title])

function rowFrom(template, coverFileId = template.coverUrl || '') {
  return {
    id: 1,
    familyId: 7,
    createdByMemberId: 70,
    title: template.title,
    category: template.category,
    description: template.description,
    steps: template.steps,
    cookMinutes: template.cookMinutes,
    difficulty: template.difficulty,
    servings: template.servings,
    coverFileId
  }
}

test('migration matcher updates a strict legacy starter row and skips a customized same-title recipe', () => {
  assert.equal(classifyRecipeForStorageMigration(rowFrom(tomato), tomato, target).action, 'update')
  assert.equal(classifyRecipeForStorageMigration(rowFrom(tomato, '/uploads/recipes/custom.jpg'), tomato, target).action, 'skip')
  assert.equal(classifyRecipeForStorageMigration({ ...rowFrom(tomato), description: '用户改过' }, tomato, target).action, 'skip')
})

test('migration matcher treats already-cloud and the one missing system image idempotently', () => {
  assert.equal(classifyRecipeForStorageMigration(rowFrom(tomato, target), tomato, target).action, 'already-cloud')
  const missing = starterRecipes.find((recipe) => recipe.title === '红豆小米粥')
  assert.equal(classifyRecipeForStorageMigration(rowFrom(missing, ''), missing, '').action, 'missing')
})

test('migration dry-run does not write and apply writes only the classified target', async () => {
  const calls = []
  const rows = [rowFrom(tomato), rowFrom(starterRecipes.find((recipe) => recipe.title === '红豆小米粥'), '')]
  const database = {
    async execute(sql, params) {
      calls.push({ sql, params })
      if (/SELECT id, family_id/i.test(sql)) return [rows]
      if (/UPDATE recipes/i.test(sql)) return [{ affectedRows: 1 }]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const dryRun = await runMigration({ database, fileIdForPath, apply: false })
  assert.equal(calls.filter((call) => /UPDATE recipes/i.test(call.sql)).length, 0)
  assert.equal(dryRun.summary.updates, 1)
  assert.equal(dryRun.summary.missingSystemCovers, 1)
  const applied = await runMigration({ database, fileIdForPath, apply: true })
  assert.equal(applied.summary.updates, 1)
  assert.equal(calls.filter((call) => /UPDATE recipes/i.test(call.sql)).length, 1)
  assert.deepEqual(calls.find((call) => /UPDATE recipes/i.test(call.sql)).params, [target, 1, tomato.coverUrl])
})

test('migration rejects an invalid file ID builder before dry-run or apply writes', async () => {
  const calls = []
  const database = {
    async execute(sql) {
      calls.push(sql)
      if (/SELECT id, family_id/i.test(sql)) return [[rowFrom(tomato)]]
      if (/UPDATE recipes/i.test(sql)) return [{ affectedRows: 1 }]
      throw new Error(`unexpected SQL: ${sql}`)
    }
  }
  const invalidFileIdForPath = () => '/system/recipes/a.jpg'
  await assert.rejects(() => runMigration({ database, fileIdForPath: invalidFileIdForPath, apply: false }), /CLOUDBASE_STORAGE_PATH_FAILED/)
  await assert.rejects(() => runMigration({ database, fileIdForPath: invalidFileIdForPath, apply: true }), /CLOUDBASE_STORAGE_PATH_FAILED/)
  assert.equal(calls.length, 0)
})
