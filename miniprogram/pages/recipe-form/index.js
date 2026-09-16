const { request, uploadFile, resolveCoverUrl, requireAuthentication } = require('../../utils/api')
const {
  parseRecipeSteps,
  serializeIngredients,
  serializeRecipeSteps
} = require('../../utils/ui')
const { decorateTagOptions, flattenTagCatalog, normalizeTagIds, toggleTagId } = require('../../utils/tags')

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

function emptyIngredientDraft() {
  return { ingredientId: 0, ingredientName: '', amountGrams: 100, note: '' }
}

function serializeFormState(form, stepItems, coverPath = '', selectedTagIds = []) {
  return JSON.stringify({
    form: {
      title: String(form.title || ''),
      category: String(form.category || ''),
      cookMinutes: Number(form.cookMinutes || 0),
      difficulty: Number(form.difficulty || 0),
      servings: Number(form.servings || 0),
      description: String(form.description || ''),
      ingredients: (form.ingredients || []).map((item) => ({
        ingredientId: Number(item.ingredientId || 0),
        amountGrams: Number(item.amountGrams || 0),
        note: String(item.note || '')
      }))
    },
    steps: (stepItems || []).map((item) => String(item && item.text || '')),
    coverUrl: String(coverPath || ''),
    tagIds: normalizeTagIds(selectedTagIds)
  })
}

Page({
  data: {
    id: 0,
    isEdit: false,
    loading: true,
    saving: false,
    uploadingCover: false,
    isDirty: false,
    initialSnapshot: '',
    navStyle: '',
    contentStyle: '',
    coverUrl: '',
    coverPath: '',
    coverInitial: '菜',
    ingredientsOptions: [],
    tagCatalog: [],
    tagOptions: [],
    selectedTagIds: [],
    tagLoading: false,
    tagError: '',
    creatingTag: false,
    ingredientSheetOpen: false,
    editingIngredientIndex: -1,
    ingredientOptionIndex: 0,
    ingredientDraft: emptyIngredientDraft(),
    editingStepIndex: -1,
    categories: ['荤菜', '素菜', '汤', '主食'],
    categoryIndex: 1,
    difficultyIndex: 0,
    difficultyText: '简单',
    difficulties: [
      { value: 1, label: '简单' },
      { value: 2, label: '适中' },
      { value: 3, label: '进阶' }
    ],
    stepItems: parseRecipeSteps('', 1),
    nextStepKey: 2,
    form: {
      title: '',
      category: '素菜',
      cookMinutes: 20,
      difficulty: 1,
      servings: 2,
      description: '',
      ingredients: []
    }
  },

  onLoad(options) {
    if (!requireAuthentication()) return
    const id = Number(options.id || 0)
    this.setData({ id, isEdit: Boolean(id), ...getNavigationLayout() }, () => this.initialize())
  },

  onShow() {
    if (!requireAuthentication()) return
    if (!this._tagManagementOpened) return
    this._tagManagementOpened = false
    this.loadTags()
  },

  refreshDirtyState() {
    const snapshot = serializeFormState(this.data.form, this.data.stepItems, this.data.coverPath, this.data.selectedTagIds)
    this.setData({ isDirty: Boolean(this.data.initialSnapshot && snapshot !== this.data.initialSnapshot) })
  },

  captureInitialSnapshot() {
    this.setData({
      initialSnapshot: serializeFormState(this.data.form, this.data.stepItems, this.data.coverPath, this.data.selectedTagIds),
      isDirty: false
    })
  },

  async initialize() {
    this.setData({ loading: true })
    try {
      const ingredientsOptions = await request('/ingredients')
      if (!this.data.isEdit) {
        this.setData({ ingredientsOptions })
        await this.loadTags()
        this._initialized = true
        this.captureInitialSnapshot()
        return
      }
      const recipe = await request(`/recipes/${this.data.id}`)
      const difficultyIndex = Math.max(0, Number(recipe.difficulty) - 1)
      const stepItems = parseRecipeSteps(recipe.steps || '', 1)
      const selectedTagIds = normalizeTagIds((recipe.tags || []).map((tag) => tag.id))
      this.setData({
        ingredientsOptions,
        coverPath: recipe.coverUrl || '',
        coverUrl: resolveCoverUrl(recipe.coverUrl || ''),
        coverInitial: String(recipe.title || '菜').slice(0, 1),
        categoryIndex: Math.max(0, this.data.categories.indexOf(recipe.category)),
        difficultyIndex,
        difficultyText: this.data.difficulties[difficultyIndex].label,
        stepItems,
        editingStepIndex: -1,
        nextStepKey: stepItems.length + 1,
        selectedTagIds,
        tagOptions: decorateTagOptions([], selectedTagIds, recipe.tags || []),
        form: {
          title: recipe.title,
          category: recipe.category,
          cookMinutes: recipe.cookMinutes,
          difficulty: recipe.difficulty,
          servings: recipe.servings || 2,
          description: recipe.description || '',
          ingredients: (recipe.ingredients || []).map((item) => ({
            ingredientId: item.ingredientId,
            ingredientName: item.name,
            amountGrams: item.amountGrams,
            note: item.note || '',
            initial: String(item.name || '食').slice(0, 1)
          }))
        }
      })
      await this.loadTags(recipe.tags || [])
      this._initialized = true
      this.captureInitialSnapshot()
    } catch (error) {
      wx.showModal({
        title: '加载失败',
        content: error.message || '无法打开菜谱表单',
        showCancel: false,
        success: () => wx.navigateBack()
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadTags(recipeTags = this.data.tagOptions) {
    if (this.data.tagLoading) return
    this.setData({ tagLoading: true, tagError: '' })
    try {
      const tagCatalog = flattenTagCatalog(await request('/tags'))
      const validTagIds = new Set(tagCatalog.map((tag) => Number(tag.id)))
      const selectedTagIds = this.data.selectedTagIds.filter((tagId) => validTagIds.has(Number(tagId)))
      this.setData({
        tagCatalog,
        selectedTagIds,
        tagOptions: decorateTagOptions(tagCatalog, selectedTagIds, recipeTags)
      })
    } catch (error) {
      this.setData({ tagError: error.message || '标签加载失败' })
    } finally {
      this.setData({ tagLoading: false })
    }
  },

  retryTags() {
    this.loadTags()
  },

  toggleRecipeTag(event) {
    const tagId = Number(event.currentTarget.dataset.tagId)
    const tag = this.data.tagOptions.find((item) => item.id === tagId)
    if (!tag) return
    if (!tag.selected && this.data.selectedTagIds.length >= 3) {
      wx.showToast({ title: '最多选择3个最有代表性的标签', icon: 'none' })
      return
    }
    const selectedTagIds = toggleTagId(this.data.selectedTagIds, tagId)
    this.setData({
      selectedTagIds,
      tagOptions: decorateTagOptions(this.data.tagCatalog, selectedTagIds, this.data.tagOptions)
    }, () => this.refreshDirtyState())
  },

  createCustomTag() {
    if (this.data.creatingTag || this.data.saving) return
    if (this.data.selectedTagIds.length >= 3) {
      wx.showToast({ title: '最多选择3个最有代表性的标签', icon: 'none' })
      return
    }
    wx.showModal({
      title: '新建标签',
      editable: true,
      placeholderText: '输入标签名称',
      confirmText: '创建',
      success: async (result) => {
        const name = String(result.content || '').trim()
        if (!result.confirm) return
        if (!name) {
          wx.showToast({ title: '请输入标签名称', icon: 'none' })
          return
        }
        this.setData({ creatingTag: true })
        try {
          const created = await request('/tags', 'POST', { name })
          const tagCatalog = this.data.tagCatalog.concat(created)
          const selectedTagIds = toggleTagId(this.data.selectedTagIds, created.id)
          this.setData({ tagCatalog, selectedTagIds, tagOptions: decorateTagOptions(tagCatalog, selectedTagIds, this.data.tagOptions) }, () => this.refreshDirtyState())
          wx.showToast({ title: '标签已创建', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: Number(error.status) === 409 ? '这个标签已经存在' : (error.message || '创建标签失败'), icon: 'none' })
        } finally {
          this.setData({ creatingTag: false })
        }
      }
    })
  },

  openTagManagement() {
    if (this.data.tagLoading || this.data.creatingTag || this.data.saving) return
    this._tagManagementOpened = true
    wx.navigateTo({ url: '/pages/tag-management/index' })
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field
    const update = { [`form.${field}`]: event.detail.value }
    if (field === 'title') update.coverInitial = String(event.detail.value || '菜').slice(0, 1)
    this.setData(update, () => this.refreshDirtyState())
  },

  changeCategory(event) {
    const categoryIndex = Number(event.detail.value)
    this.setData({ categoryIndex, 'form.category': this.data.categories[categoryIndex] }, () => this.refreshDirtyState())
  },

  changeDifficulty(event) {
    const difficultyIndex = Number(event.detail.value)
    const difficulty = this.data.difficulties[difficultyIndex]
    this.setData({ difficultyIndex, difficultyText: difficulty.label, 'form.difficulty': difficulty.value }, () => this.refreshDirtyState())
  },

  openIngredientSheet() {
    const first = this.data.ingredientsOptions[0]
    if (!first) {
      wx.showToast({ title: '暂无可选食材', icon: 'none' })
      return
    }
    this.setData({
      ingredientSheetOpen: true,
      editingIngredientIndex: -1,
      ingredientOptionIndex: 0,
      ingredientDraft: {
        ingredientId: first.id,
        ingredientName: first.name,
        amountGrams: 100,
        note: ''
      }
    })
  },

  editIngredient(event) {
    const index = Number(event.currentTarget.dataset.index)
    const item = this.data.form.ingredients[index]
    if (!item) return
    const ingredientOptionIndex = Math.max(0, this.data.ingredientsOptions.findIndex((option) => Number(option.id) === Number(item.ingredientId)))
    this.setData({
      ingredientSheetOpen: true,
      editingIngredientIndex: index,
      ingredientOptionIndex,
      ingredientDraft: {
        ingredientId: item.ingredientId,
        ingredientName: item.ingredientName,
        amountGrams: item.amountGrams,
        note: item.note || ''
      }
    })
  },

  closeIngredientSheet() {
    this.setData({
      ingredientSheetOpen: false,
      editingIngredientIndex: -1,
      ingredientDraft: emptyIngredientDraft()
    })
  },

  changeIngredientDraftChoice(event) {
    const ingredientOptionIndex = Number(event.detail.value)
    const option = this.data.ingredientsOptions[ingredientOptionIndex]
    if (!option) return
    this.setData({
      ingredientOptionIndex,
      'ingredientDraft.ingredientId': option.id,
      'ingredientDraft.ingredientName': option.name
    })
  },

  updateIngredientDraft(event) {
    this.setData({ [`ingredientDraft.${event.currentTarget.dataset.field}`]: event.detail.value })
  },

  confirmIngredient() {
    const draft = this.data.ingredientDraft
    const editingIndex = this.data.editingIngredientIndex
    if (!draft.ingredientId || Number(draft.amountGrams) <= 0) {
      wx.showToast({ title: '请填写有效的食材用量', icon: 'none' })
      return
    }
    const duplicate = this.data.form.ingredients.some((item, index) => (
      index !== editingIndex && Number(item.ingredientId) === Number(draft.ingredientId)
    ))
    if (duplicate) {
      wx.showToast({ title: '这项食材已经添加', icon: 'none' })
      return
    }
    const nextItem = {
      ingredientId: Number(draft.ingredientId),
      ingredientName: draft.ingredientName,
      amountGrams: Number(draft.amountGrams),
      note: String(draft.note || '').trim(),
      initial: String(draft.ingredientName || '食').slice(0, 1)
    }
    const ingredients = this.data.form.ingredients.slice()
    if (editingIndex >= 0) ingredients[editingIndex] = nextItem
    else ingredients.push(nextItem)
    this.setData({ 'form.ingredients': ingredients }, () => {
      this.closeIngredientSheet()
      this.refreshDirtyState()
    })
  },

  confirmRemoveIngredient(index) {
    const item = this.data.form.ingredients[index]
    if (!item) return Promise.resolve(false)
    return new Promise((resolve) => wx.showModal({
      title: '删除食材',
      content: `确定删除${item.ingredientName}吗？`,
      cancelText: '取消',
      confirmText: '删除',
      confirmColor: '#c13515',
      success: (result) => resolve(result.confirm)
    }))
  },

  async removeIngredient(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (!await this.confirmRemoveIngredient(index)) return
    this.setData({
      'form.ingredients': this.data.form.ingredients.filter((_, itemIndex) => itemIndex !== index)
    }, () => this.refreshDirtyState())
  },

  async removeIngredientFromSheet() {
    const index = this.data.editingIngredientIndex
    if (index < 0) return
    if (!await this.confirmRemoveIngredient(index)) return
    this.setData({
      'form.ingredients': this.data.form.ingredients.filter((_, itemIndex) => itemIndex !== index)
    }, () => {
      this.closeIngredientSheet()
      this.refreshDirtyState()
    })
  },

  updateStep(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`stepItems[${index}].text`]: event.detail.value }, () => this.refreshDirtyState())
  },

  addStep() {
    const key = `step-${this.data.nextStepKey}`
    const editingStepIndex = this.data.stepItems.length
    this.setData({
      stepItems: this.data.stepItems.concat({ key, text: '' }),
      editingStepIndex,
      nextStepKey: this.data.nextStepKey + 1
    }, () => this.refreshDirtyState())
  },

  beginStepEdit(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (index < 0 || index >= this.data.stepItems.length) return
    this.setData({ editingStepIndex: index })
  },

  finishStepEdit(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (index !== this.data.editingStepIndex) return
    this.setData({ editingStepIndex: -1 }, () => this.refreshDirtyState())
  },

  removeStep(event) {
    const index = Number(event.currentTarget.dataset.index)
    const editingStepIndex = this.data.editingStepIndex === index
      ? -1
      : this.data.editingStepIndex > index
        ? this.data.editingStepIndex - 1
        : this.data.editingStepIndex
    this.setData({
      stepItems: this.data.stepItems.filter((_, itemIndex) => itemIndex !== index),
      editingStepIndex
    }, () => this.refreshDirtyState())
  },

  moveStep(event) {
    const index = Number(event.currentTarget.dataset.index)
    const target = index + Number(event.currentTarget.dataset.direction)
    if (target < 0 || target >= this.data.stepItems.length) return
    const stepItems = this.data.stepItems.slice()
    const current = stepItems[index]
    stepItems[index] = stepItems[target]
    stepItems[target] = current
    this.setData({ stepItems }, () => this.refreshDirtyState())
  },

  chooseCoverImage() {
    if (this.data.saving || this.data.loading || this.data.uploadingCover) return
    const success = (result) => {
      const tempFile = result && result.tempFiles && result.tempFiles[0]
      const tempFilePath = tempFile && tempFile.tempFilePath
        ? tempFile.tempFilePath
        : result && result.tempFilePaths && result.tempFilePaths[0]
      this.uploadCoverImage(tempFilePath)
    }
    if (typeof wx.chooseMedia === 'function') {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success
      })
      return
    }
    wx.chooseImage({ count: 1, sourceType: ['album', 'camera'], success })
  },

  async uploadCoverImage(tempFilePath) {
    if (!tempFilePath || this.data.saving || this.data.uploadingCover) return
    this.setData({ uploadingCover: true })
    try {
      const result = await uploadFile(tempFilePath)
      const coverPath = String(result && result.coverUrl || '')
      if (!coverPath) throw new Error('上传未返回封面地址')
      this.setData({ coverPath, coverUrl: resolveCoverUrl(coverPath) }, () => this.refreshDirtyState())
    } catch (error) {
      wx.showToast({ title: error.message || '封面上传失败', icon: 'none' })
    } finally {
      this.setData({ uploadingCover: false })
    }
  },

  handleCoverError() {
    this.setData({ coverUrl: '' })
  },

  back() {
    if (!this.data.isDirty) {
      wx.navigateBack()
      return
    }
    wx.showModal({
      title: '修改尚未保存',
      content: '确定退出吗？',
      cancelText: '继续编辑',
      confirmText: '放弃修改',
      confirmColor: '#111111',
      success: (result) => {
        if (result.confirm) wx.navigateBack()
      }
    })
  },

  noop() {},

  async save() {
    if (this.data.saving || this.data.loading || this.data.uploadingCover) return
    const form = this.data.form
    if (!String(form.title).trim()) {
      wx.showToast({ title: '请填写菜名', icon: 'none' })
      return
    }
    if (Number(form.cookMinutes) <= 0 || Number(form.servings) <= 0) {
      wx.showToast({ title: '耗时和份量必须大于 0', icon: 'none' })
      return
    }
    const payload = {
      title: String(form.title).trim(),
      category: form.category,
      cookMinutes: Number(form.cookMinutes),
      difficulty: Number(form.difficulty),
      servings: Number(form.servings),
      description: String(form.description || '').trim(),
      steps: serializeRecipeSteps(this.data.stepItems),
      ingredients: serializeIngredients(form.ingredients),
      coverUrl: this.data.coverPath || '',
      tagIds: this.data.selectedTagIds
    }
    if (payload.ingredients.length !== form.ingredients.length) {
      wx.showToast({ title: '请补全食材及用量', icon: 'none' })
      return
    }
    if (!payload.ingredients.length) {
      wx.showToast({ title: '至少添加一种食材', icon: 'none' })
      return
    }
    if (!payload.steps.trim()) {
      wx.showToast({ title: '至少填写一个制作步骤', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      if (this.data.isEdit) await request(`/recipes/${this.data.id}`, 'PUT', payload)
      else await request('/recipes', 'POST', payload)
      this.captureInitialSnapshot()
      wx.showToast({ title: this.data.isEdit ? '已保存' : '已创建', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 450)
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  }
})
