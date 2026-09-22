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
  }
})
