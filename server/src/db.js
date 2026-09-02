const mysql = require('mysql2/promise')

function createDatabase(config) {
  return mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    decimalNumbers: true
  })
}

module.exports = { createDatabase }

