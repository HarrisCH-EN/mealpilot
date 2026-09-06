const { request } = require('../../utils/api')
const {
  buildMenuItemPayload,
  buildRecipePath,
  difficultyLabel,
  normalizeFavoriteRecipeIds,
  toggleFavoriteRecipeId,
  toLocalISODate
} = require('../../utils/ui')

const RECIPE_FAVORITES_STORAGE_KEY = 'recipeFavoriteIds'

function difficultyStars(value) {
  const numericValue = Number(value)
  const level = Number.isFinite(numericValue) ? Math.max(0, Math.min(3, numericValue)) : 0
  return [0, 1, 2].map((index) => index < level)
}

Page({
  data: {
    recipes: [],
    favoriteIds: [],
    skeletonItems: [1, 2, 3, 4],
    keyword: '',
    category: '全部',
    categories: ['全部', '荤菜', '素菜', '汤', '主食'],
    loading: false,
    error: '',
    sheetOpen: false,
    selectedRecipe: null,
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

  onShow() {
    this.loadFavoriteIds()
    this.load()
  },

  loadFavoriteIds() {
    const favoriteIds = normalizeFavoriteRecipeIds(wx.getStorageSync(RECIPE_FAVORITES_STORAGE_KEY))
    this.setData({
      favoriteIds,
      recipes: this.data.recipes.map((recipe) => ({ ...recipe, isFavorite: favoriteIds.includes(Number(recipe.id)) }))
    })
  },

  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const recipes = await request(buildRecipePath(this.data.keyword, this.data.category))
      const favoriteIds = this.data.favoriteIds
      this.setData({
        recipes: recipes.map((recipe) => ({
          ...recipe,
          coverUrl: String(recipe.coverUrl || '').trim(),
          initial: String(recipe.title || '菜').slice(0, 1),
          difficultyText: difficultyLabel(recipe.difficulty),
          difficultyStars: difficultyStars(recipe.difficulty),
          hasImageError: false,
          isFavorite: favoriteIds.includes(Number(recipe.id))
        }))
      })
    } catch (error) {
      this.setData({ error: error.message || '菜谱加载失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  changeKeyword(event) {
    this.setData({ keyword: event.detail.value })
  },

  submitSearch() {
    this.load()
  },

  filter(event) {
    this.setData({ category: event.currentTarget.dataset.category }, () => this.load())
  },

  addRecipe() {
    wx.navigateTo({ url: '/pages/recipe-form/index' })
  },

  detail(event) {
    wx.navigateTo({ url: `/pages/recipe-detail/index?id=${event.currentTarget.dataset.id}` })
  },

  handleImageError(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.recipes[index]) return
    const recipes = this.data.recipes.map((recipe, itemIndex) => itemIndex === index ? { ...recipe, showCover: false, hasImageError: true } : recipe)
    this.setData({ recipes })
  },

  toggleFavorite(event) {
    const recipeId = Number(event.currentTarget.dataset.id)
    const favoriteIds = toggleFavoriteRecipeId(this.data.favoriteIds, recipeId)
    wx.setStorageSync(RECIPE_FAVORITES_STORAGE_KEY, favoriteIds)
    this.setData({
      favoriteIds,
      recipes: this.data.recipes.map((recipe) => ({
        ...recipe,
        isFavorite: favoriteIds.includes(Number(recipe.id))
      }))
    })
    wx.showToast({
      title: favoriteIds.includes(recipeId) ? '已收藏到本机' : '已取消本机收藏',
      icon: 'none'
    })
  },

  openAdd(event) {
    const selectedRecipe = this.data.recipes.find((item) => item.id === Number(event.currentTarget.dataset.id))
    if (!selectedRecipe) return
    this.setData({
      sheetOpen: true,
      selectedRecipe,
      menuDate: toLocalISODate(),
      mealType: 'dinner',
      note: ''
    })
  },

  closeSheet() {
    if (!this.data.adding) this.setData({ sheetOpen: false, selectedRecipe: null })
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
    if (this.data.adding || !this.data.selectedRecipe) return
    this.setData({ adding: true })
    try {
      const payload = buildMenuItemPayload(
        this.data.selectedRecipe.id,
        this.data.menuDate,
        this.data.mealType,
        this.data.note
      )
      await request('/menus/items', 'POST', payload)
      wx.showToast({ title: '已加入菜单', icon: 'success' })
      this.setData({ sheetOpen: false, selectedRecipe: null })
    } catch (error) {
      wx.showToast({ title: error.message || '加入失败', icon: 'none' })
    } finally {
      this.setData({ adding: false })
    }
  },

  async remove(event) {
    const id = event.currentTarget.dataset.id
    const confirmed = await new Promise((resolve) => wx.showModal({
      title: '删除菜谱',
      content: '删除后将从推荐候选中移除，确认继续吗？',
      confirmColor: '#b55e55',
      success: (result) => resolve(result.confirm)
    }))
    if (!confirmed) return
    try {
      await request(`/recipes/${id}`, 'DELETE')
      wx.showToast({ title: '已删除', icon: 'success' })
      this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '删除失败', icon: 'none' })
    }
  }
})
