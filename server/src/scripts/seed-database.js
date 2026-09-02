const fs = require('node:fs/promises')
const path = require('node:path')
const mysql = require('mysql2/promise')
const { getConfig } = require('../config')

async function run() {
  const config = getConfig()
  const connection = await mysql.createConnection({ ...config.mysql, multipleStatements: true })
  await connection.query(await fs.readFile(path.join(__dirname, '../../../database/02_seed.sql'), 'utf8'))
  await connection.end()
  console.log('smart_meal sample data seeded')
}
run().catch((error) => { console.error(error.message); process.exitCode = 1 })
