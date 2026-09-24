const {
  transport,
  cloudEnvId
} = require('./config')

App({
  globalData: {
    token: '',
    user: null,
    membership: null,
    profileComplete: false,
    authReady: false,
    authenticating: false,
    authError: null,
    initialRouteResolved: false
  },
  onLaunch() {
    this.globalData.token = wx.getStorageSync('token') || ''

    if (transport !== 'cloud') return
    if (!wx.cloud || typeof wx.cloud.init !== 'function') {
      console.error('[MealPilot] 当前微信基础库不支持云能力')
      return
    }

    try {
      wx.cloud.init({ env: cloudEnvId })
    } catch (error) {
      console.warn('[MealPilot] 云能力初始化失败', { code: error && error.code || 'CLOUD_INIT_FAILED' })
    }
  }
})
