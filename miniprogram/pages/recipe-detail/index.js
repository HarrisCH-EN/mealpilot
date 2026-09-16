const { request, resolveCoverUrl, requireAuthentication } = require('../../utils/api')
const { getMenuContextStore } = require('../../utils/menu-context')
const { displayTags } = require('../../utils/tags')
const {
  buildMenuItemPayload,
  difficultyLabel,
  normalizeFavoriteRecipeIds,
  toggleFavoriteRecipeId,
  toLocalISODate
} = require('../../utils/ui')

const RECIPE_FAVORITES_STORAGE_KEY = 'recipeFavoriteIds'
const MEAL_LABELS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }

function getNavigationLayout() {
  const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const statusBarHeight = Number(windowInfo.statusBarHeight || 20)
  const windowWidth = Number(windowInfo.windowWidth || 375)
  let capsule = null
  try {
    capsule = wx.getMenuButtonBoundingClientRect()
  } catch (_error) {
    capsule = null
  }
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
    id: 0,
    recipe: null,
    loading: true,
    error: '',
    isFavorite: false,
    navStyle: '',
    contentStyle: '',
    sheetOpen: false,
    menuDate: toLocalISODate(),
    mealType: 'dinner',
    mealTypes: [
      { value: 'breakfast', label: '早餐' },
      { value: 'lunch', label: '午餐' },
      { value: 'dinner', label: '晚餐' }
    ],
    note: '',
    adding: false,
    menuContext: null,
    menuContextLabel: '',
    canEdit: false,
    permissionHint: '仅菜谱创建者或家庭管理员可编辑和删除'
  },

  onLoad(options) {
    if (!requireAuthentication()) return
    this._initialShowPending = true
    const id = Number(options.id)
    const menuDate = String(options.menuDate || '')
    const mealType = String(options.mealType || '')
    const menuItemId = Number(options.menuItemId || 0)
    const mealLabel = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }[mealType]
    const menuContext = /^\d{4}-\d{2}-\d{2}$/.test(menuDate) && mealLabel
      ? { menuDate, mealType, menuItemId }
      : null
    this.setData({ id, menuContext, menuContextLabel: menuContext ? `${menuDate} ${mealLabel}` : '', ...getNavigationLayout() }, () => {
      this.refreshFavorite()
      this.load()
    })
  },

  onShow() {
    if (!requireAuthentication()) return
    if (!this.data.id) return
    this.refreshFavorite()
    if (this._initialShowPending) {
      this._initialShowPending = false
      return
    }
    if (!this.data.loading) this.load()
  },

  refreshFavorite() {
    const ids = normalizeFavoriteRecipeIds(wx.getStorageSync(RECIPE_FAVORITES_STORAGE_KEY))
    this.setData({ isFavorite: ids.includes(Number(this.data.id)) })
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const recipe = await request(`/recipes/${this.data.id}`)
      this.setData({
        recipe: {
          ...recipe,
          coverUrl: resolveCoverUrl(recipe.coverUrl),
          initial: String(recipe.title || '菜').slice(0, 1),
          difficultyText: difficultyLabel(recipe.difficulty),
          tags: displayTags(recipe.tags),
          ingredients: (recipe.ingredients || []).map((item) => ({
            ...item,
            initial: String(item.name || '食').slice(0, 1)
          })),
          stepList: String(recipe.steps || '')
            .split(/\r?\n/)
            .map((text) => text.trim())
            .filter(Boolean)
            .map((text, index) => ({
              number: String(index + 1).padStart(2, '0'),
              ordinal: index + 1,
              text
            }))
        },
        canEdit: this.canEditRecipe(recipe)
      })
      if (!this.data.menuContext) await this.loadTodayMenuStatus()
    } catch (error) {
      this.setData({ recipe: null, error: error.message || '菜品详情加载失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  canEditRecipe(recipe) {
    const app = getApp()
    const membership = app && app.globalData && app.globalData.membership
    if (!membership) return false
    return membership.role === 'owner' || Number(membership.member_id || membership.memberId) === Number(recipe.createdByMemberId)
  },

  async loadTodayMenuStatus() {
    try {
      const rows = await request(`/menus?date=${this.data.menuDate}`)
      let found = null
      for (const meal of (rows || [])) {
        const item = (meal.items || []).find((candidate) => Number(candidate.recipeId) === Number(this.data.id))
        if (item) { found = { ...item, mealType: meal.mealType }; break }
      }
      if (!found) return
      const mealType = found.mealType
      this.setData({
        mealType,
        menuContext: { menuDate: this.data.menuDate, mealType, menuItemId: Number(found.id) },
        menuContextLabel: `今日${MEAL_LABELS[mealType] || ''}`
      })
    } catch (_error) {
      // 菜谱详情仍可浏览；菜单状态查询失败不应阻塞页面。
    }
  },

  back() {
    wx.navigateBack()
  },

  edit() {
    if (!this.data.canEdit) {
      wx.showToast({ title: this.data.permissionHint, icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/recipe-form/index?id=${this.data.id}` })
  },

  toggleFavorite() {
    const stored = normalizeFavoriteRecipeIds(wx.getStorageSync(RECIPE_FAVORITES_STORAGE_KEY))
    const favoriteIds = toggleFavoriteRecipeId(stored, this.data.id)
    const isFavorite = favoriteIds.includes(Number(this.data.id))
    wx.setStorageSync(RECIPE_FAVORITES_STORAGE_KEY, favoriteIds)
    this.setData({ isFavorite })
    wx.showToast({ title: isFavorite ? '已收藏到本机' : '已取消本机收藏', icon: 'none' })
  },

  openMore() {
    if (!this.data.canEdit) {
      wx.showActionSheet({ itemList: ['查看编辑权限'], success: ({ tapIndex }) => {
        if (tapIndex === 0) wx.showToast({ title: this.data.permissionHint, icon: 'none' })
      } })
      return
    }
    wx.showActionSheet({
      itemList: ['删除菜品'],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) this.removeRecipe()
      }
    })
  },

  async removeRecipe() {
    if (!this.data.canEdit) {
      wx.showToast({ title: this.data.permissionHint, icon: 'none' })
      return
    }
    const confirmed = await new Promise((resolve) => wx.showModal({
      title: '删除菜品？',
      content: '删除后无法恢复，确定删除这道菜吗？',
      confirmText: '删除',
      confirmColor: '#d1435b',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false)
    }))
    if (!confirmed) return
    try {
      await request(`/recipes/${this.data.id}`, 'DELETE')
      wx.showToast({ title: '已删除', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (error) {
      wx.showToast({ title: error.message || '删除失败', icon: 'none' })
    }
  },

  handleImageError() {
    if (this.data.recipe) this.setData({ 'recipe.coverUrl': '' })
  },

  openAdd() {
    if (this.data.menuContext) return this.viewMenu()
    this.setData({ sheetOpen: true, menuDate: toLocalISODate(), mealType: 'dinner', note: '' })
  },

  primaryAction() {
    if (this.data.menuContext) this.viewMenu()
    else this.openAdd()
  },

  viewMenu() {
    const context = this.data.menuContext
    if (context) getMenuContextStore().set({ action: 'focus', ...context })
    wx.switchTab({ url: '/pages/menu/index' })
  },

  closeSheet() {
    if (!this.data.adding) this.setData({ sheetOpen: false })
  },

  changeMenuDate(event) {
    this.setData({ menuDate: event.detail.value })
  },

  selectMeal(event) {
    this.setData({ mealType: event.currentTarget.dataset.value })
  },

  changeNote(event) {
    this.setData({ note: event.detail.value })
  },

  noop() {},

  async confirmAdd() {
    if (this.data.adding || !this.data.recipe) return
    this.setData({ adding: true })
    try {
      const result = await request('/menus/items', 'POST', buildMenuItemPayload(
        this.data.recipe.id,
        this.data.menuDate,
        this.data.mealType,
        this.data.note
      ))
      const mealLabel = MEAL_LABELS[this.data.mealType] || '菜单'
      const message = result.status === 'already-present'
        ? `已在${this.data.menuDate} ${mealLabel}`
        : `已加入${this.data.menuDate} ${mealLabel}`
      this.setData({
        sheetOpen: false,
        menuContext: { menuDate: this.data.menuDate, mealType: this.data.mealType, menuItemId: Number(result.itemId || 0) },
        menuContextLabel: `${this.data.menuDate} ${mealLabel}`
      })
      wx.showModal({
        title: result.status === 'already-present' ? '这道菜已经在菜单里' : '已加入菜单',
        content: message,
        confirmText: '查看菜单',
        cancelText: '继续浏览',
        success: (dialog) => { if (dialog.confirm) this.viewMenu() }
      })
    } catch (error) {
      wx.showToast({ title: error.message || '加入失败', icon: 'none' })
    } finally {
      this.setData({ adding: false })
    }
  }
})
