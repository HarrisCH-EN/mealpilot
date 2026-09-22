const path = require('node:path')
const express = require('express')
const cors = require('cors')
const { authenticate, requireFamily, requireFamilyAdmin } = require('./middleware/authenticate')
const authRoutes = require('./routes/auth')
const families = require('./routes/families')
const recipes = require('./routes/recipes')
const menus = require('./routes/menus')
const restrictions = require('./routes/restrictions')
const preferences = require('./routes/preferences')
const uploads = require('./routes/uploads')
const feedback = require('./routes/feedback')
const tags = require('./routes/tags')
const { HttpError } = require('./http')
const { createWechatAuthService } = require('./services/wechat-auth-service')
const { createMediaUrlService } = require('./services/media-url-service')
const { createAuthService } = require('./services/auth-service')

function createApp({ database, jwtSecret = 'local-development-secret-change-me', devAuthEnabled = true, wechatAppId = '', wechatAppSecret = '', wechatAuthService, cloudStorageService, mediaUrlService, cloudbaseStorageFileIdPrefix = '', maxUploadBytes, serveLocalUploads = false, localUploadsRoot = path.join(__dirname, '../uploads') }) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', async (_request, response) => {
    response.json({ ok: true, data: { service: 'mealpilot-api' } })
  })

  if (serveLocalUploads) app.use('/uploads', express.static(localUploadsRoot))

  if (database) {
    const media = mediaUrlService || (cloudStorageService ? createMediaUrlService({ storage: cloudStorageService }) : null)
    const auth = authenticate({ database, jwtSecret, mediaUrlService: media })
    const family = requireFamily(database)
    const familyAdmin = requireFamilyAdmin(database)
    const wechat = wechatAuthService || createWechatAuthService({ appId: wechatAppId, appSecret: wechatAppSecret })
    const authService = createAuthService({ database, jwtSecret, wechatAuthService: wechat, mediaUrlService: media })
    app.use('/api', authRoutes.router({ authService, auth, devAuthEnabled }))
    app.use('/api', families.router({ database, auth, family, familyAdmin, fileIdForPath: cloudStorageService && cloudStorageService.fileIdForPath ? cloudStorageService.fileIdForPath.bind(cloudStorageService) : undefined, mediaUrlService: media }))
    app.use('/api', recipes.router({ database, auth, family, mediaUrlService: media, cloudbaseStorageFileIdPrefix }))
    app.use('/api', menus.router({ database, auth, family, mediaUrlService: media }))
    app.use('/api', restrictions.router({ database, auth, family }))
    app.use('/api', preferences.router({ database, auth, family }))
    app.use('/api', feedback.router({ database, auth, family }))
    app.use('/api', tags.router({ database, auth, family }))
    app.use('/api', uploads.router({ cloudStorageService, storageFileIdPrefix: cloudbaseStorageFileIdPrefix, maxBytes: maxUploadBytes, auth, family, database }))
  }

  app.use((error, _request, response, _next) => {
  if (error && error.type === 'entity.parse.failed') {
    return response.status(400).json({ ok: false, message: '请求 JSON 格式不正确' })
  }

  if (error instanceof HttpError) {
    const body = { ok: false, message: error.message }
    if (error.code) body.code = error.code
    return response.status(error.status).json(body)
  }

  console.error('[MealPilot API Error]', {
    message: error && error.message,
    code: error && error.code,
    errno: error && error.errno,
    sqlState: error && error.sqlState,
    sqlMessage: error && error.sqlMessage,
    stack: error && error.stack
  })

  response.status(500).json({ ok: false, message: '服务器发生错误' })
})

  return app
}

module.exports = { createApp }
