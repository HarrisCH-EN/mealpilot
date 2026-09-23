const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const HISTORY_TABLE = 'schema_migrations'
const MIGRATION_LOCK = 'mealpilot_schema_migrate'
const MIGRATION_FILES = [
  '04_recommendation_refactor_r1.sql',
  '05_recommendation_run_nullable_legacy.sql',
  '06_recipe_tag_metadata_backfill.sql',
  '07_remove_cuisine_tags.sql',
  '08_tag_system_v1.sql',
  '09_family-admin-role.sql',
  '10_family-invite-code.sql',
  '11_account_family_lifecycle.sql',
  '12_single_admin_role.sql'
]

function normalizeMigrationSql(sql) {
  return String(sql || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*USE\s+`?mealpilot`?\s*;\s*/gim, '')
    .trim()
}

function migrationChecksum(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex')
}

async function hasColumn(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
      LIMIT 1`,
    [tableName, columnName]
  )
  return rows.length > 0
}

async function shouldSkipMigration(connection, migrationName) {
  if (!['06_recipe_tag_metadata_backfill.sql', '07_remove_cuisine_tags.sql'].includes(migrationName)) return false
  const hasLegacyTagType = await hasColumn(connection, 'recipe_tags', 'tag_type')
  const hasLegacyTagValue = await hasColumn(connection, 'recipe_tags', 'tag_value')
  return !hasLegacyTagType || !hasLegacyTagValue
}

async function ensureHistoryTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS ${HISTORY_TABLE} (
      version VARCHAR(120) PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      status ENUM('applied', 'skipped') NOT NULL,
      note VARCHAR(255) NOT NULL DEFAULT '',
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `)
}

async function acquireMigrationLock(connection) {
  const [rows] = await connection.execute('SELECT GET_LOCK(?, 60) AS acquired', [MIGRATION_LOCK])
  if (!rows[0] || Number(rows[0].acquired) !== 1) throw new Error('无法获得数据库迁移锁，请稍后重试')
}

async function releaseMigrationLock(connection) {
  await connection.execute('SELECT RELEASE_LOCK(?)', [MIGRATION_LOCK])
}

async function readMigrationHistory(connection, version) {
  const [rows] = await connection.execute(
    `SELECT version, checksum, status FROM ${HISTORY_TABLE} WHERE version = ?`,
    [version]
  )
  return rows[0] || null
}

async function recordMigration(connection, version, checksum, status, note = '') {
  await connection.execute(
    `INSERT INTO ${HISTORY_TABLE} (version, checksum, status, note) VALUES (?, ?, ?, ?)`,
    [version, checksum, status, note]
  )
}

async function runMigrations(connection, databaseRoot = path.resolve(__dirname, '../../../database')) {
  await ensureHistoryTable(connection)
  await acquireMigrationLock(connection)
  const result = { applied: [], skipped: [], alreadyApplied: [] }
  try {
    for (const version of MIGRATION_FILES) {
      const filePath = path.join(databaseRoot, version)
      const sql = normalizeMigrationSql(await fs.readFile(filePath, 'utf8'))
      if (!sql) throw new Error(`迁移文件为空：${version}`)
      if (/^\s*USE\s+/im.test(sql)) throw new Error(`迁移文件不能切换数据库：${version}`)
      const checksum = migrationChecksum(sql)
      const history = await readMigrationHistory(connection, version)
      if (history) {
        if (history.checksum !== checksum) throw new Error(`迁移文件已被修改：${version}`)
        result.alreadyApplied.push(version)
        continue
      }
      if (await shouldSkipMigration(connection, version)) {
        await recordMigration(connection, version, checksum, 'skipped', '当前数据库已使用新版标签关系表')
        result.skipped.push(version)
        continue
      }
      await connection.query(sql)
      await recordMigration(connection, version, checksum, 'applied')
      result.applied.push(version)
    }
    return result
  } finally {
    await releaseMigrationLock(connection)
  }
}

module.exports = {
  HISTORY_TABLE,
  MIGRATION_FILES,
  normalizeMigrationSql,
  migrationChecksum,
  shouldSkipMigration,
  runMigrations
}
