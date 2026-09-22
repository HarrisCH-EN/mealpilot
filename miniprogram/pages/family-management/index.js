const { request, ensureAuthenticated, resolveCoverUrl, requireAuthentication } = require('../../utils/api')
const { store } = require('../../utils/auth-runtime')

function isAdminRole(role) {
  return role === 'owner' || role === 'admin'
}

function getRoleLabel(role) {
  return isAdminRole(role) ? '管理员' : '成员'
}

function getNavigationLayout() {
  const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const statusBarHeight = Number(windowInfo.statusBarHeight || 20)
  const windowWidth = Number(windowInfo.windowWidth || 375)
  let capsule = null
  try {
    capsule = wx.getMenuButtonBoundingClientRect()
  } catch (_error) { capsule = null }
  const capsuleBottom = Number(capsule && capsule.bottom)
  const hasCapsule = Number.isFinite(capsuleBottom) && capsuleBottom > 0
  const rpxToPx = (rpx) => rpx * windowWidth / 750
  const navTop = (hasCapsule ? capsuleBottom : statusBarHeight) + rpxToPx(24)
  const navHeight = rpxToPx(80)
  return {
    navStyle: `top:${navTop}px;height:${navHeight}px;padding:0 ${rpxToPx(36)}px;`,
    contentStyle: `padding-top:${navTop + navHeight + rpxToPx(32)}px;`
  }
}

function memberInitial(member) {
  return String(member.displayName || member.nickname || '家').trim().slice(0, 1) || '家'
}

Page({
  data: {
    navStyle: '',
    contentStyle: '',
    membership: null,
    family: null,
    members: [],
    inviteCode: '',
    currentMemberId: 0,
    roleLabel: '未加入家庭',
    isAdmin: false,
    isOwner: false,
    loading: false,
    actionLoading: false,
    error: ''
  },

  onLoad() {
    if (!requireAuthentication()) return
    this.setData(getNavigationLayout())
  },

  onShow() {
    if (!requireAuthentication()) return
    this.loadFamily()
  },

  async loadFamily() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '', membership: null, family: null, members: [], inviteCode: '', currentMemberId: 0, roleLabel: '未加入家庭', isAdmin: false, isOwner: false })
    try {
      const session = await ensureAuthenticated()
      const membership = session.membership || null
      if (!membership) {
        wx.switchTab({ url: '/pages/settings/index' })
        return
      }
      const family = await request('/families/current')
      const currentMemberId = Number(membership.member_id || 0)
      const members = (family.members || []).map((member) => ({
        ...member,
        avatarUrl: resolveCoverUrl(member.avatarUrl),
        initial: memberInitial(member),
        roleLabel: getRoleLabel(member.role),
        isOwner: member.role === 'owner',
        isCurrent: Number(member.id) === currentMemberId
      }))
      const isAdmin = isAdminRole(membership.role)
      const invite = await request('/families/current/invite-code')
      const inviteCode = String((invite && invite.inviteCode) || '').trim()
      const familyName = family.name || family.family_name || membership.family_name || '我的家庭'
      const syncedMembership = { ...membership, family_name: familyName }
      store.setSession({ membership: syncedMembership })
      this.setData({
        membership: syncedMembership,
        family: { ...family, name: familyName },
        members,
        inviteCode,
        currentMemberId,
        roleLabel: getRoleLabel(membership.role),
        isAdmin,
        isOwner: membership.role === 'owner'
      })
    } catch (error) {
      const membership = store.getState().membership || null
      this.setData({
        membership,
        roleLabel: membership ? getRoleLabel(membership.role) : '未加入家庭',
        isAdmin: Boolean(membership && isAdminRole(membership.role)),
        isOwner: Boolean(membership && membership.role === 'owner'),
        error: error.message || '家庭信息加载失败'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  async copyInviteCode() {
    if (!this.data.inviteCode) {
      wx.showToast({ title: '暂时没有邀请码', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
    })
  },

  refreshInviteCode() {
    if (!this.data.isAdmin || this.data.actionLoading || !this.data.membership) return
    wx.showModal({
      title: '刷新邀请码',
      content: '刷新后旧邀请码会立即失效，已复制旧码的人需要使用新码加入。确定刷新吗？',
      confirmText: '确认刷新',
      confirmColor: '#ff4f7b',
      success: async (result) => {
        if (!result.confirm) return
        this.setData({ actionLoading: true })
        try {
          const responseData = await request('/families/current/invite-code/refresh', 'POST')
          const inviteCode = String((responseData && responseData.inviteCode) || '').trim()
          if (!/^[0-9A-Za-z]{6}$/.test(inviteCode)) throw new Error('邀请码刷新失败')
          this.setData({ inviteCode })
          wx.showToast({ title: '邀请码已刷新', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: error.message || '邀请码刷新失败', icon: 'none' })
        } finally {
          this.setData({ actionLoading: false })
        }
      }
    })
  },

  renameFamily() {
    if (!this.data.isAdmin || this.data.actionLoading || !this.data.family) return
    wx.showModal({
      title: '修改家庭名称',
      editable: true,
      content: this.data.family.name || '',
      placeholderText: '输入家庭名称',
      success: async (result) => {
        const name = String(result.content || '').trim()
        if (!result.confirm || !name) return
        if (name.length > 40) {
          wx.showToast({ title: '家庭名称不能超过40个字符', icon: 'none' })
          return
        }
        this.setData({ actionLoading: true })
        try {
          await request('/families/current/name', 'PATCH', { name })
          const membership = store.getState().membership || this.data.membership
          if (membership) store.setSession({ membership: { ...membership, family_name: name } })
          wx.showToast({ title: '家庭名称已更新', icon: 'success' })
          await this.loadFamily()
        } catch (error) {
          wx.showToast({ title: error.message || '名称修改失败', icon: 'none' })
        } finally {
          this.setData({ actionLoading: false })
        }
      }
    })
  },

  leaveFamily() {
    if (this.data.isOwner) {
      wx.showToast({ title: '创建者不能直接退出家庭', icon: 'none' })
      return
    }
    if (!this.data.membership || this.data.actionLoading) return
    wx.showModal({
      title: '退出家庭',
      content: '退出后将不能继续查看这个家庭的菜单和成员信息，确定退出吗？',
      confirmText: '退出家庭',
      confirmColor: '#ff4f7b',
      success: async (result) => {
        if (!result.confirm) return
        this.setData({ actionLoading: true })
        try {
          await request('/families/leave', 'POST')
          store.setSession({ membership: null })
          wx.showToast({ title: '已退出家庭', icon: 'success' })
          wx.navigateBack({ delta: 1 })
        } catch (error) {
          wx.showToast({ title: error.message || '退出失败', icon: 'none' })
        } finally {
          this.setData({ actionLoading: false })
        }
      }
    })
  },

  disbandFamily() {
    if (!this.data.isAdmin || !this.data.membership || this.data.actionLoading) return
    wx.showModal({
      title: '解散家庭',
      content: '所有成员将退出家庭，家庭数据会保留 30 天供创建者恢复。',
      confirmText: '继续',
      confirmColor: '#ff4f7b',
      success: (first) => {
        if (!first.confirm) return
        wx.showModal({
          title: '最终确认',
          content: '确认解散当前家庭吗？30 天后未恢复的数据将永久删除。',
          cancelText: '返回',
          confirmText: '确认解散',
          confirmColor: '#ff4f7b',
          success: async (second) => {
            if (!second.confirm || this.data.actionLoading) return
            this.setData({ actionLoading: true })
            try {
              await request('/families/current', 'DELETE')
              store.setSession({ membership: null })
              wx.showToast({ title: '家庭已解散', icon: 'success' })
              wx.switchTab({ url: '/pages/settings/index' })
            } catch (error) {
              wx.showToast({ title: error.message || '家庭解散失败', icon: 'none' })
            } finally {
              this.setData({ actionLoading: false })
            }
          }
        })
      }
    })
  },

  manageMember(event) {
    if (!this.data.isAdmin || this.data.actionLoading) return
    const memberId = Number(event.currentTarget.dataset.memberId)
    const member = this.data.members.find((item) => Number(item.id) === memberId)
    if (!member || member.isOwner || member.isCurrent) return
    const nextRole = member.role === 'admin' ? 'member' : 'admin'
    const transferActionOffset = this.data.isOwner ? 1 : 0
    const itemList = this.data.isOwner
      ? ['移交创建者身份', nextRole === 'admin' ? '设为管理员' : '取消管理员', '移除成员']
      : [nextRole === 'admin' ? '设为管理员' : '取消管理员', '移除成员']
    wx.showActionSheet({
      itemList,
      success: (result) => {
        if (this.data.isOwner && result.tapIndex === 0) this.transferOwnership(memberId)
        if (result.tapIndex === transferActionOffset) this.setMemberRole(memberId, nextRole)
        if (result.tapIndex === transferActionOffset + 1) this.removeMember(memberId)
      }
    })
  },

  transferOwnership(memberId) {
    wx.showModal({
      title: '移交创建者身份',
      content: '移交后你将变为普通成员，并可退出家庭。确定继续吗？',
      confirmText: '确认移交',
      success: async (result) => {
        if (!result.confirm) return
        this.setData({ actionLoading: true })
        try {
          await request('/families/current/transfer-ownership', 'POST', { memberId })
          wx.showToast({ title: '创建者身份已移交', icon: 'success' })
          await this.loadFamily()
        } catch (error) {
          wx.showToast({ title: error.message || '移交失败', icon: 'none' })
        } finally {
          this.setData({ actionLoading: false })
        }
      }
    })
  },

  async setMemberRole(memberId, role) {
    this.setData({ actionLoading: true })
    try {
      await request(`/families/current/members/${memberId}/role`, 'PATCH', { role })
      wx.showToast({ title: role === 'admin' ? '已设为管理员' : '已取消管理员', icon: 'success' })
      await this.loadFamily()
    } catch (error) {
      wx.showToast({ title: error.message || '权限更新失败', icon: 'none' })
    } finally {
      this.setData({ actionLoading: false })
    }
  },

  removeMember(memberId) {
    wx.showModal({
      title: '移除成员',
      content: '移除后，对方将不能继续查看这个家庭的信息，确定移除吗？',
      confirmText: '移除',
      confirmColor: '#ff4f7b',
      success: async (result) => {
        if (!result.confirm) return
        this.setData({ actionLoading: true })
        try {
          await request(`/families/current/members/${memberId}`, 'DELETE')
          wx.showToast({ title: '成员已移除', icon: 'success' })
          await this.loadFamily()
        } catch (error) {
          wx.showToast({ title: error.message || '移除失败', icon: 'none' })
        } finally {
          this.setData({ actionLoading: false })
        }
      }
    })
  }
})
