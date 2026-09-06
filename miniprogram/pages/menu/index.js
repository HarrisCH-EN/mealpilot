const { request } = require('../../utils/api')
const { difficultyLabel, normalizeMeals, toLocalISODate } = require('../../utils/ui')
const {
  buildTimelineItems,
  buildCalendarMonth,
  buildMealCards,
  getDateRailMetrics,
  getDateRailState,
  getDateScrollLeft,
  getDateRevealScrollLeft,
  getCalendarPanelHeight,
  getCalendarRowCount,
  isHorizontalSwipe,
  nextMealIndex,
  previousMealIndex
} = require('./view-model')

function enrichMenus(rows, recipes) {
  const recipesById = new Map((recipes || []).map((recipe) => [Number(recipe.id), recipe]))
  return normalizeMeals(rows).map((meal) => ({
    ...meal,
    items: meal.items.map((item) => {
      const recipe = recipesById.get(Number(item.recipeId)) || {}
      return {
        ...item,
        coverUrl: recipe.coverUrl || '',
        description: recipe.description || '',
        cookMinutes: Number(recipe.cookMinutes) || 0,
        difficultyText: recipe.id ? difficultyLabel(recipe.difficulty) : ''
      }
    })
  }))
}

const DATE_RANGE = { before: 120, after: 180 }
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const formatCalendarTitle = (value) => `${value.slice(0, 4)} 年 ${Number(value.slice(5, 7))} 月`

Page({
  data: {
    date: toLocalISODate(),
    today: toLocalISODate(),
    timelineAnchor: toLocalISODate(),
    menuDateKeys: [],
    menus: normalizeMeals([]),
    mealCards: [],
    dateItems: [],
    dateScrollLeft: 0,
    visibleMonth: '',
    calendarOpen: false,
    calendarMonth: '',
    calendarTitle: '',
    calendarDays: [],
    calendarRows: 6,
    calendarPanelHeight: 0,
    deckHeight: 720,
    cardHeight: 680,
    activeMealIndex: 0,
    deckAnimating: false,
    totalItems: 0,
    loading: false,
    error: ''
  },

  onLoad() {
    const date = this.data.date
    const systemInfo = wx.getSystemInfoSync()
    this.dateRailMetrics = getDateRailMetrics(systemInfo.windowWidth)
    const dateItems = buildTimelineItems(this.data.timelineAnchor, {
      ...DATE_RANGE,
      todayValue: this.data.today,
      menuDateSet: this.data.menuDateKeys
    })
    this.dateIndexByValue = {}
    dateItems.forEach((item, index) => { this.dateIndexByValue[item.value] = index })
    const selectedIndex = dateItems.findIndex((item) => item.value === date)
    const dateScrollLeft = getDateScrollLeft(selectedIndex, dateItems.length, this.dateRailMetrics)
    this.currentDateScrollLeft = dateScrollLeft
    const railState = getDateRailState({
      dateItems,
      scrollLeft: dateScrollLeft,
      metrics: this.dateRailMetrics
    })
    this.setData({
      dateItems,
      dateScrollLeft,
      visibleMonth: railState.visibleMonth,
      calendarMonth: `${date.slice(0, 7)}-01`,
      calendarTitle: formatCalendarTitle(`${date.slice(0, 7)}-01`),
      calendarDays: buildCalendarMonth(date, this.data.today, this.data.menuDateKeys),
      calendarRows: getCalendarRowCount(date),
      mealCards: buildMealCards(this.data.menus, this.data.activeMealIndex)
    })
  },

  onReady() {
    this.measureDeck()
    this.measureDateViewport()
  },

  onResize() {
    this.measureDeck()
    this.measureDateViewport()
  },

  onShow() {
    this.load()
  },

  async load() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const rows = await request(`/menus?date=${this.data.date}`)
      let recipes = []
      try {
        recipes = await request('/recipes')
      } catch (recipeError) {
        console.warn('菜单菜谱详情加载失败', recipeError)
      }
      const menus = enrichMenus(rows, recipes)
      const menuDateKeys = this.updateMenuDateKeys(this.data.date, menus)
      const calendarDays = buildCalendarMonth(this.data.calendarMonth || this.data.date, this.data.today, menuDateKeys)
      const selectedIndex = this.dateIndexByValue && this.dateIndexByValue[this.data.date]
      const hasMenu = menus.some((meal) => meal.items && meal.items.length)
      const markerPatch = Number.isInteger(selectedIndex)
        ? { [`dateItems[${selectedIndex}].hasMenu`]: hasMenu }
        : {}
      this.setData({
        menus,
        mealCards: buildMealCards(menus, this.data.activeMealIndex),
        totalItems: menus.reduce((sum, meal) => sum + meal.items.length, 0),
        menuDateKeys,
        calendarDays,
        ...markerPatch
      })
    } catch (error) {
      this.setData({ error: error.message || '菜单加载失败' })
    } finally {
      this.setData({ loading: false })
    }
  },

  measureDeck() {
    const systemInfo = wx.getSystemInfoSync()
    this.dateRailMetrics = getDateRailMetrics(systemInfo.windowWidth)
    const rpxPerPx = 750 / systemInfo.windowWidth
    const viewportHeight = systemInfo.windowHeight * rpxPerPx
    wx.createSelectorQuery().in(this).selectAll('.menu-header, .menu-date-rail, .meal-indicator').boundingClientRect().exec((rects) => {
      const measured = (rects || []).reduce((sum, rect) => sum + ((rect && rect.height) || 0), 0) * rpxPerPx
      const deckHeight = Math.round(clamp(viewportHeight - measured - 56, 600, 900))
      this.setData({ deckHeight, cardHeight: deckHeight - 42 })
    })
  },

  measureDateViewport() {
    const systemInfo = wx.getSystemInfoSync()
    const fallbackMetrics = getDateRailMetrics(systemInfo.windowWidth)
    const query = wx.createSelectorQuery().in(this)
    query.select('.menu-date-scroll').boundingClientRect()
    query.exec((rects) => {
      const rect = rects && rects[0]
      if (!rect || !rect.width) return
      this.dateRailMetrics = { ...fallbackMetrics, viewportWidth: rect.width }
    })
  },

  updateMenuDateKeys(date, menus) {
    const keys = new Set(this.data.menuDateKeys || [])
    const hasMenu = menus.some((meal) => meal.items && meal.items.length)
    if (hasMenu) keys.add(date)
    else keys.delete(date)
    return Array.from(keys).sort()
  },

  setSelectedDate(date, options = {}) {
    const scrollMode = options.scrollMode || 'none'
    if (!date || (date === this.data.date && scrollMode === 'none')) return
    const nextData = {
      date,
      calendarOpen: false,
      calendarMonth: `${date.slice(0, 7)}-01`,
      calendarTitle: formatCalendarTitle(`${date.slice(0, 7)}-01`),
      calendarDays: buildCalendarMonth(date, this.data.today, this.data.menuDateKeys),
      calendarRows: getCalendarRowCount(date),
      calendarPanelHeight: 0
    }
    const selectedIndex = this.dateIndexByValue && this.dateIndexByValue[date]
    if (Number.isInteger(selectedIndex) && scrollMode === 'center') {
      const dateScrollLeft = getDateScrollLeft(selectedIndex, this.data.dateItems.length, this.dateRailMetrics)
      this.currentDateScrollLeft = dateScrollLeft
      nextData.dateScrollLeft = dateScrollLeft
    } else if (Number.isInteger(selectedIndex) && scrollMode === 'reveal') {
      const currentScrollLeft = Number.isFinite(this.currentDateScrollLeft)
        ? this.currentDateScrollLeft
        : Number(this.data.dateScrollLeft) || 0
      const dateScrollLeft = getDateRevealScrollLeft(
        selectedIndex,
        this.data.dateItems.length,
        currentScrollLeft,
        this.dateRailMetrics
      )
      if (dateScrollLeft !== currentScrollLeft) {
        this.currentDateScrollLeft = dateScrollLeft
        nextData.dateScrollLeft = dateScrollLeft
      }
    }
    this.setData(nextData, () => this.load())
  },

  selectDate(event) {
    this.setSelectedDate(event.currentTarget.dataset.date)
  },

  handleDateScroll(event) {
    const scrollLeft = Number(event.detail.scrollLeft) || 0
    this.currentDateScrollLeft = scrollLeft
    const railState = getDateRailState({
      dateItems: this.data.dateItems,
      scrollLeft,
      metrics: this.dateRailMetrics
    })
    if (railState.visibleMonth === this.data.visibleMonth) return
    this.setData({ visibleMonth: railState.visibleMonth })
  },

  returnToday() {
    this.setSelectedDate(this.data.today, { scrollMode: 'center' })
  },

  toggleCalendar() {
    const calendarOpen = !this.data.calendarOpen
    const calendarPanelHeight = calendarOpen ? getCalendarPanelHeight(this.data.calendarRows) : 0
    this.setData({ calendarOpen, calendarPanelHeight })
  },

  closeCalendar() {
    if (this.data.calendarOpen) this.setData({ calendarOpen: false, calendarPanelHeight: 0 })
  },

  changeCalendarMonth(event) {
    const step = Number(event.currentTarget.dataset.step)
    const month = new Date(`${this.data.calendarMonth}T00:00:00`)
    const calendarMonth = toLocalISODate(new Date(month.getFullYear(), month.getMonth() + step, 1))
    const calendarRows = getCalendarRowCount(calendarMonth)
    this.setData({
      calendarMonth,
      calendarTitle: formatCalendarTitle(calendarMonth),
      calendarDays: buildCalendarMonth(calendarMonth, this.data.today, this.data.menuDateKeys),
      calendarRows,
      calendarPanelHeight: this.data.calendarOpen ? getCalendarPanelHeight(calendarRows) : 0
    })
  },

  selectCalendarDate(event) {
    this.setSelectedDate(event.currentTarget.dataset.date, { scrollMode: 'reveal' })
  },

  setActiveMeal(index) {
    if (this.data.deckAnimating || index === this.data.activeMealIndex) return
    this.setData({
      activeMealIndex: index,
      deckAnimating: true,
      mealCards: buildMealCards(this.data.menus, index)
    })
    clearTimeout(this.deckTimer)
    this.deckTimer = setTimeout(() => this.setData({ deckAnimating: false }), 320)
  },

  switchMeal(event) {
    this.setActiveMeal(Number(event.currentTarget.dataset.index))
  },

  handleCardTouchStart(event) {
    const touch = event.touches && event.touches[0]
    if (touch) this.touchStart = { x: touch.clientX, y: touch.clientY }
  },

  handleCardTouchEnd(event) {
    const touch = event.changedTouches && event.changedTouches[0]
    if (!this.touchStart || !touch) return
    const direction = isHorizontalSwipe(this.touchStart, { x: touch.clientX, y: touch.clientY })
    this.touchStart = null
    if (direction === 'next') this.setActiveMeal(nextMealIndex(this.data.activeMealIndex))
    if (direction === 'previous') this.setActiveMeal(previousMealIndex(this.data.activeMealIndex))
  },

  retryLoad() {
    this.load()
  },

  goRecipes() {
    wx.switchTab({ url: '/pages/recipes/index' })
  },

  goRecommend() {
    wx.switchTab({ url: '/pages/recommend/index' })
  },

  openRecipe(event) {
    const recipeId = Number(event.currentTarget.dataset.recipeId)
    if (recipeId) wx.navigateTo({ url: `/pages/recipe-detail/index?id=${recipeId}` })
  },

  handleImageError(event) {
    const recipeId = Number(event.currentTarget.dataset.recipeId)
    if (!recipeId) return
    const menus = this.data.menus.map((meal) => ({
      ...meal,
      items: meal.items.map((item) => Number(item.recipeId) === recipeId ? { ...item, coverUrl: '' } : item)
    }))
    this.setData({ menus, mealCards: buildMealCards(menus, this.data.activeMealIndex) })
  },

  async remove(event) {
    const id = event.currentTarget.dataset.id
    const confirmed = await new Promise((resolve) => wx.showModal({
      title: '从菜单移除',
      content: '确认移除这道菜吗？菜谱本身不会被删除。',
      confirmColor: '#b55e55',
      success: (result) => resolve(result.confirm)
    }))
    if (!confirmed) return
    try {
      await request(`/menus/items/${id}`, 'DELETE')
      wx.showToast({ title: '已移除', icon: 'success' })
      this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '删除失败', icon: 'none' })
    }
  },

  onUnload() {
    clearTimeout(this.deckTimer)
  }
})
