const { request, ensureAuthenticated, resolveCoverUrl, requireAuthentication } = require('../../utils/api')
const { store } = require('../../utils/auth-runtime')

const TEMP_CACHE_KEYS = new Set(['recipeImageCache', 'menuPreviewCache', 'settingsCache'])

function getDisplayName(user) {
  return String((user && user.display_name) || '微信用户').trim() || '微信用户'
}

function isAdminRole(role) {
  return role === 'owner' || role === 'admin'
}

function getRoleLabel(membership) {
  if (!membership) return '未加入家庭'
  return isAdminRole(membership.role) ? '管理员' : '成员'
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
    userAvatarUrl: '',
    membership: null,
    userRoleLabel: '未加入家庭',
    canManageFamily: false,
    family: null,
    familyMemberCount: 0,
    insight: null,
    insightRangeDays: 7,
    insightExpanded: false,
    membersExpanded: false,
    recoverableFamilies: [],
    showRecoverySheet: false,
    familyActionLoading: false,
    loading: false,
    insightLoading: false,
    error: '',
    cacheLabel: ''
  },

  onLoad() {
    if (!requireAuthentication()) return
    this.setData({
      navStyle: getNavigationLayout()
    })
  },

  onShow() {
    if (!requireAuthentication()) return
    this.refresh()
  },

  async refresh() {
    this.setData({ loading: true, error: '', family: null, familyMemberCount: 0, insight: null, insightRangeDays: 7, insightExpanded: false, membersExpanded: false, cacheLabel: '', userRoleLabel: '未加入家庭', canManageFamily: false })
    try {
      const data = await ensureAuthenticated()
      const user = data.user || store.getState().user || {}
      const displayName = getDisplayName(user)
      this.setData({
        user,
        userInitial: displayName.slice(0, 1),
        userAvatarUrl: resolveCoverUrl(user.avatar_url),
        membership: data.membership || null,
        userRoleLabel: getRoleLabel(data.membership),
        canManageFamily: isAdminRole(data.membership && data.membership.role)
      })
      if (data.membership) {
        const family = await request('/families/current')
        const members = (family.members || []).map((member) => ({
          ...member,
          avatarUrl: resolveCoverUrl(member.avatarUrl),
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
      const session = store.getState()
      const user = session.user || {}
      const displayName = getDisplayName(user)
      const membership = session.membership || null
      this.setData({
        user,
        userInitial: displayName.slice(0, 1),
        userAvatarUrl: resolveCoverUrl(user.avatar_url),
        membership,
        userRoleLabel: getRoleLabel(membership),
        canManageFamily: isAdminRole(membership && membership.role),
        error: error.message || '账户信息加载失败'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  handleUserTap() {
    if (this.data.user && this.data.user.display_name) {
      wx.navigateTo({ url: '/pages/account-management/index' })
    }
  },

  async createFamily() {
    if (this.data.familyActionLoading) return
    this.setData({ familyActionLoading: true })
    try {
      const recoverableFamilies = await request('/families/recoverable')
      if (Array.isArray(recoverableFamilies) && recoverableFamilies.length) {
        this.setData({ recoverableFamilies, showRecoverySheet: true })
        return
      }
      this.openNewFamily()
    } catch (error) {
      wx.showToast({ title: error.message || '家庭信息加载失败', icon: 'none' })
    } finally {
      this.setData({ familyActionLoading: false })
    }
  },

  openNewFamily() {
    this.setData({ showRecoverySheet: false })
    wx.showModal({
      title: '创建家庭',
      editable: true,
      placeholderText: '例如：周末饭桌',
      success: async (result) => {
        const name = String(result.content || '').trim()
        if (!result.confirm || !name || this.data.familyActionLoading) return
        this.setData({ familyActionLoading: true })
        try {
          await request('/families', 'POST', { name })
          wx.showToast({ title: '家庭已创建', icon: 'success' })
          await this.refresh()
        } catch (error) {
          wx.showToast({ title: error.message || '创建失败', icon: 'none' })
        } finally {
          this.setData({ familyActionLoading: false })
        }
      }
    })
  },

  closeRecoverySheet() {
    if (this.data.familyActionLoading) return
    this.setData({ showRecoverySheet: false })
  },

  stopPropagation() {},

  async restoreFamily(event) {
    if (this.data.familyActionLoading) return
    const familyId = Number(event.currentTarget.dataset.familyId)
    if (!familyId) return
    this.setData({ familyActionLoading: true })
    try {
      await request(`/families/${familyId}/restore`, 'POST')
      this.setData({ showRecoverySheet: false, recoverableFamilies: [] })
      wx.showToast({ title: '家庭已恢复', icon: 'success' })
      await this.refresh()
    } catch (error) {
      wx.showToast({ title: error.message || '家庭恢复失败', icon: 'none' })
    } finally {
      this.setData({ familyActionLoading: false })
    }
  },

  joinFamily() {
    wx.showModal({
      title: '加入家庭',
      editable: true,
      placeholderText: '输入 6 位邀请码',
      success: async (result) => {
        const inviteCode = String(result.content || '').trim()
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

  async copyCode() {
    try {
      const result = await request('/families/current/invite-code')
      const inviteCode = result && result.inviteCode
      if (!inviteCode) {
        wx.showToast({ title: '暂时没有邀请码', icon: 'none' })
        return
      }
      wx.setClipboardData({
        data: inviteCode,
        success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
      })
    } catch (error) {
      wx.showToast({ title: error.message || '邀请码获取失败', icon: 'none' })
    }
  },

  showFamilyInfo() {
    if (!this.data.membership) {
      wx.showToast({ title: '暂时没有家庭信息', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/family-management/index' })
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
      this.setData({ insight: await request(`/insights?days=${this.data.insightRangeDays}`), insightExpanded: true })
    } catch (error) {
      wx.showToast({ title: error.message || '洞察加载失败', icon: 'none' })
    } finally {
      this.setData({ insightLoading: false })
    }
  },

  async selectInsightRange(event) {
    if (this.data.insightLoading) return
    const rangeDays = Number(event.currentTarget.dataset.days)
    if (![7, 30].includes(rangeDays)) return
    if (this.data.insight && this.data.insightRangeDays === rangeDays) return
    this.setData({ insightLoading: true, insightRangeDays: rangeDays })
    try {
      this.setData({ insight: await request(`/insights?days=${rangeDays}`), insightExpanded: true })
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
