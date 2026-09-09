const { getConfig } = require('./config')
const { createDatabase } = require('./db')
const { createApp } = require('./app')

function createRuntimeApp(config, database = createDatabase(config.mysql)) {
  const app = createApp({
    database,
    jwtSecret: config.jwtSecret,
    devAuthEnabled: config.devAuthEnabled,
    wechatAppId: config.wechatAppId,
    wechatAppSecret: config.wechatAppSecret,
    wechatAuthService: config.wechatAuthService,
    uploadRoot: config.uploadRoot
  })
  return { app, database }
}

function start(config = getConfig()) {
  const { app, database } = createRuntimeApp(config)
  const server = app.listen(config.port, () => {
    console.log(`smart-meal API listening on http://127.0.0.1:${config.port}`)
  })
  return { server, database }
}

if (require.main === module) start()

module.exports = { createRuntimeApp, start }
