const { wechatLogin, ensureAuthenticated, devLogin, nextRouteForSession } = require('../../utils/api')
const { allowDevLogin } = require('../../config')
const app = getApp()

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
  return `padding-top:${statusBarHeight + contentHeight + 16}px;`
}

function getRedirectUrl(value) {
  let redirect = ''
  try {
    redirect = decodeURIComponent(String(value || ''))
  } catch (_error) {
    redirect = ''
  }
  return /^\/pages\/[a-zA-Z0-9/_-]+$/.test(redirect) && redirect !== '/pages/login/index'
    ? redirect
    : '/pages/recommend/index'
}

Page({
  data: {
    navStyle: '',
    allowDevLogin,
    checkingSession: true,
    sessionChecked: false,
    loading: false,
    error: '',
    redirectUrl: '/pages/recommend/index'
  },

  onLoad(options = {}) {
    this._redirectUrl = getRedirectUrl(options.redirect)
  },

  onReady() {
    this.setData({
      navStyle: getNavigationLayout(),
      redirectUrl: this._redirectUrl || '/pages/recommend/index'
    })
    this.restoreSession()
  },

  async restoreSession() {
    const token = app.globalData.token || wx.getStorageSync('token') || ''
    if (!token) {
      this.setData({ checkingSession: false, sessionChecked: true })
      return
    }
    this.setData({ checkingSession: true, error: '' })
    try {
      const session = await ensureAuthenticated()
      this.setData({ checkingSession: false, sessionChecked: true })
      this.routeAfterAuthentication(session)
    } catch (error) {
      this.setData({ checkingSession: false, sessionChecked: true, error: error.message || '登录状态已失效，请重新登录' })
    }
  },

  async loginWithWechat() {
  console.log('[MealPilot Login] button tapped')

  if (this.data.loading) {
    console.log('[MealPilot Login] ignored because loading=true')
    return
  }

  await this.login(wechatLogin, '微信登录失败，请重试')
},

  async loginWithDev() {
    if (this.data.loading) return
    await this.login(devLogin, '本地开发登录失败，请重试')
  },

  async login(loginAction, fallbackMessage) {
    this.setData({ loading: true, error: '' })
    try {
      const session = await loginAction()
      const navigate = () => this.routeAfterAuthentication(session)
      this.setData({ loading: false })
      if (typeof wx.nextTick === 'function') wx.nextTick(navigate)
      else setTimeout(navigate, 100)
    } catch (error) {
      this.setData({ loading: false, error: error.message || fallbackMessage })
    }
  },

  routeAfterAuthentication(session) {
    const route = nextRouteForSession(session)
    if (route === '/pages/profile-setup/index') {
      if (this._redirecting) return
      this._redirecting = true
      wx.reLaunch({ url: route })
      return
    }
    this.redirectToHome()
  },

  redirectToHome() {
    if (this._redirecting) return
    this._redirecting = true
    wx.reLaunch({ url: this.data.redirectUrl || '/pages/recommend/index' })
  }
})
