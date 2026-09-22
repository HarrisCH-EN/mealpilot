const { getConfig } = require('./config')
const { createDatabase } = require('./db')
const { createApp } = require('./app')
const { createCloudStorageService } = require('./services/cloud-storage-service')
const { createMediaUrlService } = require('./services/media-url-service')
const { purgeExpiredFamilies } = require('./services/family-lifecycle-service')

const LIFECYCLE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000

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
    maxUploadBytes: config.maxUploadBytes,
    serveLocalUploads: config.environment !== 'production'
  })
  return { app, database, cloudStorageService }
}

function start(config = getConfig()) {
  const { app, database, cloudStorageService } = createRuntimeApp(config)
  const server = app.listen(config.port, () => {
    console.log(`MealPilot API listening on http://127.0.0.1:${config.port}`)
  })
  const cleanup = () => purgeExpiredFamilies({
    database,
    cloudStorageService,
    storageFileIdPrefix: config.cloudbaseStorageFileIdPrefix
  }).catch((error) => console.warn('[MealPilot Lifecycle Cleanup]', { code: error && error.code || 'CLEANUP_FAILED' }))
  cleanup()
  const cleanupTimer = setInterval(cleanup, LIFECYCLE_CLEANUP_INTERVAL_MS)
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref()
  return { server, database, cleanupTimer }
}

if (require.main === module) start()

module.exports = { createRuntimeApp, start, LIFECYCLE_CLEANUP_INTERVAL_MS }
