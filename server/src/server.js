const { getConfig } = require('./config')
const { createDatabase } = require('./db')
const { createApp } = require('./app')

const config = getConfig()
const database = createDatabase(config.mysql)
const app = createApp({ database })

app.listen(config.port, () => {
  console.log(`smart-meal API listening on http://127.0.0.1:${config.port}`)
})
