const path = require('node:path')
const mysql = require('mysql2/promise')
const { getConfig } = require('../config')
const { ensureFamilyManagementSchema } = require('./family-management-schema')
const { runMigrations } = require('./migration-runner')

async function run() {
  const config = getConfig()
  const connection = await mysql.createConnection({ ...config.mysql, multipleStatements: true })
  try {
    const migrationResult = await runMigrations(connection, path.join(__dirname, '../../../database'))
    const changes = await ensureFamilyManagementSchema(connection)
    const familyMessage = changes.length ? `family-management schema upgraded: ${changes.join(', ')}` : 'family-management schema is up to date'
    console.log(`database migrations applied: ${migrationResult.applied.length}, skipped: ${migrationResult.skipped.length}, already applied: ${migrationResult.alreadyApplied.length}`)
    console.log(familyMessage)
  } finally {
    await connection.end()
  }
}

if (require.main === module) run().catch((error) => { console.error(error.message); process.exitCode = 1 })

module.exports = { run }
