const path = require('node:path')
const dotenv = require('dotenv')

dotenv.config({ path: path.join(__dirname, '../.env') })

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`缺少环境变量 ${name}`)
  return value
}

const DEVELOPMENT_JWT_SECRET = 'local-development-secret-change-me'

function resolveJwtSecret(environment, configuredSecret) {
  const value = String(configuredSecret || '').trim()
  if (environment === 'production' && (!value || value === DEVELOPMENT_JWT_SECRET)) {
    throw new Error('生产环境必须配置有效的 JWT_SECRET')
  }
  return value || DEVELOPMENT_JWT_SECRET
}

function getConfig(env = process.env) {
  const environment = env.NODE_ENV === 'production' ? 'production' : 'development'
  if (environment === 'production' && env.DEV_AUTH_ENABLED === 'true') {
    throw new Error('生产环境禁止启用开发登录，请设置 DEV_AUTH_ENABLED=false')
  }
  return {
    environment,
    port: Number(env.PORT || 3000),
    jwtSecret: resolveJwtSecret(environment, env.JWT_SECRET),
    devAuthEnabled: env.DEV_AUTH_ENABLED === 'true',
    wechatAppId: env.WECHAT_APP_ID || '',
    wechatAppSecret: env.WECHAT_APP_SECRET || '',
    uploadRoot: env.RECIPE_UPLOAD_ROOT || path.join(__dirname, '../uploads'),
    mysql: {
      host: env.MYSQL_HOST || '127.0.0.1',
      port: Number(env.MYSQL_PORT || 3306),
      user: env.MYSQL_USER || 'smart_meal_app',
      password: env.MYSQL_PASSWORD || '',
      database: env.MYSQL_DATABASE || 'smart_meal'
    },
    required
  }
}

module.exports = { getConfig, DEVELOPMENT_JWT_SECRET, resolveJwtSecret }
