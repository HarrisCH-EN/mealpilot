const { getConfig } = require('../config')
const { createDatabase } = require('../db')
const { createCloudStorageService } = require('../services/cloud-storage-service')
const starterRecipes = require('../data/starter-recipes')
const { systemRecipeCovers } = require('../data/system-recipe-covers')

function sameValue(left, right) {
  return String(left ?? '') === String(right ?? '')
}

function isStrictStarterRow(row, template) {
  if (!row || !template) return false
  if (row.familyId !== undefined && Number(row.familyId) <= 0) return false
  if (row.createdByMemberId !== undefined && Number(row.createdByMemberId) <= 0) return false
  return sameValue(row.title, template.title)
    && sameValue(row.category, template.category)
    && sameValue(row.description, template.description)
    && sameValue(row.steps, template.steps)
    && Number(row.cookMinutes) === Number(template.cookMinutes)
    && Number(row.difficulty) === Number(template.difficulty)
    && Number(row.servings) === Number(template.servings)
}

function classifyRecipeForStorageMigration(row, template, targetFileId) {
  if (!isStrictStarterRow(row, template)) return { action: 'skip', reason: 'template-mismatch' }
  const current = String(row.coverFileId ?? row.cover_url ?? '').trim()
  if (targetFileId && current === targetFileId) return { action: 'already-cloud', targetFileId }
  if (!targetFileId && current === '') return { action: 'missing', title: template.title }
  const legacyValues = new Set(['', String(template.coverUrl || '')])
  if (!legacyValues.has(current)) return { action: 'skip', reason: 'custom-cover' }
  return { action: 'update', targetFileId, previousFileId: current }
}

async function runMigration({ database, fileIdForPath, apply = false, logger } = {}) {
  if (!database || typeof database.execute !== 'function') throw new TypeError('database with execute() is required')
  if (typeof fileIdForPath !== 'function') throw new Error('CloudBase Storage 文件 ID 构造器未配置')
  const validationFileId = fileIdForPath('system/recipes/__migration-validation__.jpg')
  if (typeof validationFileId !== 'string' || !/^cloud:\/\/[^/]+\/.+/.test(validationFileId)) throw new Error('CLOUDBASE_STORAGE_PATH_FAILED')
  const templates = new Map(starterRecipes.map((template) => [template.title, template]))
  const [rows] = await database.execute(`
    SELECT id, family_id AS familyId, created_by_member_id AS createdByMemberId,
      title, category, description, steps, cook_minutes AS cookMinutes,
      difficulty, servings, cover_url AS coverFileId
    FROM recipes
    WHERE status = 'active'
  `)
  const plans = []
  for (const row of rows) {
    const template = templates.get(row.title)
    if (!template) {
      plans.push({ row, action: 'skip', reason: 'unknown-title' })
      continue
    }
    const cloudPath = systemRecipeCovers[template.title]
    const targetFileId = cloudPath ? fileIdForPath(cloudPath) : ''
    plans.push({ row, template, ...classifyRecipeForStorageMigration(row, template, targetFileId) })
  }

  let updates = 0
  if (apply) {
    for (const plan of plans.filter((item) => item.action === 'update')) {
      const [result] = await database.execute(
        'UPDATE recipes SET cover_url = ? WHERE id = ? AND cover_url = ?',
        [plan.targetFileId, plan.row.id, plan.previousFileId]
      )
      if (Number(result && result.affectedRows) === 1) updates += 1
    }
  }
  const alreadyCloud = plans.filter((item) => item.action === 'already-cloud').length
  const skipped = plans.filter((item) => item.action === 'skip').length
  const missingPlans = plans.filter((item) => item.action === 'missing')
  const updatePlans = plans.filter((item) => item.action === 'update')
  const summary = {
    matched: plans.filter((item) => item.action !== 'skip').length,
    updates: apply ? updates : updatePlans.length,
    alreadyCloud,
    skipped,
    missing: missingPlans.length,
    mappedSystemCovers: updatePlans.length + alreadyCloud,
    missingSystemCovers: missingPlans.length,
    missingTitles: [...new Set(missingPlans.map((item) => item.title))]
  }
  if (logger) logger(summary)
  return { plans, summary }
}

function printSummary(summary) {
  console.log(JSON.stringify({
    matched: summary.matched,
    updates: summary.updates,
    alreadyCloud: summary.alreadyCloud,
    skipped: summary.skipped,
    missing: summary.missing,
    mappedSystemCovers: summary.mappedSystemCovers,
    missingSystemCovers: summary.missingSystemCovers,
    missingTitles: summary.missingTitles
  }, null, 2))
}

async function main() {
  const config = getConfig()
  const database = createDatabase(config.mysql)
  const storage = createCloudStorageService({ envId: config.cloudbaseEnvId, fileIdPrefix: config.cloudbaseStorageFileIdPrefix })
  try {
    const apply = process.argv.includes('--apply')
    const result = await runMigration({ database, fileIdForPath: storage.fileIdForPath, apply })
    printSummary(result.summary)
  } finally {
    await database.end()
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1 })

module.exports = { isStrictStarterRow, classifyRecipeForStorageMigration, runMigration, printSummary }
