const LOGIN_PAGE = '/pages/login/index'

function getCurrentRoute() {
  try {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    return pages.length ? `/${String(pages[pages.length - 1].route || '')}` : ''
  } catch (_error) {
    return ''
  }
}

function relaunchIfNeeded(url) {
  if (typeof wx.reLaunch !== 'function' || getCurrentRoute() === url) return
  wx.reLaunch({ url })
}

App({
  globalData: {
    token: '',
    user: null,
    membership: null,
    authReady: false,
    authenticating: false,
    authError: null,
    initialRouteResolved: false
  },
  onLaunch() {
    this.globalData.token = wx.getStorageSync('token') || ''
  },
  onShow() {
    if (this.globalData.initialRouteResolved) return
    this.globalData.initialRouteResolved = true
    relaunchIfNeeded(LOGIN_PAGE)
  },
  setAuthState(patch = {}) { Object.assign(this.globalData, patch) },
  setSession(data = {}) {
    if (Object.prototype.hasOwnProperty.call(data, 'token')) {
      this.globalData.token = data.token || ''
      wx.setStorageSync('token', this.globalData.token)
    }
    if (Object.prototype.hasOwnProperty.call(data, 'user')) this.globalData.user = data.user || null
    if (Object.prototype.hasOwnProperty.call(data, 'membership')) this.globalData.membership = data.membership || null
  },
  clearSession() {
    this.globalData.token = ''
    this.globalData.user = null
    this.globalData.membership = null
    this.globalData.authReady = false
    this.globalData.authenticating = false
    this.globalData.authError = null
    wx.removeStorageSync('token')
  }
})
