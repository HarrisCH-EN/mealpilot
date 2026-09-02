const path = require('node:path')
const dotenv = require('dotenv')

dotenv.config({ path: path.join(__dirname, '../.env') })

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`缺少环境变量 ${name}`)
  return value
}

function getConfig() {
  return {
    port: Number(process.env.PORT || 3000),
    jwtSecret: process.env.JWT_SECRET || 'local-development-secret-change-me',
    devAuthEnabled: process.env.DEV_AUTH_ENABLED === 'true',
    wechatAppId: process.env.WECHAT_APP_ID || '',
    wechatAppSecret: process.env.WECHAT_APP_SECRET || '',
    mysql: {
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'smart_meal_app',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'smart_meal'
    },
    required
  }
}

module.exports = { getConfig }

