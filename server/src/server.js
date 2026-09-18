const { getConfig } = require('./config')
const { createDatabase } = require('./db')
const { createApp } = require('./app')
const { createCloudStorageService } = require('./services/cloud-storage-service')
const { createMediaUrlService } = require('./services/media-url-service')

function createRuntimeApp(config, database = createDatabase(config.mysql)) {
  const cloudStorageService = config.cloudStorageService || createCloudStorageService({ envId: config.cloudbaseEnvId, fileIdPrefix: config.cloudbaseStorageFileIdPrefix })
  const app = createApp({
    database,
    jwtSecret: config.jwtSecret,
    devAuthEnabled: config.devAuthEnabled,
    wechatAppId: config.wechatAppId,
    wechatAppSecret: config.wechatAppSecret,
    wechatAuthService: config.wechatAuthService,
    cloudStorageService,
    mediaUrlService: config.mediaUrlService || createMediaUrlService({ storage: cloudStorageService }),
    cloudbaseStorageFileIdPrefix: config.cloudbaseStorageFileIdPrefix,
    maxUploadBytes: config.maxUploadBytes
  })
  return { app, database }
}

function start(config = getConfig()) {
  const { app, database } = createRuntimeApp(config)
  const server = app.listen(config.port, () => {
    console.log(`MealPilot API listening on http://127.0.0.1:${config.port}`)
  })
  return { server, database }
}

if (require.main === module) start()

module.exports = { createRuntimeApp, start }
