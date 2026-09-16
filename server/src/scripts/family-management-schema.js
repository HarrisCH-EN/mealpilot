const ROLE_COLUMN_SQL = "ALTER TABLE family_members MODIFY COLUMN role ENUM('owner', 'admin', 'member') NOT NULL DEFAULT 'member'"
const INVITE_CODE_COLUMN_SQL = 'ALTER TABLE families MODIFY COLUMN invite_code CHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL'

async function readColumn(database, tableName, columnName) {
  const [rows] = await database.execute(
    `SELECT COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tableName}' AND COLUMN_NAME = '${columnName}'`
  )
  return rows[0] || null
}

async function ensureFamilyManagementSchema(database) {
  const roleColumn = await readColumn(database, 'family_members', 'role')
  if (!roleColumn) throw new Error('family_members.role 列不存在，请先初始化数据库')
  const changes = []
  if (!String(roleColumn.COLUMN_TYPE || '').toLowerCase().includes("'admin'")) {
    await database.execute(ROLE_COLUMN_SQL)
    changes.push('family_members.role')
  }

  const inviteCodeColumn = await readColumn(database, 'families', 'invite_code')
  if (!inviteCodeColumn) throw new Error('families.invite_code 列不存在，请先初始化数据库')
  const isCaseSensitiveAscii = String(inviteCodeColumn.COLUMN_TYPE || '').toLowerCase() === 'char(6)' && inviteCodeColumn.CHARACTER_SET_NAME === 'ascii' && inviteCodeColumn.COLLATION_NAME === 'ascii_bin'
  if (!isCaseSensitiveAscii) {
    await database.execute(INVITE_CODE_COLUMN_SQL)
    changes.push('families.invite_code')
  }
  return changes
}

module.exports = { ensureFamilyManagementSchema, ROLE_COLUMN_SQL, INVITE_CODE_COLUMN_SQL }
