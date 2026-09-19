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
  },
  setAuthState(patch = {}) { Object.assign(this.globalData, patch) },
  setSession(data = {}) {
    if (Object.prototype.hasOwnProperty.call(data, 'token')) {
      this.globalData.token = data.token || ''
      wx.setStorageSync('token', this.globalData.token)
    }
    if (Object.prototype.hasOwnProperty.call(data, 'user')) this.globalData.user = data.user || null
    if (Object.prototype.hasOwnProperty.call(data, 'membership')) this.globalData.membership = data.membership || null
    if (Object.prototype.hasOwnProperty.call(data, 'profileComplete')) this.globalData.profileComplete = data.profileComplete === true
  },
  clearSession() {
    this.globalData.token = ''
    this.globalData.user = null
    this.globalData.membership = null
    this.globalData.profileComplete = false
    this.globalData.authReady = false
    this.globalData.authenticating = false
    this.globalData.authError = null
    wx.removeStorageSync('token')
  }
})
