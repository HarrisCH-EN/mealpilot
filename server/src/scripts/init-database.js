const fs = require('node:fs/promises')
const path = require('node:path')
const mysql = require('mysql2/promise')
const { getConfig } = require('../config')
const { ensureFamilyManagementSchema } = require('./family-management-schema')

async function run() {
  const config = getConfig()
  const connection = await mysql.createConnection({ ...config.mysql, database: undefined, multipleStatements: true })
  const sql = await fs.readFile(path.join(__dirname, '../../../database/01_schema.sql'), 'utf8')
  await connection.query(sql)
  await ensureFamilyManagementSchema(connection)
  await connection.end()
  console.log('mealpilot schema initialized')
}
run().catch((error) => { console.error(error.message); process.exitCode = 1 })
