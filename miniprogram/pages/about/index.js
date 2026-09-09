function getNavigationLayout() {
  const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const statusBarHeight = Number(windowInfo.statusBarHeight || 20)
  const windowWidth = Number(windowInfo.windowWidth || 375)
  let capsule = null
  try {
    capsule = wx.getMenuButtonBoundingClientRect()
  } catch (_error) { capsule = null }
  const menuButtonTop = Number(capsule && capsule.top)
  const menuButtonBottom = Number(capsule && capsule.bottom)
  const menuButtonHeight = Number(capsule && capsule.height)
  const hasMenuButton = Number.isFinite(menuButtonTop)
    && Number.isFinite(menuButtonBottom)
    && Number.isFinite(menuButtonHeight)
    && menuButtonHeight > 0
    && menuButtonBottom >= menuButtonTop
  const rpxToPx = (rpx) => rpx * windowWidth / 750
  const capsuleSpacing = rpxToPx(24)
  const navigationHeight = rpxToPx(80)
  const heroSpacing = rpxToPx(32)
  const navTop = (hasMenuButton ? menuButtonBottom : statusBarHeight) + capsuleSpacing
  const navBottom = navTop + navigationHeight
  const pageInset = rpxToPx(36)
  return {
    navStyle: `top:${navTop}px;height:${navigationHeight}px;padding:0 ${pageInset}px;`,
    contentStyle: `padding-top:${navBottom + heroSpacing}px;`
  }
}

Page({
  data: {
    versionLabel: '开发预览版',
    navStyle: '',
    contentStyle: ''
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
    this.setData({ versionLabel, ...getNavigationLayout() })
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  showVersion() {
    wx.showToast({ title: `当前为${this.data.versionLabel}`, icon: 'none' })
  },

})
