const environments = {
  development: {
    apiBaseUrl: 'http://127.0.0.1:3000/api',
    allowDevLogin: false
  },
  production: {
    apiBaseUrl: 'https://mealpilot-api-315434-10-1423427242.sh.run.tcloudbase.com/api',
    allowDevLogin: false
  }
}

const activeEnvironment = 'development'

function validateEnvironmentConfig(environment, config) {
  if (!config) throw new Error(`未找到环境配置：${environment}`)
  if (environment !== 'production') return config
  const apiUrl = String(config.apiBaseUrl || '').trim()
  if (!/^https:\/\//i.test(apiUrl) || /localhost|127\.0\.0\.1|replace-with-your-api|example\.com/i.test(apiUrl)) {
    throw new Error('生产环境 API 地址无效，禁止回退到开发环境')
  }
  if (config.allowDevLogin !== false) throw new Error('生产环境禁止启用本地开发登录')
  return config
}

const activeConfig = validateEnvironmentConfig(activeEnvironment, environments[activeEnvironment])
module.exports = { activeEnvironment, ...activeConfig, validateEnvironmentConfig }