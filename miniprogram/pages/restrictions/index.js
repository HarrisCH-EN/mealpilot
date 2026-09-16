const { request, resolveCoverUrl, requireAuthentication } = require('../../utils/api')

const app = getApp()

function getNavigationLayout() {
  const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const windowWidth = Number(windowInfo.windowWidth || 375)
  const statusBarHeight = Number(windowInfo.statusBarHeight || 20)
  let capsule = null
  try {
    capsule = wx.getMenuButtonBoundingClientRect()
  } catch (_error) {
    capsule = null
  }
  const rpxToPx = (rpx) => rpx * windowWidth / 750
  const capsuleTop = Number(capsule && capsule.top)
  const capsuleBottom = Number(capsule && capsule.bottom)
  const capsuleHeight = Number(capsule && capsule.height)
  const hasMenuButton = Number.isFinite(capsuleTop)
    && Number.isFinite(capsuleBottom)
    && Number.isFinite(capsuleHeight)
    && capsuleHeight > 0
    && capsuleBottom >= capsuleTop
  const navTop = (hasMenuButton ? capsuleBottom : statusBarHeight) + rpxToPx(12)
  const navigationHeight = rpxToPx(80)
  const navBottom = navTop + navigationHeight
  return {
    navStyle: `top:${navTop}px;height:${navigationHeight}px;padding:0 ${rpxToPx(36)}px;`,
    contentStyle: `padding-top:${navBottom + rpxToPx(20)}px;`
  }
}

Page({
  data: {
    navStyle: '',
    contentStyle: '',
    activeMembers: [],
    restrictionSections: [],
    restrictionTotal: 0,
    targetMemberId: 0,
    ingredients: [],
    filteredIngredients: [],
    ingredientKeyword: '',
    loading: true,
    restrictionLoading: false,
    pickerLoading: false,
    pickerOpen: false,
    savingIngredientId: 0,
    deletingMemberId: 0,
    deletingIngredientId: 0,
    error: ''
  },

  onLoad() {
    if (!requireAuthentication()) return
    this.setData(getNavigationLayout())
    this.load()
  },

  onShow() {
    if (!requireAuthentication()) return
    if (this._loaded) this.load()
  },

  async load() {
    if (this._loading) return
    this._loading = true
    this.setData({ loading: true, error: '' })
    try {
      const session = await request('/auth/me')
      const membership = session.membership || null
      if (!membership) throw new Error('请先创建或加入家庭')
      app.globalData.user = session.user || app.globalData.user
      app.globalData.membership = membership

      const family = await request('/families/current')
      const members = (family.members || []).filter((member) => member.status === undefined || member.status === 'active')
      const currentMemberId = Number(membership.member_id || membership.memberId)
      const scopedMembers = membership.role === 'owner'
        ? members
        : members.filter((member) => Number(member.id) === currentMemberId)
      const activeMembers = scopedMembers.map((member) => ({
        ...member,
        avatarUrl: resolveCoverUrl(member.avatarUrl),
        initial: this.memberInitial(member)
      }))
      if (!activeMembers.length) throw new Error('当前没有可管理的家庭成员')

      this.setData({ activeMembers })
      await this.loadRestrictions(activeMembers)
      this._loaded = true
    } catch (error) {
      this.setData({ error: error.message || '成员忌口加载失败', restrictionSections: [], restrictionTotal: 0 })
    } finally {
      this.setData({ loading: false })
      this._loading = false
    }
  },

  async loadRestrictions(members = this.data.activeMembers) {
    this.setData({ restrictionLoading: true, error: '' })
    try {
      const restrictionSections = await Promise.all(members.map(async (member) => {
        const restrictions = await request(`/family-members/${member.id}/restrictions`)
        return {
          memberId: Number(member.id),
          name: member.displayName || member.nickname || '家庭成员',
          avatarUrl: member.avatarUrl,
          initial: member.initial || this.memberInitial(member),
          role: member.role,
          restrictions: restrictions || []
        }
      }))
      const restrictionTotal = restrictionSections.reduce((total, section) => total + section.restrictions.length, 0)
      this.setData({ restrictionSections, restrictionTotal })
      return restrictionSections
    } catch (error) {
      this.setData({ error: error.message || '忌口加载失败', restrictionSections: [], restrictionTotal: 0 })
      throw error
    } finally {
      this.setData({ restrictionLoading: false })
    }
  },

  memberInitial(member) {
    return String((member && (member.displayName || member.nickname)) || '家').slice(0, 1)
  },

  async openAdd(event) {
    const memberId = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.memberId)
    const targetMember = this.data.activeMembers.find((member) => Number(member.id) === memberId)
    if (this.data.pickerLoading || this.data.savingIngredientId || !targetMember) return
    this.setData({ targetMemberId: memberId, pickerOpen: true, pickerLoading: true, ingredientKeyword: '', error: '' })
    try {
      const ingredients = await request('/ingredients')
      this.setData({ ingredients: ingredients || [], filteredIngredients: this.filterIngredients(ingredients || []) })
    } catch (error) {
      this.setData({ pickerOpen: false, error: error.message || '食材加载失败' })
    } finally {
      this.setData({ pickerLoading: false })
    }
  },

  closePicker() {
    if (!this.data.savingIngredientId) this.setData({ pickerOpen: false, ingredientKeyword: '', targetMemberId: 0 })
  },

  filterIngredients(ingredients) {
    const keyword = String(this.data.ingredientKeyword || '').trim().toLowerCase()
    const section = this.data.restrictionSections.find((item) => Number(item.memberId) === Number(this.data.targetMemberId))
    const restrictedIds = new Set((section ? section.restrictions : []).map((item) => Number(item.ingredientId)))
    return ingredients.filter((ingredient) => !restrictedIds.has(Number(ingredient.id)) && (!keyword || String(ingredient.name || '').toLowerCase().includes(keyword)))
  },

  changeIngredientKeyword(event) {
    const ingredientKeyword = String(event.detail.value || '')
    this.setData({ ingredientKeyword, filteredIngredients: this.filterIngredients(this.data.ingredients) })
  },

  async addRestriction(event) {
    const ingredientId = Number(event.currentTarget.dataset.id)
    const memberId = Number(this.data.targetMemberId)
    if (!ingredientId || !memberId || this.data.savingIngredientId) return
    this.setData({ savingIngredientId: ingredientId })
    try {
      const result = await request(`/family-members/${memberId}/restrictions`, 'POST', { ingredientId })
      wx.showToast({ title: result.status === 'already-present' ? '已经在忌口中' : '已添加忌口', icon: 'success' })
      this.setData({ pickerOpen: false, targetMemberId: 0 })
      await this.loadRestrictions(this.data.activeMembers)
    } catch (error) {
      this.setData({ error: error.message || '添加忌口失败' })
    } finally {
      this.setData({ savingIngredientId: 0 })
    }
  },

  removeRestriction(event) {
    const memberId = Number(event.currentTarget.dataset.memberId)
    const ingredientId = Number(event.currentTarget.dataset.id)
    const section = this.data.restrictionSections.find((item) => Number(item.memberId) === memberId)
    const ingredient = section && section.restrictions.find((item) => Number(item.ingredientId) === ingredientId)
    if (!ingredient || this.data.deletingIngredientId) return
    wx.showModal({
      title: '移除忌口',
      content: `确定移除对「${ingredient.ingredientName}」的忌口限制吗？`,
      cancelText: '取消',
      confirmText: '移除',
      success: async (result) => {
        if (!result.confirm || this.data.deletingIngredientId) return
        this.setData({ deletingMemberId: memberId, deletingIngredientId: ingredientId })
        try {
          await request(`/family-members/${memberId}/restrictions/${ingredientId}`, 'DELETE')
          wx.showToast({ title: '已移除', icon: 'success' })
          await this.loadRestrictions(this.data.activeMembers)
        } catch (error) {
          this.setData({ error: error.message || '移除忌口失败' })
        } finally {
          this.setData({ deletingMemberId: 0, deletingIngredientId: 0 })
        }
      }
    })
  },

  retry() {
    this.load()
  },

  back() {
    wx.navigateBack()
  },

  noop() {}
})
