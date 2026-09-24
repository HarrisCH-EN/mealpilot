const environments = {
  development: {
    transport: 'http',
    apiBaseUrl: 'http://127.0.0.1:3000/api',

    cloudEnvId: '',
    cloudServiceName: '',
    cloudApiPrefix: '/api',

    allowDevLogin: false
  },

  production: {
    transport: 'cloud',

    // 保留这个字段主要为了兼容旧代码，
    // production 普通 API 不再通过这个地址请求。
    apiBaseUrl: 'https://mealpilot-api-315434-10-1423427242.sh.run.tcloudbase.com/api',

    cloudEnvId: 'cloud1-d1gvr0mwv39a12cbd',
    cloudServiceName: 'mealpilot-api',
    cloudApiPrefix: '/api',

    allowDevLogin: false
  }
}

const activeEnvironment = 'production'

function validateEnvironmentConfig(environment, config) {
  if (!config) {
    throw new Error(`未找到环境配置：${environment}`)
  }

  if (environment === 'production') {
    const apiUrl = String(config.apiBaseUrl || '').trim()
    if (apiUrl && (!/^https:\/\//i.test(apiUrl) || /localhost|127\.0\.0\.1|replace-with-your-api|example\.com/i.test(apiUrl))) {
      throw new Error('生产环境 API 地址无效，禁止回退到开发环境')
    }

    if (config.allowDevLogin !== false) {
      throw new Error('生产环境禁止启用本地开发登录')
    }

    if (config.transport !== 'cloud') {
      throw new Error('生产环境必须使用 cloud transport')
    }

    if (!String(config.cloudEnvId || '').trim()) {
      throw new Error('生产环境缺少 cloudEnvId')
    }

    if (!String(config.cloudServiceName || '').trim()) {
      throw new Error('生产环境缺少 cloudServiceName')
    }

  }

  return config
}

const activeConfig = validateEnvironmentConfig(
  activeEnvironment,
  environments[activeEnvironment]
)

module.exports = {
  activeEnvironment,
  ...activeConfig,
  validateEnvironmentConfig
}
