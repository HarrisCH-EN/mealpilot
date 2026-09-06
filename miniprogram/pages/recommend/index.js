const { request, devLogin } = require('../../utils/api')
const { buildMenuItemPayload, difficultyLabel, toLocalISODate } = require('../../utils/ui')

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

function dateCaption(date) {
  const [year, month, day] = date.split('-').map(Number)
  return `${month}月${day}日 · ${WEEKDAYS[new Date(year, month - 1, day).getDay()]}`
}

function recommendationReason(recommendation, peopleCount) {
  return `适合 ${peopleCount} 人一起吃，今晚准备起来更从容。`
}

function withRecipeDetails(recommendation, recipes = []) {
  const detailsById = new Map(recipes.map((recipe) => [recipe.id, recipe]))
  return {
    ...recommendation,
    items: recommendation.items.map((item) => {
      const recipe = detailsById.get(item.id) || {}
      const difficulty = Number(recipe.difficulty || item.difficulty || 1)
      return {
        ...item,
        coverUrl: recipe.coverUrl || '',
        initial: String(item.title || '菜').slice(0, 1),
        description: recipe.description || '',
        difficultyText: difficultyLabel(difficulty)
      }
    })
  }
}

async function attachRecipeDetails(recommendation) {
  try {
    return withRecipeDetails(recommendation, await request('/recipes'))
  } catch (_error) {
    return withRecipeDetails(recommendation)
  }
}

Page({
  data: {
    date: toLocalISODate(),
    dateCaption: dateCaption(toLocalISODate()),
    peopleCount: 2,
    maxMinutes: 60,
    timeLabel: '60 分钟内',
    timeOptionIndex: 2,
    timeOptions: [
      { label: '35 分钟内', value: 35 },
      { label: '45 分钟内', value: 45 },
      { label: '60 分钟内', value: 60 }
    ],
    mode: 'balanced',
    selectedMode: 'balanced',
    modeLabel: '自动搭配',
    modes: [
      { value: 'balanced', label: '自动' },
      { value: 'healthy', label: '清淡一点' },
      { value: 'quick', label: '快一点' },
      { value: 'hearty', label: '丰盛一点' }
    ],
    screen: 'initial',
    preferenceOpen: false,
    loading: false,
    regenerating: false,
    applying: false,
    applied: false,
    resultMotion: 'refresh-a',
    error: '',
    recommendation: null
  },

  onLoad() {
    this.ensureLogin()
  },

  async ensureLogin() {
    try {
      await devLogin()
      return true
    } catch (error) {
      this.setData({ screen: 'error', error: error.message || '暂时无法连接本地服务' })
      return false
    }
  },

  togglePreferences() {
    this.setData({ preferenceOpen: !this.data.preferenceOpen })
  },

  noop() {},

  changePeople(event) {
    const next = Math.min(12, Math.max(1, this.data.peopleCount + Number(event.currentTarget.dataset.delta)))
    this.setData({ peopleCount: next })
  },

  changeTime(event) {
    const index = Number(event.detail.value)
    const option = this.data.timeOptions[index]
    if (option) this.setData({ maxMinutes: option.value, timeLabel: option.label, timeOptionIndex: index })
  },

  changeMode(event) {
    const selectedMode = event.currentTarget.dataset.value
    const mode = selectedMode === 'hearty' ? 'balanced' : selectedMode
    const selected = this.data.modes.find((item) => item.value === selectedMode)
    if (selected) this.setData({ mode, selectedMode, modeLabel: selectedMode === 'balanced' ? '自动搭配' : selected.label })
  },

  backToInitial() {
    if (!this.data.loading && !this.data.regenerating && !this.data.applying) this.setData({ screen: 'initial', preferenceOpen: false })
  },

  backToResult() {
    if (this.data.recommendation && !this.data.applying) this.setData({ screen: 'result' })
  },

  chooseManually() {
    if (!this.data.applying && !this.data.regenerating) wx.switchTab({ url: '/pages/recipes/index' })
  },

  handleImageError(event) {
    const index = Number(event.currentTarget.dataset.index)
    const items = this.data.recommendation?.items
    if (!Number.isInteger(index) || !items?.[index]) return
    this.setData({ 'recommendation.items': items.map((item, itemIndex) => itemIndex === index ? { ...item, coverUrl: '' } : item) })
  },

  async generate() {
    if (this.data.loading || this.data.applying || this.data.regenerating) return
    const regenerating = this.data.screen === 'result' && Boolean(this.data.recommendation)
    this.setData(regenerating ? { regenerating: true, applied: false, error: '' } : { loading: true, screen: 'loading', preferenceOpen: false, applied: false, error: '' })
    try {
      const response = await request('/recommendations', 'POST', {
        menuDate: this.data.date,
        mealType: 'dinner',
        peopleCount: this.data.peopleCount,
        maxCookMinutes: this.data.maxMinutes,
        mode: this.data.mode
      })
      const recommendation = await attachRecipeDetails(response)
      const resultMotion = this.data.resultMotion === 'refresh-a' ? 'refresh-b' : 'refresh-a'
      this.setData({ recommendation: { ...recommendation, reason: recommendationReason(recommendation, this.data.peopleCount) }, screen: 'result', resultMotion })
    } catch (error) {
      this.setData({ screen: 'error', error: error.message || '没有生成合适的推荐' })
    } finally {
      this.setData({ loading: false, regenerating: false })
    }
  },

  async retry() {
    if (await this.ensureLogin()) this.generate()
  },

  async apply() {
    if (this.data.loading || this.data.applying || this.data.regenerating || this.data.applied || !this.data.recommendation) return
    this.setData({ applying: true, error: '' })
    try {
      for (const item of this.data.recommendation.items) {
        await request('/menus/items', 'POST', buildMenuItemPayload(item.id, this.data.date, 'dinner', '来自今日推荐'))
      }
      this.setData({ screen: 'confirmed', applied: true })
    } catch (error) {
      this.setData({ screen: 'error', error: error.message || '菜单安排失败' })
    } finally {
      this.setData({ applying: false })
    }
  },

  viewMenu() {
    wx.switchTab({ url: '/pages/menu/index' })
  },

  viewRecipe() {
    const primary = this.data.recommendation?.items?.[0]
    if (primary) wx.navigateTo({ url: `/pages/recipe-detail/index?id=${primary.id}` })
  }
})
