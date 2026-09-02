const express = require('express')
const cors = require('cors')
const { authenticate, requireFamily } = require('./middleware/authenticate')
const authFamily = require('./routes/auth-family')
const recipes = require('./routes/recipes')
const menus = require('./routes/menus')

function createApp({ database, jwtSecret = 'local-development-secret-change-me', devAuthEnabled = true }) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', async (_request, response) => {
    response.json({ ok: true, data: { service: 'smart-meal-api' } })
  })

  if (database) {
    const auth = authenticate({ database, jwtSecret })
    const family = requireFamily(database)
    app.use('/api', authFamily.router({ database, jwtSecret, devAuthEnabled, auth, family }))
    app.use('/api', recipes.router({ database, auth, family }))
    app.use('/api', menus.router({ database, auth, family }))
  }

  app.use((error, _request, response, _next) => {
    const status = error.status || 500
    response.status(status).json({ ok: false, message: error.message || '服务器发生错误' })
  })

  return app
}

module.exports = { createApp }
