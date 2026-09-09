function normalizeContext(value) {
  if (!value || typeof value !== 'object') return null
  const action = String(value.action || '')
  const menuDate = String(value.menuDate || '')
  const mealType = String(value.mealType || '')
  const menuItemId = Number(value.menuItemId || 0)
  if (!['add', 'focus'].includes(action) || !/^\d{4}-\d{2}-\d{2}$/.test(menuDate) || !['breakfast', 'lunch', 'dinner'].includes(mealType)) return null
  return { action, menuDate, mealType, menuItemId: Number.isInteger(menuItemId) && menuItemId > 0 ? menuItemId : 0 }
}

function createMenuContextStore(state) {
  return {
    set(value) {
      state.menuContext = normalizeContext(value)
      return state.menuContext
    },
    consume(action) {
      const context = normalizeContext(state.menuContext)
      if (!context || context.action !== action) return null
      state.menuContext = null
      return context
    },
    clear() {
      state.menuContext = null
    }
  }
}

function getMenuContextStore() {
  return createMenuContextStore(getApp().globalData)
}

module.exports = { createMenuContextStore, getMenuContextStore }
