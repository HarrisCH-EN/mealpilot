const { request } = require('../../utils/api')
const {
  parseRecipeSteps,
  serializeIngredients,
  serializeRecipeSteps
} = require('../../utils/ui')

function getNavigationLayout() {
  const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const statusBarHeight = Number(windowInfo.statusBarHeight || 20)
  let capsule = null
  try {
    capsule = wx.getMenuButtonBoundingClientRect()
  } catch (_error) {
    capsule = null
  }
  const contentHeight = capsule && capsule.height
    ? capsule.height + Math.max(0, capsule.top - statusBarHeight) * 2
    : 44
  const navigationHeight = statusBarHeight + contentHeight
  const rightInset = capsule && capsule.left
    ? Math.max(16, windowInfo.windowWidth - capsule.left + 8)
    : 16
  return {
    navStyle: `height:${navigationHeight}px;padding-top:${statusBarHeight}px;padding-right:${rightInset}px;`,
    contentStyle: `padding-top:${navigationHeight}px;`
  }
}

function emptyIngredientDraft() {
  return { ingredientId: 0, ingredientName: '', amountGrams: 100, note: '' }
}

Page({
  data: {
    id: 0,
    isEdit: false,
    loading: true,
    saving: false,
    navStyle: '',
    contentStyle: '',
    coverUrl: '',
    coverInitial: '菜',
    ingredientsOptions: [],
    ingredientSheetOpen: false,
    editingIngredientIndex: -1,
    ingredientOptionIndex: 0,
    ingredientDraft: emptyIngredientDraft(),
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
    const id = Number(options.id || 0)
    this.setData({ id, isEdit: Boolean(id), ...getNavigationLayout() }, () => this.initialize())
  },

  async initialize() {
    this.setData({ loading: true })
    try {
      const ingredientsOptions = await request('/ingredients')
      if (!this.data.isEdit) {
        this.setData({ ingredientsOptions })
        return
      }
      const recipe = await request(`/recipes/${this.data.id}`)
      const difficultyIndex = Math.max(0, Number(recipe.difficulty) - 1)
      const stepItems = parseRecipeSteps(recipe.steps || '', 1)
      this.setData({
        ingredientsOptions,
        coverUrl: recipe.coverUrl || '',
        coverInitial: String(recipe.title || '菜').slice(0, 1),
        categoryIndex: Math.max(0, this.data.categories.indexOf(recipe.category)),
        difficultyIndex,
        difficultyText: this.data.difficulties[difficultyIndex].label,
        stepItems,
        nextStepKey: stepItems.length + 1,
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

  updateField(event) {
    const field = event.currentTarget.dataset.field
    const update = { [`form.${field}`]: event.detail.value }
    if (field === 'title') update.coverInitial = String(event.detail.value || '菜').slice(0, 1)
    this.setData(update)
  },

  changeCategory(event) {
    const categoryIndex = Number(event.detail.value)
    this.setData({ categoryIndex, 'form.category': this.data.categories[categoryIndex] })
  },

  changeDifficulty(event) {
    const difficultyIndex = Number(event.detail.value)
    const difficulty = this.data.difficulties[difficultyIndex]
    this.setData({ difficultyIndex, difficultyText: difficulty.label, 'form.difficulty': difficulty.value })
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
    this.setData({ 'form.ingredients': ingredients }, () => this.closeIngredientSheet())
  },

  removeIngredient(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({
      'form.ingredients': this.data.form.ingredients.filter((_, itemIndex) => itemIndex !== index)
    })
  },

  updateStep(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`stepItems[${index}].text`]: event.detail.value })
  },

  addStep() {
    const key = `step-${this.data.nextStepKey}`
    this.setData({
      stepItems: this.data.stepItems.concat({ key, text: '' }),
      nextStepKey: this.data.nextStepKey + 1
    })
  },

  removeStep(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ stepItems: this.data.stepItems.filter((_, itemIndex) => itemIndex !== index) })
  },

  moveStep(event) {
    const index = Number(event.currentTarget.dataset.index)
    const target = index + Number(event.currentTarget.dataset.direction)
    if (target < 0 || target >= this.data.stepItems.length) return
    const stepItems = this.data.stepItems.slice()
    const current = stepItems[index]
    stepItems[index] = stepItems[target]
    stepItems[target] = current
    this.setData({ stepItems })
  },

  handleCoverError() {
    this.setData({ coverUrl: '' })
  },

  back() {
    wx.navigateBack()
  },

  noop() {},

  async save() {
    if (this.data.saving || this.data.loading) return
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
      ingredients: serializeIngredients(form.ingredients)
    }
    if (payload.ingredients.length !== form.ingredients.length) {
      wx.showToast({ title: '请补全食材及用量', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      if (this.data.isEdit) await request(`/recipes/${this.data.id}`, 'PUT', payload)
      else await request('/recipes', 'POST', payload)
      wx.showToast({ title: this.data.isEdit ? '已保存' : '已创建', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 450)
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  }
})
