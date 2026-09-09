const { request } = require('../../utils/api')

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
    selectedMemberId: 0,
    selectedMember: null,
    selectedMemberInitial: '家',
    restrictions: [],
    ingredients: [],
    filteredIngredients: [],
    ingredientKeyword: '',
    loading: true,
    restrictionLoading: false,
    pickerLoading: false,
    pickerOpen: false,
    savingIngredientId: 0,
    deletingIngredientId: 0,
    error: ''
  },

  onLoad() {
    this.setData(getNavigationLayout())
    this.load()
  },

  onShow() {
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
      const activeMembers = scopedMembers.map((member) => ({ ...member, initial: this.memberInitial(member) }))
      const selectedMemberId = this.data.selectedMemberId && activeMembers.some((member) => Number(member.id) === this.data.selectedMemberId)
        ? this.data.selectedMemberId
        : Number(activeMembers[0]?.id || 0)
      const selectedMember = activeMembers.find((member) => Number(member.id) === selectedMemberId) || null
      this.setData({ activeMembers, selectedMemberId, selectedMember, selectedMemberInitial: this.memberInitial(selectedMember) })
      if (!selectedMemberId) throw new Error('当前没有可管理的家庭成员')
      await this.loadRestrictions(selectedMemberId)
      this._loaded = true
    } catch (error) {
      this.setData({ error: error.message || '成员忌口加载失败', restrictions: [] })
    } finally {
      this.setData({ loading: false })
      this._loading = false
    }
  },

  async loadRestrictions(memberId) {
    this.setData({ restrictionLoading: true, error: '' })
    try {
      const restrictions = await request(`/family-members/${memberId}/restrictions`)
      this.setData({ restrictions: restrictions || [] })
    } catch (error) {
      this.setData({ error: error.message || '忌口加载失败', restrictions: [] })
    } finally {
      this.setData({ restrictionLoading: false })
    }
  },

  selectMember(event) {
    const memberId = Number(event.currentTarget.dataset.id)
    const selectedMember = this.data.activeMembers.find((member) => Number(member.id) === memberId)
    if (!selectedMember || memberId === this.data.selectedMemberId) return
    this.setData({ selectedMemberId: memberId, selectedMember, selectedMemberInitial: this.memberInitial(selectedMember) }, () => this.loadRestrictions(memberId))
  },

  memberInitial(member) {
    return String((member && (member.nickname || member.displayName)) || '家').slice(0, 1)
  },

  async openAdd() {
    if (this.data.pickerLoading || this.data.savingIngredientId || !this.data.selectedMemberId) return
    this.setData({ pickerOpen: true, pickerLoading: true, ingredientKeyword: '' })
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
    if (!this.data.savingIngredientId) this.setData({ pickerOpen: false, ingredientKeyword: '' })
  },

  filterIngredients(ingredients) {
    const keyword = String(this.data.ingredientKeyword || '').trim().toLowerCase()
    const restrictedIds = new Set((this.data.restrictions || []).map((item) => Number(item.ingredientId)))
    return ingredients.filter((ingredient) => !restrictedIds.has(Number(ingredient.id)) && (!keyword || String(ingredient.name || '').toLowerCase().includes(keyword)))
  },

  changeIngredientKeyword(event) {
    const ingredientKeyword = String(event.detail.value || '')
    this.setData({ ingredientKeyword, filteredIngredients: this.filterIngredients(this.data.ingredients) })
  },

  async addRestriction(event) {
    const ingredientId = Number(event.currentTarget.dataset.id)
    if (!ingredientId || this.data.savingIngredientId) return
    this.setData({ savingIngredientId: ingredientId })
    try {
      const result = await request(`/family-members/${this.data.selectedMemberId}/restrictions`, 'POST', { ingredientId })
      wx.showToast({ title: result.status === 'already-present' ? '已经在忌口中' : '已添加忌口', icon: 'success' })
      this.setData({ pickerOpen: false })
      await this.loadRestrictions(this.data.selectedMemberId)
    } catch (error) {
      this.setData({ error: error.message || '添加忌口失败' })
    } finally {
      this.setData({ savingIngredientId: 0 })
    }
  },

  removeRestriction(event) {
    const ingredientId = Number(event.currentTarget.dataset.id)
    const ingredient = this.data.restrictions.find((item) => Number(item.ingredientId) === ingredientId)
    if (!ingredient || this.data.deletingIngredientId) return
    wx.showModal({
      title: '移除忌口',
      content: `确定移除对「${ingredient.ingredientName}」的忌口限制吗？`,
      cancelText: '取消',
      confirmText: '移除',
      success: async (result) => {
        if (!result.confirm || this.data.deletingIngredientId) return
        this.setData({ deletingIngredientId: ingredientId })
        try {
          await request(`/family-members/${this.data.selectedMemberId}/restrictions/${ingredientId}`, 'DELETE')
          wx.showToast({ title: '已移除', icon: 'success' })
          await this.loadRestrictions(this.data.selectedMemberId)
        } catch (error) {
          this.setData({ error: error.message || '移除忌口失败' })
        } finally {
          this.setData({ deletingIngredientId: 0 })
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
