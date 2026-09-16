const { request, resolveCoverUrl, isNoActiveFamilyError, requireAuthentication } = require('../../utils/api')
const { getMenuContextStore } = require('../../utils/menu-context')
const { displayTags } = require('../../utils/tags')
const {
  buildMenuItemPayload,
  buildRecipePath,
  difficultyStars,
  difficultyLabel,
  filterRecipesByCategory,
  normalizeFavoriteRecipeIds,
  toggleFavoriteRecipeId,
  toLocalISODate
} = require('../../utils/ui')

const RECIPE_FAVORITES_STORAGE_KEY = 'recipeFavoriteIds'
const MEAL_LABELS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }

Page({
  data: {
    recipes: [],
    favoriteIds: [],
    skeletonItems: [1, 2, 3, 4],
    keyword: '',
    category: '全部',
    categories: ['收藏', '全部', '荤菜', '素菜', '汤', '主食'],
    loading: false,
    error: '',
    noFamily: false,
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
    if (!requireAuthentication()) return
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
    this.setData({ loading: true, error: '', recipes: [] })
    try {
      const favoriteIds = this.data.favoriteIds
      const apiCategory = this.data.category === '收藏' ? '全部' : this.data.category
      const recipes = await request(buildRecipePath(this.data.keyword, apiCategory))
      const normalizedRecipes = recipes.map((recipe) => ({
        ...recipe,
        coverUrl: resolveCoverUrl(recipe.coverUrl),
        initial: String(recipe.title || '菜').slice(0, 1),
        difficultyText: difficultyLabel(recipe.difficulty),
        difficultyStars: difficultyStars(recipe.difficulty),
        displayTags: displayTags(recipe.tags, 3),
        hasImageError: false,
        isFavorite: favoriteIds.includes(Number(recipe.id))
      }))
      this.setData({
        noFamily: false,
        recipes: filterRecipesByCategory(normalizedRecipes, this.data.category, favoriteIds)
      })
    } catch (error) {
      this.setData(isNoActiveFamilyError(error)
        ? { noFamily: true, error: '', recipes: [] }
        : { noFamily: false, error: error.message || '菜谱加载失败' })
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

  goFamilySetup() {
    wx.switchTab({ url: '/pages/settings/index' })
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
    const nextRecipes = this.data.recipes.map((recipe) => ({
      ...recipe,
      isFavorite: favoriteIds.includes(Number(recipe.id))
    }))
    this.setData({
      favoriteIds,
      recipes: filterRecipesByCategory(nextRecipes, this.data.category, favoriteIds)
    })
    wx.showToast({
      title: favoriteIds.includes(recipeId) ? '已收藏到本机' : '已取消本机收藏',
      icon: 'none'
    })
  },

  openAdd(event) {
    const selectedRecipe = this.data.recipes.find((item) => item.id === Number(event.currentTarget.dataset.id))
    if (!selectedRecipe) return
    const context = getMenuContextStore().consume('add')
    this.setData({
      sheetOpen: true,
      selectedRecipe,
      menuDate: context ? context.menuDate : toLocalISODate(),
      mealType: context ? context.mealType : 'dinner',
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
      const result = await request('/menus/items', 'POST', payload)
      this.setData({ sheetOpen: false, selectedRecipe: null })
      const message = result.status === 'already-present'
        ? `已在${this.data.menuDate} ${MEAL_LABELS[this.data.mealType]}`
        : `已加入${this.data.menuDate} ${MEAL_LABELS[this.data.mealType]}`
      wx.showModal({
        title: result.status === 'already-present' ? '这道菜已经在菜单里' : '已加入菜单',
        content: message,
        confirmText: '查看菜单',
        cancelText: '继续浏览',
        success: (dialog) => {
          if (dialog.confirm) {
            getMenuContextStore().set({ action: 'focus', menuDate: this.data.menuDate, mealType: this.data.mealType, menuItemId: Number(result.itemId || 0) })
            wx.switchTab({ url: '/pages/menu/index' })
          }
        }
      })
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
