function getNavigationLayout() {
  const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const statusBarHeight = Number(windowInfo.statusBarHeight || 20)
  let capsule = null
  try {
    capsule = wx.getMenuButtonBoundingClientRect()
  } catch (_error) {
    capsule = null
  }
  const contentHeight = capsule && capsule.height
    ? capsule.height + Math.max(0, capsule.top - statusBarHeight) * 2
    : 44
  const navigationHeight = statusBarHeight + contentHeight
  return `height:${navigationHeight}px;padding-top:${statusBarHeight}px;`
}

Page({
  data: {
    versionLabel: '开发预览版',
    navStyle: ''
  },

  onLoad() {
    let versionLabel = '开发预览版'
    try {
      const account = wx.getAccountInfoSync()
      const miniProgram = account && account.miniProgram
      if (miniProgram) {
        if (miniProgram.envVersion === 'release') versionLabel = miniProgram.version || '正式版'
        if (miniProgram.envVersion === 'trial') versionLabel = '体验版'
        if (miniProgram.envVersion === 'develop') versionLabel = '开发版'
      }
    } catch (error) {
      console.warn('读取小程序版本失败', error)
    }
    this.setData({ versionLabel, navStyle: getNavigationLayout() })
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  showVersion() {
    wx.showToast({ title: `当前为${this.data.versionLabel}`, icon: 'none' })
  },

  showUnavailable() {
    wx.showToast({ title: '功能即将开放', icon: 'none' })
  }
})
