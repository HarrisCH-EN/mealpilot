const { request, resolveCoverUrl, requireAuthentication } = require('../../utils/api')
const { store } = require('../../utils/auth-runtime')

function isAdminRole(role) {
  return role === 'admin'
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
  const windowWidth = Number(windowInfo.windowWidth || 375)
  const rpxToPx = (rpx) => rpx * windowWidth / 750
  const navTop = navigationHeight + rpxToPx(16)
  const navHeight = rpxToPx(80)
  return {
    navStyle: `top:${navTop}px;height:${navHeight}px;padding:0 ${rpxToPx(36)}px;`,
    contentStyle: `padding-top:${navTop + navHeight + rpxToPx(32)}px;`
  }
}

Page({
  data: {
    navStyle: '',
    contentStyle: '',
    loading: true,
    actionLoading: false,
    error: '',
    family: null,
    membership: null,
    members: [],
    inviteCode: '',
    currentMemberId: 0,
    roleLabel: '未加入家庭',
    isAdmin: false
  },

  onLoad() {
    if (!requireAuthentication()) return
    this.setData(getNavigationLayout())
    this.loadFamily()
  },

  onShow() {
    if (!requireAuthentication()) return
    if (this.data.family || this.data.error) this.loadFamily()
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  async renameFamily() {
    if (!this.data.isAdmin || this.data.actionLoading) return
    const result = await new Promise(resolve => wx.showModal({ title: '修改家庭名称', editable: true, placeholderText: '请输入家庭名称', content: this.data.family && this.data.family.name || '', success: resolve }))
    if (!result.confirm || !result.content || !result.content.trim()) return
    this.setData({ actionLoading: true })
    try {
      await request('/families/current/name', 'PATCH', { name: result.content.trim() })
      await this.loadFamily()
    } catch (error) {
      wx.showToast({ title: error.message || '修改失败', icon: 'none' })
      this.setData({ actionLoading: false })
    }
  },

  async loadFamily() {
    this.setData({ loading: true, error: '', family: null, membership: null, members: [], inviteCode: '', currentMemberId: 0, roleLabel: '未加入家庭', isAdmin: false })
    try {
      const result = await request('/families/current')
      const membership = result.membership || (result.role ? result : null)
      if (!membership || !membership.role) {
        wx.switchTab({ url: '/pages/settings/index' })
        return
      }
      const family = {
        ...result,
        name: result.name || result.family_name || membership.family_name || '我的家庭'
      }
      const inviteResponse = await request('/families/current/invite-code')
      store.setSession({ membership })
      const members = (result.members || []).map(member => ({
        ...member,
        avatarUrl: resolveCoverUrl(member.avatarUrl),
        initial: String(member.displayName || member.nickname || '家').slice(0, 1),
        isAdminMember: member.role === 'admin',
        isCurrent: Number(member.id || member.memberId) === Number(membership.memberId || membership.member_id),
        roleLabel: member.role === 'admin' ? '管理员' : '成员'
      }))
      this.setData({
        loading: false,
        family,
        membership,
        members,
        inviteCode: inviteResponse && (inviteResponse.inviteCode || inviteResponse.invite_code) || '',
        currentMemberId: Number(membership.memberId || membership.member_id || 0),
        roleLabel: isAdminRole(membership.role) ? '管理员' : '成员',
        isAdmin: isAdminRole(membership.role)
      })
    } catch (error) {
      if (error && (error.status === 404 || error.statusCode === 404 || error.code === 'FAMILY_NOT_FOUND')) {
        wx.switchTab({ url: '/pages/settings/index' })
        return
      }
      this.setData({ loading: false, error: error.message || '家庭信息加载失败' })
    }
  },

  async refreshInviteCode() {
    if (!this.data.isAdmin || this.data.actionLoading) return
    const confirmed = await this.confirm('刷新邀请码', '旧邀请码将立即失效，确定刷新吗？', '刷新')
    if (!confirmed) return
    this.setData({ actionLoading: true })
    try {
      const result = await request('/families/current/invite-code/refresh', 'POST')
      this.setData({ inviteCode: result.inviteCode || '' })
      wx.showToast({ title: '邀请码已刷新', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error.message || '刷新失败', icon: 'none' })
    } finally {
      this.setData({ actionLoading: false })
    }
  },

  async leaveFamily() {
    if (this.data.actionLoading) return
    if (this.data.isAdmin) {
      wx.showToast({ title: '请先转移管理员身份', icon: 'none' })
      return
    }
    const confirmed = await this.confirm('退出家庭', '退出后需要使用新邀请码重新加入，确定退出吗？', '退出')
    if (!confirmed) return
    this.setData({ actionLoading: true })
    try {
      await request('/families/leave', 'POST')
      wx.showToast({ title: '已退出家庭', icon: 'success' })
      setTimeout(() => wx.navigateBack({ delta: 1 }), 300)
    } catch (error) {
      wx.showToast({ title: error.message || '退出失败', icon: 'none' })
      this.setData({ actionLoading: false })
    }
  },

  async disbandFamily() {
    if (!this.data.isAdmin || this.data.actionLoading) return
    const first = await this.confirm('解散家庭', '所有成员将退出家庭，家庭数据会保留 30 天供管理员恢复。', '继续')
    if (!first) return
    const final = await this.confirm('最终确认', '解散后家庭将立即不可访问，确定解散吗？', '确认解散')
    if (!final) return
    this.setData({ actionLoading: true })
    try {
      await request('/families/current', 'DELETE')
      wx.showToast({ title: '家庭已解散', icon: 'success' })
      setTimeout(() => wx.switchTab({ url: '/pages/settings/index' }), 300)
    } catch (error) {
      wx.showToast({ title: error.message || '解散失败', icon: 'none' })
      this.setData({ actionLoading: false })
    }
  },

  manageMember(event) {
    if (!this.data.isAdmin || this.data.actionLoading) return
    const memberId = Number(event.currentTarget.dataset.memberId)
    const member = this.data.members.find(item => Number(item.id || item.memberId) === memberId)
    if (!member || member.isAdminMember || member.isCurrent) return
    wx.showActionSheet({
      itemList: ['转移管理员', '移除成员'],
      success: result => {
        if (result.tapIndex === 0) this.transferAdmin(memberId, member.name || '该成员')
        if (result.tapIndex === 1) this.removeMember(memberId, member.name || '该成员')
      }
    })
  },

  async transferAdmin(memberId, memberName) {
    const confirmed = await this.confirm('转移管理员', `${memberName}将成为管理员，你将变为成员。转移后你可以退出或注销账号。`, '确认转移')
    if (!confirmed || this.data.actionLoading) return
    this.setData({ actionLoading: true })
    try {
      await request('/families/current/transfer-admin', 'POST', { memberId })
      wx.showToast({ title: '管理员已转移', icon: 'success' })
      await this.loadFamily()
    } catch (error) {
      wx.showToast({ title: error.message || '转移失败', icon: 'none' })
      this.setData({ actionLoading: false })
    }
  },

  async removeMember(memberId, memberName) {
    const confirmed = await this.confirm('移除成员', `确定将${memberName}移出家庭吗？`, '移除')
    if (!confirmed || this.data.actionLoading) return
    this.setData({ actionLoading: true })
    try {
      await request(`/families/current/members/${memberId}`, 'DELETE')
      wx.showToast({ title: '成员已移除', icon: 'success' })
      await this.loadFamily()
    } catch (error) {
      wx.showToast({ title: error.message || '移除失败', icon: 'none' })
      this.setData({ actionLoading: false })
    }
  },

  confirm(title, content, confirmText) {
    return new Promise(resolve => wx.showModal({ title, content, confirmText, success: result => resolve(Boolean(result.confirm)) }))
  },

  copyInviteCode() {
    if (!this.data.inviteCode) return
    wx.setClipboardData({ data: this.data.inviteCode, success: () => wx.showToast({ title: '已复制', icon: 'success' }) })
  }
})
