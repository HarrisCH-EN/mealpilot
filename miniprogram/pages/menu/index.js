const { request, resolveCoverUrl, isNoActiveFamilyError } = require('../../utils/api')
const { difficultyStars, getCurrentMealType, normalizeMeals, toLocalISODate } = require('../../utils/ui')
const { displayTags } = require('../../utils/tags')
const { getMenuContextStore } = require('../../utils/menu-context')
const {
  buildTimelineItems,
  buildCalendarMonth,
  mergeMenuDateKeys,
  buildMealCards,
  getPreferredMealIndex,
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
      const rawDifficulty = Number(recipe.difficulty)
      const hasDifficulty = Number.isInteger(rawDifficulty) && rawDifficulty >= 1 && rawDifficulty <= 3
      return {
        ...item,
        coverUrl: resolveCoverUrl(recipe.coverUrl),
        description: String(recipe.description || '').trim(),
        cookMinutes: Number(recipe.cookMinutes) > 0 ? Number(recipe.cookMinutes) : 0,
        difficulty: hasDifficulty ? rawDifficulty : 0,
        difficultyStars: hasDifficulty ? difficultyStars(rawDifficulty) : [],
        hasDifficulty,
        displayTags: displayTags(recipe.tags, 3)
      }
    })
  }))
}

const DATE_RANGE = { before: 120, after: 180 }
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner']
const mealIndexForType = (mealType) => MEAL_TYPES.indexOf(mealType)
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const formatCalendarTitle = (value) => `${value.slice(0, 4)} 年 ${Number(value.slice(5, 7))} 月`
const formatMenuHeader = (date, today) => date === today
  ? { menuTitle: '今日菜单', menuSubtitle: '今天吃什么，一眼就知道。' }
  : { menuTitle: `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8, 10))} 日菜单`, menuSubtitle: '这一天安排了什么，打开就知道。' }
const monthBounds = (monthValue) => {
  const month = String(monthValue || '').slice(0, 7)
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return null
  const lastDay = new Date(year, monthNumber, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` }
}

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
    menuTitle: '今日菜单',
    menuSubtitle: '今天吃什么，一眼就知道。',
    calendarDays: [],
    calendarRows: 6,
    calendarPanelHeight: 0,
    deckHeight: 720,
    cardHeight: 680,
    activeMealIndex: 0,
    deckAnimating: false,
    totalItems: 0,
    removingItemId: 0,
    feedbackSaving: false,
    loading: false,
    error: '',
    noFamily: false
  },

  onLoad() {
    this.shouldUseCurrentMealDefault = true
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
      ...formatMenuHeader(date, this.data.today),
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
    const context = getMenuContextStore().consume('focus')
    if (context) {
      const activeMealIndex = mealIndexForType(context.mealType)
      this.pendingFocusedMealIndex = activeMealIndex >= 0 ? activeMealIndex : null
      this.shouldUseCurrentMealDefault = false
      this.setData({
        activeMealIndex: activeMealIndex >= 0 ? activeMealIndex : this.data.activeMealIndex,
        mealCards: buildMealCards(this.data.menus, activeMealIndex >= 0 ? activeMealIndex : this.data.activeMealIndex)
      })
      this.setSelectedDate(context.menuDate, { scrollMode: 'reveal' })
      return
    }
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
      const focusedMealIndex = this.pendingFocusedMealIndex
      const useTimeDefault = this.shouldUseCurrentMealDefault && this.data.date === this.data.today
      const activeMealIndex = Number.isInteger(focusedMealIndex)
        ? focusedMealIndex
        : useTimeDefault
          ? mealIndexForType(getCurrentMealType(new Date().getHours()))
          : this.preferMealWithItemsOnLoad
            ? getPreferredMealIndex(menus, this.data.activeMealIndex)
            : this.data.activeMealIndex
      this.pendingFocusedMealIndex = null
      this.shouldUseCurrentMealDefault = false
      this.preferMealWithItemsOnLoad = false
      const menuDateKeys = this.updateMenuDateKeys(this.data.date, menus)
      const summaryKeys = await this.loadMenuDates(this.data.calendarMonth || this.data.date, menuDateKeys)
      const calendarDays = buildCalendarMonth(this.data.calendarMonth || this.data.date, this.data.today, summaryKeys)
      const selectedIndex = this.dateIndexByValue && this.dateIndexByValue[this.data.date]
      const hasMenu = menus.some((meal) => meal.items && meal.items.length)
      const markerPatch = Number.isInteger(selectedIndex)
        ? { [`dateItems[${selectedIndex}].hasMenu`]: hasMenu }
        : {}
      this.setData({
        noFamily: false,
        menus,
        activeMealIndex,
        mealCards: buildMealCards(menus, activeMealIndex),
        totalItems: menus.reduce((sum, meal) => sum + meal.items.length, 0),
        menuDateKeys: summaryKeys,
        ...formatMenuHeader(this.data.date, this.data.today),
        calendarDays,
        ...markerPatch
      })
    } catch (error) {
      this.setData(isNoActiveFamilyError(error)
        ? { noFamily: true, error: '', menus: normalizeMeals([]), mealCards: buildMealCards(normalizeMeals([]), this.data.activeMealIndex), totalItems: 0 }
        : { noFamily: false, error: error.message || '菜单加载失败' })
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

  async loadMenuDates(monthValue, existingKeys = this.data.menuDateKeys) {
    const bounds = monthBounds(monthValue)
    if (!bounds) return existingKeys || []
    try {
      const rows = await request(`/menus/dates?from=${bounds.from}&to=${bounds.to}`)
      const menuDateKeys = mergeMenuDateKeys(existingKeys, bounds.from, bounds.to, rows)
      this.setData({
        menuDateKeys,
        calendarDays: buildCalendarMonth(this.data.calendarMonth || this.data.date, this.data.today, menuDateKeys),
        dateItems: this.data.dateItems.map((item) => ({ ...item, hasMenu: menuDateKeys.includes(item.value) }))
      })
      return menuDateKeys
    } catch (error) {
      console.warn('菜单日期摘要加载失败', error)
      return existingKeys || []
    }
  },

  setSelectedDate(date, options = {}) {
    const scrollMode = options.scrollMode || 'none'
    if (!date) return
    if (date === this.data.date && scrollMode === 'none') {
      if (options.preferMealWithItems) {
        const activeMealIndex = getPreferredMealIndex(this.data.menus, this.data.activeMealIndex)
        this.setData({ activeMealIndex, mealCards: buildMealCards(this.data.menus, activeMealIndex) })
      }
      return
    }
    if (options.preferMealWithItems) this.preferMealWithItemsOnLoad = true
    const nextData = {
      date,
      calendarOpen: false,
      calendarMonth: `${date.slice(0, 7)}-01`,
      calendarTitle: formatCalendarTitle(`${date.slice(0, 7)}-01`),
      calendarDays: buildCalendarMonth(date, this.data.today, this.data.menuDateKeys),
      calendarRows: getCalendarRowCount(date),
      calendarPanelHeight: 0,
      ...formatMenuHeader(date, this.data.today)
    }
    const selectedIndex = this.dateIndexByValue && this.dateIndexByValue[date]
    if (!Number.isInteger(selectedIndex)) {
      const dateItems = buildTimelineItems(date, {
        ...DATE_RANGE,
        todayValue: this.data.today,
        menuDateSet: this.data.menuDateKeys
      })
      this.dateIndexByValue = {}
      dateItems.forEach((item, index) => { this.dateIndexByValue[item.value] = index })
      const index = this.dateIndexByValue[date]
      const dateScrollLeft = getDateScrollLeft(index, dateItems.length, this.dateRailMetrics)
      const railState = getDateRailState({ dateItems, scrollLeft: dateScrollLeft, metrics: this.dateRailMetrics })
      nextData.dateItems = dateItems
      nextData.dateScrollLeft = dateScrollLeft
      nextData.visibleMonth = railState.visibleMonth
      this.currentDateScrollLeft = dateScrollLeft
    }
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
    this.shouldUseCurrentMealDefault = false
    this.setSelectedDate(event.currentTarget.dataset.date, { preferMealWithItems: true })
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
    this.shouldUseCurrentMealDefault = true
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
    }, () => this.loadMenuDates(calendarMonth))
  },

  selectCalendarDate(event) {
    this.shouldUseCurrentMealDefault = false
    this.setSelectedDate(event.currentTarget.dataset.date, { scrollMode: 'reveal', preferMealWithItems: true })
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

  goRecipes(event) {
    const activeMeal = this.data.menus[this.data.activeMealIndex]
    getMenuContextStore().set({
      action: 'add',
      menuDate: this.data.date,
      mealType: event && event.currentTarget.dataset.mealType || activeMeal.mealType
    })
    wx.switchTab({ url: '/pages/recipes/index' })
  },

  goFamilySetup() {
    wx.switchTab({ url: '/pages/settings/index' })
  },

  goRecommend() {
    wx.switchTab({ url: '/pages/recommend/index' })
  },

  openRecipe(event) {
    const recipeId = Number(event.currentTarget.dataset.recipeId)
    const menuItemId = Number(event.currentTarget.dataset.menuItemId)
    const mealType = String(event.currentTarget.dataset.mealType || this.data.menus[this.data.activeMealIndex].mealType)
    if (recipeId) wx.navigateTo({ url: `/pages/recipe-detail/index?id=${recipeId}&menuDate=${this.data.date}&mealType=${mealType}&menuItemId=${menuItemId}` })
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

  openFeedback(event) {
    if (this.data.feedbackSaving) return
    const menuItemId = Number(event.currentTarget.dataset.id)
    const item = this.data.menus.flatMap((meal) => meal.items || []).find((candidate) => Number(candidate.id) === menuItemId)
    if (!item) return
    const choices = ['1 星', '2 星', '3 星', '4 星', '5 星']
    if (item.feedback) choices.push('删除评分')
    wx.showActionSheet({
      itemList: choices,
      success: ({ tapIndex }) => {
        if (tapIndex === 5 && item.feedback) return this.deleteFeedback(menuItemId)
        if (tapIndex >= 0 && tapIndex < 5) this.promptFeedbackComment(menuItemId, tapIndex + 1, item.feedback?.comment || '')
      }
    })
  },

  promptFeedbackComment(menuItemId, rating, existingComment = '') {
    wx.showModal({
      title: `${rating} 星评价`,
      editable: true,
      defaultText: existingComment,
      placeholderText: '可选文字评价（最多200字）',
      success: ({ confirm, content }) => {
        if (!confirm) return
        const comment = String(content || '').trim()
        if (comment.length > 200) {
          wx.showToast({ title: '评价不能超过200字', icon: 'none' })
          return
        }
        this.saveFeedback(menuItemId, rating, comment)
      }
    })
  },

  updateMenuItemFeedback(menuItemId, feedback) {
    const menus = this.data.menus.map((meal) => ({
      ...meal,
      items: (meal.items || []).map((item) => Number(item.id) === menuItemId ? { ...item, feedback } : item)
    }))
    this.setData({ menus, mealCards: buildMealCards(menus, this.data.activeMealIndex) })
  },

  async saveFeedback(menuItemId, rating, comment = '') {
    if (this.data.feedbackSaving) return
    this.setData({ feedbackSaving: true })
    try {
      const feedback = await request(`/menu-items/${menuItemId}/feedback`, 'PUT', { rating, comment })
      this.updateMenuItemFeedback(menuItemId, { rating: Number(feedback.rating), comment: feedback.comment || '' })
      wx.showToast({ title: '评分已保存', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error.message || '评分保存失败', icon: 'none' })
    } finally {
      this.setData({ feedbackSaving: false })
    }
  },

  async deleteFeedback(menuItemId) {
    if (this.data.feedbackSaving) return
    const confirmed = await new Promise((resolve) => wx.showModal({
      title: '删除评分',
      content: '确定删除这条用餐评分吗？',
      success: (result) => resolve(result.confirm)
    }))
    if (!confirmed) return
    this.setData({ feedbackSaving: true })
    try {
      await request(`/menu-items/${menuItemId}/feedback`, 'DELETE')
      this.updateMenuItemFeedback(menuItemId, null)
      wx.showToast({ title: '评分已删除', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error.message || '评分删除失败', icon: 'none' })
    } finally {
      this.setData({ feedbackSaving: false })
    }
  },

  async remove(event) {
    const id = event.currentTarget.dataset.id
    if (this.data.removingItemId) return
    const confirmed = await new Promise((resolve) => wx.showModal({
      title: '从菜单移除',
      content: '确认移除这道菜吗？菜谱本身不会被删除。',
      confirmColor: '#b55e55',
      success: (result) => resolve(result.confirm)
    }))
    if (!confirmed) return
    this.setData({ removingItemId: Number(id) })
    try {
      await request(`/menus/items/${id}`, 'DELETE')
      wx.showToast({ title: '已移除', icon: 'success' })
      this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '删除失败', icon: 'none' })
    } finally {
      this.setData({ removingItemId: 0 })
    }
  },

  onUnload() {
    clearTimeout(this.deckTimer)
  }
})
