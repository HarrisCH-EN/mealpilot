const { allowDevLogin } = require('../../config')
const { request, uploadAvatar, resolveCoverUrl, requireAuthentication } = require('../../utils/api')
const { authService, store } = require('../../utils/auth-runtime')
const { normalizeDisplayName, validateDisplayName } = require('../../utils/profile')

function getDisplayName(user) {
  return String((user && user.display_name) || '微信用户').trim() || '微信用户'
}

function getRoleLabel(membership) {
  if (!membership) return '未加入家庭'
  return membership.role === 'owner' || membership.role === 'admin' ? '管理员' : '成员'
}

function getAvatarUrl(user) {
  return resolveCoverUrl(user && user.avatar_url)
}

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
  return `padding-top:${navigationHeight + 16}px;`
}

Page({
  data: {
    navStyle: '',
    user: {},
    userInitial: '微',
    avatarUrl: '',
    loginType: '微信登录用户',
    membership: null,
    roleLabel: '未加入家庭',
    allowDevLogin,
    loggingOut: false,
    profileUpdating: false
  },

  onLoad() {
    if (!requireAuthentication()) return
    const session = store.getState()
    const user = session.user || {}
    const membership = session.membership || null
    const displayName = getDisplayName(user)
    this.setData({
      navStyle: getNavigationLayout(),
      user,
      userInitial: displayName.slice(0, 1),
      avatarUrl: getAvatarUrl(user),
      membership,
      roleLabel: getRoleLabel(membership),
      loginType: allowDevLogin && user.openid === 'demo-owner' ? '本地开发身份' : '微信登录用户'
    })
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  editProfile() {
    if (this.data.profileUpdating) return
    wx.showActionSheet({
      itemList: ['修改头像', '修改名字'],
      success: (result) => {
        if (result.tapIndex === 0) this.editAvatar()
        if (result.tapIndex === 1) this.editDisplayName()
      }
    })
  },

  editAvatar() {
    if (this.data.profileUpdating) return
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (result) => this.chooseAvatar(result.tapIndex === 0 ? ['camera'] : ['album'])
    })
  },

  chooseAvatar(sourceType) {
    const options = {
      count: 1,
      sizeType: ['compressed'],
      sourceType,
      success: (result) => {
        const filePath = result && result.tempFiles && result.tempFiles[0]
          ? result.tempFiles[0].tempFilePath
          : result && result.tempFilePaths && result.tempFilePaths[0]
        if (filePath) return this.saveAvatar(filePath)
      }
    }
    if (typeof wx.chooseMedia === 'function') {
      wx.chooseMedia({ ...options, mediaType: ['image'] })
      return
    }
    if (typeof wx.chooseImage === 'function') {
      wx.chooseImage(options)
      return
    }
    wx.showToast({ title: '当前微信版本不支持选择图片', icon: 'none' })
  },

  async saveAvatar(filePath) {
    if (this.data.profileUpdating) return
    this.setData({ profileUpdating: true })
    try {
      const data = await uploadAvatar(filePath)
      this.applyUser(data && data.user)
      wx.showToast({ title: '头像已更新', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error.message || '头像更新失败', icon: 'none' })
    } finally {
      this.setData({ profileUpdating: false })
    }
  },

  editDisplayName() {
    if (this.data.profileUpdating) return
    wx.showModal({
      title: '修改名字',
      editable: true,
      content: getDisplayName(this.data.user),
      placeholderText: '请输入名字',
      confirmText: '保存',
      success: async (result) => {
        const displayName = normalizeDisplayName(result.content)
        if (!result.confirm) return
        const validationError = validateDisplayName(displayName)
        if (validationError) {
          wx.showToast({ title: validationError.replace(/^请先填写/, '').replace('昵称', '名字'), icon: 'none' })
          return
        }
        this.setData({ profileUpdating: true })
        try {
          const data = await request('/auth/profile', 'PATCH', { displayName })
          this.applyUser(data && data.user)
          wx.showToast({ title: '名字已更新', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: error.message || '名字更新失败', icon: 'none' })
        } finally {
          this.setData({ profileUpdating: false })
        }
      }
    })
  },

  applyUser(user) {
    const nextUser = user || {}
    const displayName = getDisplayName(nextUser)
    store.setSession({ user: nextUser })
    this.setData({
      user: nextUser,
      userInitial: displayName.slice(0, 1),
      avatarUrl: getAvatarUrl(nextUser)
    })
  },

  logout() {
    if (this.data.loggingOut) return
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新登录才能查看家庭数据。',
      confirmText: '退出登录',
      confirmColor: '#FF4F7B',
      success: (result) => {
        if (!result.confirm) return
        this.setData({ loggingOut: true })
        authService.logout().then(() => wx.reLaunch({ url: '/pages/login/index' }))
      }
    })
  }
})
