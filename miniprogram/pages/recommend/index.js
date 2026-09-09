const { request, ensureAuthenticated, resolveCoverUrl, isNoActiveFamilyError } = require('../../utils/api')
const app = getApp()
const { difficultyStars, getGreeting, toLocalISODate } = require('../../utils/ui')
const { displayTags, flattenTagCatalog } = require('../../utils/tags')
const {
  DEFAULT_STRUCTURE,
  PREP_TIME_OPTIONS,
  STRUCTURE_LABELS,
  buildCanonicalRequest,
  normalizePeopleCount,
  normalizeStructure,
  structureDishCount,
  structureSummary,
  toggleTagId,
  validateStructure
} = require('./preference-state')

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const PREP_TICK_WIDTH_PX = 12
const PREP_DISPLAY_STEP = 5

const PREP_TICKS = PREP_TIME_OPTIONS.filter(({ value }) => value % PREP_DISPLAY_STEP === 0).map(({ value }) => ({
  value,
  isMajor: value % 15 === 0,
  isMedium: value % 15 !== 0,
  label: value % 15 === 0 ? String(value) : ''
}))

function prepDisplayIndex(value) {
  const numericValue = Number(value)
  const index = PREP_TICKS.findIndex((item) => item.value >= numericValue)
  return index >= 0 ? index : PREP_TICKS.length - 1
}

function dateCaption(date) {
  const [year, month, day] = String(date).split('-').map(Number)
  return `${month}月${day}日 · ${WEEKDAYS[new Date(year, month - 1, day).getDay()]}`
}

function tagOptions(tags = [], selected = []) {
  const selectedIds = new Set(selected.map(Number))
  return tags.map((item) => ({ ...item, selected: selectedIds.has(Number(item.id)) }))
}

function normalizeCandidate(candidate = {}) {
  const items = Array.isArray(candidate.items) ? candidate.items.map((item) => ({
    ...item,
    recipeId: Number(item.recipeId),
    title: String(item.title || '未命名菜谱'),
    category: String(item.category || '菜品'),
    cookMinutes: Number(item.cookMinutes || 0),
    difficulty: Number(item.difficulty || 1),
    difficultyStars: difficultyStars(item.difficulty),
    coverUrl: resolveCoverUrl(item.coverUrl),
    displayTags: displayTags(item.tags, 3),
    reason: String(item.reason || '符合本次搭配条件'),
    initial: String(item.title || '菜').slice(0, 1)
  })) : []
  return {
    ...candidate,
    runId: Number(candidate.runId || 0),
    candidateId: Number(candidate.candidateId || 0),
    rank: Number(candidate.rank || candidate.candidateRank || 1),
    items,
    estimatedPrepMinutes: Number(candidate.estimatedPrepMinutes || 0),
    withinTimeLimit: candidate.withinTimeLimit !== false,
    timeOverageMinutes: Number(candidate.timeOverageMinutes || 0),
    timeWarning: String(candidate.timeWarning || ''),
    reason: String(candidate.reason || '符合本次搭配条件')
  }
}

function structureRows(value) {
  const normalized = normalizeStructure(value)
  return STRUCTURE_LABELS.map((item) => ({ ...item, count: normalized[item.key] }))
}

Page({
  data: {
    screen: 'setup',
    date: toLocalISODate(),
    dateCaption: dateCaption(toLocalISODate()),
    greeting: getGreeting(new Date().getHours()),
    mealType: 'dinner',
    mealTypeLabel: '晚餐',
    peopleCount: 2,
    maxPrepMinutes: 60,
    prepOptions: PREP_TIME_OPTIONS,
    prepTicks: PREP_TICKS,
    prepScrollLeft: prepDisplayIndex(60) * PREP_TICK_WIDTH_PX,
    prepRulerInset: 0,
    structure: { ...DEFAULT_STRUCTURE },
    structureRows: structureRows(DEFAULT_STRUCTURE),
    structureTotal: structureDishCount(DEFAULT_STRUCTURE),
    structureSummary: structureSummary(DEFAULT_STRUCTURE),
    structureMessage: '',
    tagCatalog: [],
    tagOptions: [],
    tagLoading: false,
    tagError: '',
    preferences: { selectedTagIds: [] },
    loading: false,
    switching: false,
    applying: false,
    runId: null,
    candidateId: null,
    rank: 1,
    candidatesCount: 0,
    nextCandidateAvailable: false,
    currentCandidate: null,
    error: '',
    errorType: '',
    noFamily: false,
    preferenceOpen: false,
    preferenceSheetMode: 'peek'
  },

  onLoad() {
    this.syncPrepRuler()
    this.ensureLogin()
  },

  onShow() {
    this.setData({ greeting: getGreeting(new Date().getHours()) })
    if (this._loadedOnce) {
      if (!app.globalData.membership || this.data.noFamily) this.ensureLogin()
      return
    }
    this._loadedOnce = true
  },

  async ensureLogin() {
    try {
      const session = await ensureAuthenticated()
      app.globalData.user = session.user || app.globalData.user
      app.globalData.membership = session.membership || null
      if (!app.globalData.membership) {
        this.setData({ screen: 'no-family', noFamily: true, error: '' })
        return false
      }
      this.setData({ noFamily: false })
      await this.loadTags()
      return true
    } catch (error) {
      if (isNoActiveFamilyError(error)) {
        this.setData({ screen: 'no-family', noFamily: true, error: '' })
      } else {
        this.setData({ screen: 'error', noFamily: false, error: error.message || '暂时无法连接本地服务', errorType: 'generic' })
      }
      return false
    }
  },

  goFamilySetup() {
    wx.switchTab({ url: '/pages/settings/index' })
  },

  async loadTags() {
    if (this.data.tagLoading) return
    this.setData({ tagLoading: true, tagError: '' })
    try {
      const tagCatalog = flattenTagCatalog(await request('/tags'))
      const validIds = new Set(tagCatalog.map((tag) => tag.id))
      const selectedTagIds = this.data.preferences.selectedTagIds.filter((id) => validIds.has(Number(id)))
      this.setData({
        tagCatalog,
        tagOptions: tagOptions(tagCatalog, selectedTagIds),
        'preferences.selectedTagIds': selectedTagIds
      })
    } catch (error) {
      this.setData({ tagCatalog: [], tagOptions: [], 'preferences.selectedTagIds': [], tagError: error.message || '标签加载失败' })
    } finally {
      this.setData({ tagLoading: false })
    }
  },

  retryTags() {
    this.loadTags()
  },

  togglePreferences() {
    if (this.data.screen !== 'setup' || this.data.loading || this.data.switching || this.data.applying) return
    this.setData({
      preferenceOpen: !this.data.preferenceOpen,
      preferenceSheetMode: 'peek'
    })
  },

  closePreferences() {
    this.setData({ preferenceOpen: false, preferenceSheetMode: 'peek' })
  },

  handlePreferenceSheetTouchStart(event) {
    const touch = event && event.touches && event.touches[0]
    if (!touch) return
    this._preferenceSheetStartY = Number(touch.clientY)
  },

  handlePreferenceSheetTouchEnd(event) {
    const touch = event && event.changedTouches && event.changedTouches[0]
    const startY = Number(this._preferenceSheetStartY)
    if (!touch || !Number.isFinite(startY)) return
    this._preferenceSheetStartY = null
    const delta = Number(touch.clientY) - startY
    if (!Number.isFinite(delta) || Math.abs(delta) < 40) return
    if (delta < 0) {
      this.setData({ preferenceSheetMode: 'expanded' })
      return
    }
    if (this.data.preferenceSheetMode === 'expanded') {
      this.setData({ preferenceSheetMode: 'peek' })
      return
    }
    this.closePreferences()
  },

  changePeople(event) {
    const delta = Number(event.currentTarget.dataset.delta || 0)
    this.setData({ peopleCount: normalizePeopleCount(this.data.peopleCount + delta) })
  },

  syncPrepRuler() {
    if (!wx.getSystemInfoSync) return
    const { windowWidth = 375 } = wx.getSystemInfoSync()
    const viewportWidth = windowWidth - (72 * windowWidth / 750)
    const prepRulerInset = Math.max(0, Math.round(viewportWidth / 2 - PREP_TICK_WIDTH_PX / 2))
    this.setData({
      prepRulerInset,
      prepScrollLeft: prepDisplayIndex(this.data.maxPrepMinutes) * PREP_TICK_WIDTH_PX
    })
  },

  handlePrepScroll(event) {
    const scrollLeft = Number(event.detail && event.detail.scrollLeft)
    if (!Number.isFinite(scrollLeft)) return
    const index = Math.max(0, Math.min(PREP_TICKS.length - 1, Math.round(scrollLeft / PREP_TICK_WIDTH_PX)))
    const value = PREP_TICKS[index].value
    if (value === this.data.maxPrepMinutes) return
    this.setData({ maxPrepMinutes: value })
    this.maybeVibratePrepMajor(value)
  },

  maybeVibratePrepMajor(value) {
    if (value % 15 !== 0 || value === this._lastPrepHapticValue) return
    const now = Date.now()
    if (now - (this._lastPrepHapticAt || 0) < 120) return
    this._lastPrepHapticValue = value
    this._lastPrepHapticAt = now
    if (typeof wx.vibrateShort === 'function') {
      wx.vibrateShort({ type: 'light' })
    }
  },

  finishPrepScroll() {
    const value = Number(this.data.maxPrepMinutes)
    const index = prepDisplayIndex(value)
    this.setData({
      maxPrepMinutes: PREP_TICKS[index].value,
      prepScrollLeft: index * PREP_TICK_WIDTH_PX
    })
  },

  changeStructure(event) {
    const key = String(event.currentTarget.dataset.key || '')
    const delta = Number(event.currentTarget.dataset.delta || 0)
    if (!Object.prototype.hasOwnProperty.call(this.data.structure, key)) return
    const structure = normalizeStructure({ ...this.data.structure, [key]: Math.max(0, this.data.structure[key] + delta) })
    const validation = validateStructure(structure)
    this.setData({
      structure,
      structureRows: structureRows(structure),
      structureTotal: validation.total,
      structureSummary: structureSummary(structure),
      structureMessage: validation.message
    })
  },

  togglePreferenceTag(event) {
    const tagId = Number(event.currentTarget.dataset.tagId)
    if (!this.data.tagCatalog.some((tag) => tag.id === tagId)) return
    const selectedTagIds = toggleTagId(this.data.preferences.selectedTagIds, tagId)
    this.setData({
      'preferences.selectedTagIds': selectedTagIds,
      tagOptions: tagOptions(this.data.tagCatalog, selectedTagIds)
    })
  },

  buildRequest() {
    return buildCanonicalRequest({
      menuDate: this.data.date,
      mealType: this.data.mealType,
      peopleCount: this.data.peopleCount,
      maxPrepMinutes: this.data.maxPrepMinutes,
      structure: this.data.structure,
      preferences: this.data.preferences
    })
  },

  async generate() {
    if (this.data.loading || this.data.switching || this.data.applying) return
    const validation = validateStructure(this.data.structure)
    if (!validation.valid) {
      this.setData({ structureMessage: validation.message })
      return
    }
    if (!app.globalData.membership && !(await this.ensureLogin())) return
    this.setData({ screen: 'loading', loading: true, preferenceOpen: false, error: '', errorType: '' })
    try {
      const data = await request('/recommendations', 'POST', this.buildRequest())
      const candidates = Array.isArray(data.candidates) ? data.candidates.map(normalizeCandidate) : []
      const currentCandidate = candidates[0] || normalizeCandidate(data)
      this.setData({
        screen: 'result',
        loading: false,
        runId: Number(data.runId || currentCandidate.runId),
        candidateId: currentCandidate.candidateId,
        rank: currentCandidate.rank,
        candidatesCount: candidates.length || 1,
        nextCandidateAvailable: Boolean(data.nextCandidateAvailable || currentCandidate.nextCandidateAvailable),
        currentCandidate,
        error: ''
      })
    } catch (error) {
      this.handleRecommendationError(error)
    } finally {
      if (this.data.loading) this.setData({ loading: false })
    }
  },

  async nextCandidate() {
    if (this.data.switching || this.data.loading || this.data.applying || !this.data.nextCandidateAvailable) return
    this.setData({ switching: true, error: '' })
    try {
      const data = await request(`/recommendations/${this.data.runId}/candidates/${this.data.rank + 1}`)
      const currentCandidate = normalizeCandidate(data)
      this.setData({
        currentCandidate,
        candidateId: currentCandidate.candidateId,
        rank: currentCandidate.rank,
        nextCandidateAvailable: Boolean(currentCandidate.nextCandidateAvailable),
        candidatesCount: Math.max(this.data.candidatesCount, currentCandidate.rank)
      })
    } catch (error) {
      this.handleRecommendationError(error)
    } finally {
      this.setData({ switching: false })
    }
  },

  async previousCandidate() {
    if (this.data.switching || this.data.loading || this.data.applying || this.data.rank <= 1) return
    this.setData({ switching: true, error: '' })
    try {
      const data = await request(`/recommendations/${this.data.runId}/candidates/${this.data.rank - 1}`)
      const currentCandidate = normalizeCandidate(data)
      this.setData({
        currentCandidate,
        candidateId: currentCandidate.candidateId,
        rank: currentCandidate.rank,
        nextCandidateAvailable: Boolean(currentCandidate.nextCandidateAvailable),
        candidatesCount: Math.max(this.data.candidatesCount, currentCandidate.rank)
      })
    } catch (error) {
      this.handleRecommendationError(error)
    } finally {
      this.setData({ switching: false })
    }
  },

  async apply() {
    if (this.data.applying || this.data.loading || this.data.switching || !this.data.currentCandidate) return
    this.setData({ applying: true, error: '', errorType: '' })
    try {
      await request(`/recommendations/${this.data.runId}/apply`, 'POST', { candidateId: this.data.candidateId })
      this.setData({ screen: 'confirmed', applying: false })
    } catch (error) {
      this.handleRecommendationError(error)
    } finally {
      if (this.data.applying) this.setData({ applying: false })
    }
  },

  handleRecommendationError(error) {
    if (isNoActiveFamilyError(error)) {
      this.setData({ screen: 'no-family', noFamily: true, error: '', errorType: '' })
      return
    }
    const status = Number(error && error.status)
    if (status === 409) {
      this.setData({ screen: 'error', errorType: 'stale', error: '这组菜单的信息已经发生变化，请重新生成一次。' })
      return
    }
    if (status === 422) {
      this.setData({ screen: 'error', errorType: 'infeasible', error: '暂时凑不出这一桌，可以减少菜品数量或调整搭配。' })
      return
    }
    this.setData({ screen: 'error', errorType: 'generic', error: error.message || '暂时无法生成推荐，请稍后再试' })
  },

  retry() {
    if (this.data.errorType === 'stale' || this.data.errorType === 'infeasible') {
      this.backToSetup()
      return
    }
    this.generate()
  },

  backToSetup() {
    if (this.data.loading || this.data.switching || this.data.applying) return
    this.setData({ screen: 'setup', error: '', errorType: '' })
  },

  viewRecipeItem(event) {
    const recipeId = Number(event.currentTarget.dataset.id)
    if (recipeId) wx.navigateTo({ url: `/pages/recipe-detail/index?id=${recipeId}` })
  },

  handleImageError(event) {
    const index = Number(event.currentTarget.dataset.index)
    const items = (this.data.currentCandidate && this.data.currentCandidate.items || []).map((item, itemIndex) => itemIndex === index ? { ...item, coverUrl: '' } : item)
    this.setData({ 'currentCandidate.items': items })
  },

  viewMenu() {
    wx.switchTab({ url: '/pages/menu/index' })
  }
})
