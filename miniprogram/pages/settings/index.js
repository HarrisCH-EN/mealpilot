const { request, ensureAuthenticated, devLogin } = require('../../utils/api')
const { allowDevLogin } = require('../../config')
const app = getApp()

const TEMP_CACHE_KEYS = new Set(['recipeImageCache', 'menuPreviewCache', 'settingsCache'])

function getDisplayName(user) {
  return String((user && user.display_name) || '微信用户').trim() || '微信用户'
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
    membership: null,
    family: null,
    familyMemberCount: 0,
    insight: null,
    insightExpanded: false,
    membersExpanded: false,
    loading: false,
    insightLoading: false,
    error: '',
    cacheLabel: '',
    allowDevLogin
  },

  onLoad() {
    this.setData({ navStyle: getNavigationLayout() })
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    this.setData({ loading: true, error: '', family: null, familyMemberCount: 0, insight: null, insightExpanded: false, membersExpanded: false, cacheLabel: '' })
    try {
      const data = await ensureAuthenticated()
      const user = data.user || app.globalData.user || {}
      const displayName = getDisplayName(user)
      this.setData({
        user,
        userInitial: displayName.slice(0, 1),
        membership: data.membership || null
      })
      if (data.membership) {
        const family = await request('/families/current')
        const members = (family.members || []).map((member) => ({
          ...member,
          initial: String(member.displayName || member.nickname || '家').slice(0, 1)
        }))
        this.setData({
          family: {
            ...family,
            members
          },
          familyMemberCount: members.length
        })
      }
    } catch (error) {
      const user = app.globalData.user || {}
      const displayName = getDisplayName(user)
      this.setData({ user, userInitial: displayName.slice(0, 1), error: error.message || '账户信息加载失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  handleUserTap() {
    if (this.data.user && this.data.user.display_name) {
      wx.showToast({ title: this.data.allowDevLogin ? '本地开发身份' : '微信登录用户', icon: 'none' })
      return
    }
    this.retryLogin()
  },

  async retryLogin() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      await ensureAuthenticated({ force: true })
      await this.refresh()
    } catch (error) {
      this.setData({ loading: false, error: error.message || '登录失败，请重试' })
    }
  },

  async login() {
    try {
      await devLogin()
      wx.showToast({ title: '本地开发登录成功', icon: 'success' })
      this.refresh()
    } catch (error) {
      wx.showToast({ title: error.message || '登录失败', icon: 'none' })
    }
  },

  createFamily() {
    wx.showModal({
      title: '创建家庭',
      editable: true,
      placeholderText: '例如：周末饭桌',
      success: async (result) => {
        const name = String(result.content || '').trim()
        if (!result.confirm || !name) return
        try {
          await request('/families', 'POST', { name })
          wx.showToast({ title: '家庭已创建', icon: 'success' })
          this.refresh()
        } catch (error) {
          wx.showToast({ title: error.message || '创建失败', icon: 'none' })
        }
      }
    })
  },

  joinFamily() {
    wx.showModal({
      title: '加入家庭',
      editable: true,
      placeholderText: '输入 6 位邀请码',
      success: async (result) => {
        const inviteCode = String(result.content || '').trim().toUpperCase()
        if (!result.confirm || !inviteCode) return
        try {
          await request('/families/join', 'POST', { inviteCode })
          wx.showToast({ title: '加入成功', icon: 'success' })
          this.refresh()
        } catch (error) {
          wx.showToast({ title: error.message || '加入失败', icon: 'none' })
        }
      }
    })
  },

  copyCode() {
    const inviteCode = (this.data.membership && this.data.membership.invite_code) || (this.data.family && this.data.family.invite_code)
    if (!inviteCode) {
      wx.showToast({ title: '暂时没有邀请码', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: inviteCode,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
    })
  },

  showFamilyInfo() {
    if (!this.data.membership) {
      wx.showToast({ title: '暂时没有家庭信息', icon: 'none' })
      return
    }
    const membership = this.data.membership
    const familyName = membership.family_name || (this.data.family && this.data.family.name) || '家庭信息'
    const role = membership.role === 'owner' ? '家庭创建者' : '家庭成员'
    wx.showModal({
      title: familyName,
      content: `${role}\n${this.data.familyMemberCount} 位成员`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  toggleMembers() {
    if (!this.data.family || !this.data.family.members.length) {
      wx.showToast({ title: '当前还没有家庭成员', icon: 'none' })
      return
    }
    this.setData({ membersExpanded: !this.data.membersExpanded })
  },

  async insights() {
    if (this.data.insightLoading || !this.data.membership) return
    if (this.data.insight) {
      this.setData({ insightExpanded: !this.data.insightExpanded })
      return
    }
    this.setData({ insightLoading: true })
    try {
      this.setData({ insight: await request('/insights'), insightExpanded: true })
    } catch (error) {
      wx.showToast({ title: error.message || '洞察加载失败', icon: 'none' })
    } finally {
      this.setData({ insightLoading: false })
    }
  },

  goRestrictions() {
    if (!this.data.membership) {
      wx.showToast({ title: '请先创建或加入家庭', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/restrictions/index' })
  },

  goTagManagement() {
    if (!this.data.membership) {
      wx.showToast({ title: '请先创建或加入家庭', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/tag-management/index' })
  },

  goAbout() {
    wx.navigateTo({ url: '/pages/about/index' })
  },

  clearCache() {
    let removableKeys = []
    try {
      const storage = wx.getStorageInfoSync()
      removableKeys = (storage.keys || []).filter((key) => TEMP_CACHE_KEYS.has(key))
    } catch (error) {
      removableKeys = []
    }
    if (!removableKeys.length) {
      wx.showToast({ title: '没有可清理的缓存', icon: 'none' })
      return
    }
    wx.showModal({
      title: '清理缓存',
      content: `将清理 ${removableKeys.length} 项临时缓存，不会影响登录、家庭和菜单数据。`,
      success: (result) => {
        if (!result.confirm) return
        removableKeys.forEach((key) => wx.removeStorageSync(key))
        wx.showToast({ title: '缓存已清理', icon: 'success' })
      }
    })
  }
})
