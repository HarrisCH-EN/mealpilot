const { request } = require('../../utils/api')
const {
  buildMenuItemPayload,
  difficultyLabel,
  normalizeFavoriteRecipeIds,
  toggleFavoriteRecipeId,
  toLocalISODate
} = require('../../utils/ui')

const RECIPE_FAVORITES_STORAGE_KEY = 'recipeFavoriteIds'

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
    adding: false
  },

  onLoad(options) {
    const id = Number(options.id)
    this.setData({ id, ...getNavigationLayout() }, () => {
      this.refreshFavorite()
      this.load()
    })
  },

  onShow() {
    if (this.data.id) this.refreshFavorite()
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
          initial: String(recipe.title || '菜').slice(0, 1),
          difficultyText: difficultyLabel(recipe.difficulty),
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
        }
      })
    } catch (error) {
      this.setData({ recipe: null, error: error.message || '菜品详情加载失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  back() {
    wx.navigateBack()
  },

  edit() {
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
    wx.showActionSheet({
      itemList: ['分享菜品（待开发）', '删除菜品'],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) this.shareRecipe()
        if (tapIndex === 1) this.removeRecipe()
      }
    })
  },

  shareRecipe() {
    wx.showToast({ title: '分享功能待开发', icon: 'none' })
  },

  async removeRecipe() {
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
    this.setData({ sheetOpen: true, menuDate: toLocalISODate(), mealType: 'dinner', note: '' })
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
      await request('/menus/items', 'POST', buildMenuItemPayload(
        this.data.recipe.id,
        this.data.menuDate,
        this.data.mealType,
        this.data.note
      ))
      wx.showToast({ title: '已加入菜单', icon: 'success' })
      this.setData({ sheetOpen: false })
    } catch (error) {
      wx.showToast({ title: error.message || '加入失败', icon: 'none' })
    } finally {
      this.setData({ adding: false })
    }
  }
})
