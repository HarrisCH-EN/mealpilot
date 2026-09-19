const { request, uploadAvatar } = require('../../utils/api')
const { normalizeDisplayName, validateDisplayName } = require('../../utils/profile')
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

function getProfileDisplayName(user) {
  const value = String(user && user.display_name || '').trim()
  return value === '微信用户' ? '' : value
}

function getRemoteAvatarFileId(user) {
  return String(user && (user.avatarFileId !== undefined ? user.avatarFileId : user.avatar_url) || '').trim()
}

function getAvatarPreview(user) {
  return String(user && (user.avatarUrl || user.avatar_url) || '').trim()
}

Page({
  data: {
    navStyle: '',
    sessionState: 'loadingSession',
    displayName: '',
    avatarPath: '',
    avatarPreview: '',
    remoteAvatarFileId: '',
    submitting: false,
    error: ''
  },

  onLoad() {
    this.setData({ navStyle: getNavigationLayout() })
    this.loadSession()
  },

  async loadSession() {
    this.setData({ sessionState: 'loadingSession', error: '' })
    const token = app.globalData.token || wx.getStorageSync('token') || ''
    if (!token) {
      this.redirectToLogin()
      return
    }
    try {
      const session = await request('/auth/me')
      app.setSession(session)
      if (session.profileComplete === true) {
        this.redirectToHome()
        return
      }
      const user = session.user || {}
      this.setData({
        sessionState: 'editing',
        displayName: getProfileDisplayName(user),
        avatarPreview: getAvatarPreview(user),
        remoteAvatarFileId: getRemoteAvatarFileId(user)
      })
    } catch (error) {
      if (Number(error && error.status) === 401) {
        this.redirectToLogin()
        return
      }
      this.setData({ sessionState: 'editing', error: error.message || '加载资料失败，请重试' })
    }
  },

  onChooseAvatar(event) {
    const avatarPath = event && event.detail && event.detail.avatarUrl
    if (!avatarPath) return
    this.setData({ avatarPath, avatarPreview: avatarPath, error: '' })
  },

  onNicknameInput(event) {
    this.setData({ displayName: String(event && event.detail && event.detail.value || ''), error: '' })
  },

  onNicknameChange(event) {
    this.setData({ displayName: String(event && event.detail && event.detail.value || '').trim() })
  },

  async submitProfile() {
    if (this.data.submitting) return
    const displayName = normalizeDisplayName(this.data.displayName)
    if (!this.data.avatarPreview) {
      this.setData({ error: '请先选择头像' })
      return
    }
    const displayNameError = validateDisplayName(displayName)
    if (displayNameError) {
      this.setData({ error: displayNameError })
      return
    }

    this.setData({ submitting: true, error: '' })
    try {
      if (this.data.avatarPath && !this.data.remoteAvatarFileId) {
        const uploaded = await uploadAvatar(this.data.avatarPath)
        const uploadedUser = uploaded && uploaded.user
        this.setData({
          avatarPath: '',
          avatarPreview: getAvatarPreview(uploadedUser) || this.data.avatarPreview,
          remoteAvatarFileId: getRemoteAvatarFileId(uploadedUser)
        })
        if (uploadedUser) app.setSession({ user: uploadedUser })
      }

      await request('/auth/profile', 'PATCH', { displayName })
      const session = await request('/auth/me')
      if (session.profileComplete !== true) throw new Error('资料尚未完成，请确认头像和昵称后重试')
      app.setSession(session)
      this.redirectToHome()
    } catch (error) {
      this.setData({ submitting: false, sessionState: 'editing', error: error.message || '保存资料失败，请重试' })
    }
  },

  redirectToLogin() {
    if (this._redirecting) return
    this._redirecting = true
    wx.reLaunch({ url: '/pages/login/index' })
  },

  redirectToHome() {
    if (this._redirecting) return
    this._redirecting = true
    wx.reLaunch({ url: '/pages/recommend/index' })
  }
})
