const { parseLocalDate, shiftDate, toLocalISODate } = require('../../utils/ui')

const MEAL_STYLE = {
  breakfast: { theme: 'breakfast', note: '美好的一天，从一顿好早餐开始。' },
  lunch: { theme: 'lunch', note: '好好吃午餐，给下午充满能量。' },
  dinner: { theme: 'dinner', note: '简单的晚餐，也是一种幸福。' }
}

function weekdayLabel(date) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
}

function toDateSet(value) {
  if (value instanceof Set) return value
  return new Set(Array.isArray(value) ? value : [])
}

function buildDateItems(anchorDate, options = {}) {
  const anchor = parseLocalDate(anchorDate)
  const before = Number.isInteger(options.before) ? options.before : 14
  const after = Number.isInteger(options.after) ? options.after : 30
  const menuDateSet = toDateSet(options.menuDateSet || options.menuDates)
  const todayValue = options.todayValue || ''
  const selectedDate = options.selectedDate || ''
  return Array.from({ length: before + after + 1 }, (_, index) => {
    const date = new Date(anchor)
    date.setDate(anchor.getDate() + index - before)
    const value = toLocalISODate(date)
    return {
      value,
      month: index === 0 || date.getDate() === 1 ? `${date.getMonth() + 1}月` : '',
      monthLabel: `${date.getMonth() + 1}月`,
      weekday: weekdayLabel(date),
      day: date.getDate(),
      isToday: value === todayValue,
      isSelected: value === selectedDate,
      hasMenu: menuDateSet.has(value)
    }
  })
}

function buildTimelineItems(anchorDate, options = {}) {
  return buildDateItems(anchorDate, { ...options, selectedDate: '' }).map(({ isSelected, ...item }) => item)
}

const DATE_ITEM_WIDTH_RPX = 76
const DATE_ITEM_GAP_RPX = 8
const DATE_RAIL_CONTEXT_RPX = 104
const DATE_LIST_PADDING_RPX = 4

function getDateRailMetrics(windowWidth = 375) {
  const rpxToPx = Number(windowWidth) / 750
  const itemStep = (DATE_ITEM_WIDTH_RPX + DATE_ITEM_GAP_RPX) * rpxToPx
  return {
    itemStep,
    itemWidth: DATE_ITEM_WIDTH_RPX * rpxToPx,
    itemGap: DATE_ITEM_GAP_RPX * rpxToPx,
    listPadding: DATE_LIST_PADDING_RPX * rpxToPx,
    contextWidth: DATE_RAIL_CONTEXT_RPX * rpxToPx,
    viewportWidth: (750 - DATE_RAIL_CONTEXT_RPX) * rpxToPx
  }
}

function getDateScrollLeft(index, total, metrics) {
  const safeIndex = Math.max(0, Math.min(Number(index) || 0, Math.max(0, total - 1)))
  const contentWidth = (total * metrics.itemWidth)
    + (Math.max(0, total - 1) * metrics.itemGap)
    + (metrics.listPadding * 2)
  const maxScroll = Math.max(0, contentWidth - metrics.viewportWidth)
  const selectedItemCenter = metrics.listPadding + (safeIndex * metrics.itemStep) + (metrics.itemWidth / 2)
  const centered = selectedItemCenter - (metrics.viewportWidth / 2)
  return Math.max(0, Math.min(Math.round(centered), Math.round(maxScroll)))
}

function getDateRevealScrollLeft(index, total, currentScrollLeft, metrics) {
  const safeIndex = Math.max(0, Math.min(Number(index) || 0, Math.max(0, total - 1)))
  const current = Math.max(0, Number(currentScrollLeft) || 0)
  const itemLeft = metrics.listPadding + (safeIndex * metrics.itemStep)
  const itemRight = itemLeft + metrics.itemWidth
  const viewportRight = current + metrics.viewportWidth
  let target = current
  if (itemLeft < current) target = itemLeft
  else if (itemRight > viewportRight) target = itemRight - metrics.viewportWidth
  const contentWidth = (total * metrics.itemWidth)
    + (Math.max(0, total - 1) * metrics.itemGap)
    + (metrics.listPadding * 2)
  const maxScroll = Math.max(0, contentWidth - metrics.viewportWidth)
  return Math.max(0, Math.min(Math.round(target), Math.round(maxScroll)))
}

function getDateRailState({ dateItems, scrollLeft, metrics }) {
  const total = dateItems.length
  const firstVisibleIndex = Math.max(0, Math.min(total - 1, Math.floor((Number(scrollLeft) || 0) / metrics.itemStep)))
  const lastVisibleIndex = Math.max(firstVisibleIndex, Math.min(total - 1, Math.ceil(((Number(scrollLeft) || 0) + metrics.viewportWidth) / metrics.itemStep) - 1))
  const primaryIndex = Math.max(firstVisibleIndex, Math.min(lastVisibleIndex, Math.round((firstVisibleIndex + lastVisibleIndex) / 2)))
  return {
    firstVisibleIndex,
    lastVisibleIndex,
    visibleMonth: dateItems[primaryIndex]?.monthLabel || ''
  }
}

function getCalendarPanelHeight(rows) {
  return 158 + (Math.max(4, Math.min(6, Number(rows) || 5)) * 64)
}

function getCalendarRowCount(value) {
  const start = monthStart(value)
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
  return Math.ceil((start.getDay() + lastDay) / 7)
}

function monthStart(value) {
  const date = parseLocalDate(value)
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function shiftMonth(value, amount) {
  const start = monthStart(value)
  return toLocalISODate(new Date(start.getFullYear(), start.getMonth() + Number(amount || 0), 1))
}

function buildCalendarMonth(value, todayValue = toLocalISODate(new Date()), menuDateSet = []) {
  const start = monthStart(value)
  const gridStart = new Date(start)
  gridStart.setDate(1 - start.getDay())
  const knownMenuDates = toDateSet(menuDateSet)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    const dayValue = toLocalISODate(date)
    return {
      value: dayValue,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === start.getMonth(),
      isToday: dayValue === todayValue,
      hasMenu: knownMenuDates.has(dayValue)
    }
  })
}

function mealRole(index, activeIndex) {
  const offset = (index - activeIndex + 3) % 3
  return offset === 0 ? 'active' : offset === 1 ? 'next' : 'prev'
}

function buildMealCards(meals, activeIndex) {
  return meals.map((meal, index) => {
    const style = MEAL_STYLE[meal.mealType] || MEAL_STYLE.dinner
    const items = meal.items || []
    return {
      ...meal,
      items,
      theme: style.theme,
      note: style.note,
      role: mealRole(index, activeIndex),
      itemCount: items.length,
      moreCount: 0
    }
  })
}

function nextMealIndex(index) {
  return (Number(index) + 1) % 3
}

function previousMealIndex(index) {
  return (Number(index) + 2) % 3
}

function isHorizontalSwipe(start, end, threshold = 50) {
  const deltaX = Number(end.x) - Number(start.x)
  const deltaY = Number(end.y) - Number(start.y)
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY)) return ''
  return deltaX < 0 ? 'next' : 'previous'
}

module.exports = {
  buildDateItems,
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
  previousMealIndex,
  shiftMonth,
  shiftDate
}
