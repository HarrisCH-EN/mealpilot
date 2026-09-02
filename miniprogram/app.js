App({
  globalData: { token: '', user: null, membership: null },
  onLaunch() { this.globalData.token = wx.getStorageSync('token') || '' },
  setSession(data) { this.globalData.token = data.token || ''; this.globalData.user = data.user || null; this.globalData.membership = data.membership || null; wx.setStorageSync('token', this.globalData.token) }
})
