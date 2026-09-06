const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  buildMenuItemPayload,
  buildRecipePath,
  difficultyLabel,
  normalizeMeals,
  normalizeFavoriteRecipeIds,
  parseRecipeSteps,
  serializeIngredients,
  serializeRecipeSteps,
  shiftDate,
  toggleFavoriteRecipeId,
  toLocalISODate
} = require('../utils/ui')

test('menu payload preserves selected date, meal and note', () => {
  assert.deepEqual(buildMenuItemPayload(7, '2026-09-05', 'lunch', ' 少盐 '), {
    recipeId: 7,
    menuDate: '2026-09-05',
    mealType: 'lunch',
    note: '少盐'
  })
})

test('recipe query only includes active filters', () => {
  assert.equal(buildRecipePath('', '全部'), '/recipes')
  assert.equal(buildRecipePath('番茄 鸡蛋', '荤菜'), '/recipes?keyword=%E7%95%AA%E8%8C%84%20%E9%B8%A1%E8%9B%8B&category=%E8%8D%A4%E8%8F%9C')
})

test('date helpers use local calendar dates and shift safely', () => {
  assert.equal(toLocalISODate(new Date(2026, 8, 4, 23, 30)), '2026-09-04')
  assert.equal(shiftDate('2026-02-28', 1), '2026-03-01')
})

test('menu normalization always returns breakfast, lunch and dinner', () => {
  const result = normalizeMeals([{ mealType: 'dinner', items: [{ id: 1 }] }])
  assert.deepEqual(result.map((item) => [item.mealType, item.items.length]), [
    ['breakfast', 0],
    ['lunch', 0],
    ['dinner', 1]
  ])
})

test('menu carousel view model keeps three meal cards ordered and swipe-safe', () => {
  const {
    buildDateItems,
    buildMealCards,
    nextMealIndex,
    previousMealIndex,
    isHorizontalSwipe
  } = require('../pages/menu/view-model')

  assert.equal(nextMealIndex(2), 0)
  assert.equal(previousMealIndex(0), 2)
  assert.equal(isHorizontalSwipe({ x: 100, y: 10 }, { x: 36, y: 16 }), 'next')
  assert.equal(isHorizontalSwipe({ x: 36, y: 16 }, { x: 100, y: 20 }), 'previous')
  assert.equal(isHorizontalSwipe({ x: 100, y: 10 }, { x: 76, y: 80 }), '')

  const dates = buildDateItems('2026-09-05')
  assert.equal(dates.length, 45)
  assert.equal(dates[14].value, '2026-09-05')

  const cards = buildMealCards(normalizeMeals([{ mealType: 'lunch', items: [{ id: 1, title: '番茄炒蛋' }] }]), 1)
  assert.deepEqual(cards.map((card) => [card.mealType, card.role]), [
    ['breakfast', 'prev'],
    ['lunch', 'active'],
    ['dinner', 'next']
  ])
})

test('menu date rail keeps fixed context and reveals only when explicitly requested', () => {
  const {
    buildDateItems,
    getDateRailMetrics,
    getDateRailState,
    getDateScrollLeft,
    getDateRevealScrollLeft,
    buildCalendarMonth,
    getCalendarPanelHeight,
    getCalendarRowCount
  } = require('../pages/menu/view-model')
  const dates = buildDateItems('2026-09-05', { todayValue: '2026-09-05', menuDateSet: ['2026-09-05'] })
  const metrics = getDateRailMetrics(390)
  assert.equal(getDateRailMetrics(390, true).viewportWidth, metrics.viewportWidth)
  assert.equal(getDateRailState({ dateItems: dates, scrollLeft: 0, metrics }).visibleMonth, dates[0].monthLabel)
  assert.equal(getDateScrollLeft(0, dates.length, metrics), 0)
  const visibleScroll = 200
  assert.equal(getDateRevealScrollLeft(10, dates.length, visibleScroll, metrics), visibleScroll)
  const leftReveal = getDateRevealScrollLeft(0, dates.length, visibleScroll, metrics)
  assert.ok(leftReveal < visibleScroll)
  const rightIndex = 20
  const rightReveal = getDateRevealScrollLeft(rightIndex, dates.length, visibleScroll, metrics)
  assert.ok(rightReveal > visibleScroll)

  const october = buildCalendarMonth('2026-10-15')
  assert.equal(october.length, 42)
  assert.deepEqual(october.find((day) => day.value === '2026-10-01'), {
    value: '2026-10-01', day: 1, isCurrentMonth: true, isToday: false, hasMenu: false
  })
  const markedOctober = buildCalendarMonth('2026-10-15', '2026-09-05', ['2026-10-23'])
  assert.equal(markedOctober.find((day) => day.value === '2026-10-23').hasMenu, true)
  assert.equal(getCalendarPanelHeight(5), 478)
  assert.equal(getCalendarPanelHeight(6), 542)
  assert.equal(getCalendarPanelHeight(4), 414)
  assert.equal(getCalendarRowCount('2026-02-01'), 4)
  assert.equal(getCalendarRowCount('2026-08-01'), 6)
})

test('menu date timeline stays fixed while selection changes', () => {
  const { buildTimelineItems } = require('../pages/menu/view-model')
  const options = { before: 120, after: 180, todayValue: '2026-09-05' }
  const first = buildTimelineItems('2026-09-05', options)
  const again = buildTimelineItems('2026-09-05', { ...options, selectedDate: '2026-12-01' })
  assert.equal(first.length, 301)
  assert.equal(first[0].value, '2026-05-08')
  assert.equal(first.at(-1).value, '2027-03-04')
  assert.equal(again[0].value, first[0].value)
  assert.equal(again.at(-1).value, first.at(-1).value)
  assert.equal(Object.prototype.hasOwnProperty.call(first[0], 'isSelected'), false)
})

test('ingredient serialization drops incomplete rows and converts numbers', () => {
  assert.deepEqual(serializeIngredients([
    { ingredientId: '3', amountGrams: '120', note: ' 切片 ' },
    { ingredientId: '', amountGrams: '40', note: '' }
  ]), [{ ingredientId: 3, amountGrams: 120, note: '切片' }])
  assert.equal(difficultyLabel(2), '适中')
})

test('recipe steps parse into stable editor rows and serialize back to TEXT', () => {
  assert.deepEqual(parseRecipeSteps('  虾仁腌制\r\n\r\n鸡蛋炒熟  ', 20), [
    { key: 'step-20', text: '虾仁腌制' },
    { key: 'step-21', text: '鸡蛋炒熟' }
  ])
  assert.deepEqual(parseRecipeSteps('', 3), [{ key: 'step-3', text: '' }])
  assert.equal(serializeRecipeSteps([
    { key: 'step-20', text: ' 虾仁腌制 ' },
    { key: 'step-21', text: '' },
    { key: 'step-22', text: '滑入蛋液' }
  ]), '虾仁腌制\n滑入蛋液')
})

test('local recipe favorites normalize storage values and toggle without duplicates', () => {
  assert.deepEqual(normalizeFavoriteRecipeIds(['7', 7, 3, 0, 'bad']), [7, 3])
  assert.deepEqual(normalizeFavoriteRecipeIds('not-an-array'), [])
  assert.deepEqual(toggleFavoriteRecipeId([7, 3], 7), [3])
  assert.deepEqual(toggleFavoriteRecipeId([7, 3], '9'), [7, 3, 9])
})

test('app config keeps four stable tabs with the Airbnb Rausch active state', () => {
  const root = path.join(__dirname, '..')
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  assert.equal(config.window.navigationBarTitleText, '')
  assert.equal(config.window.navigationBarBackgroundColor, '#ffffff')
  assert.equal(config.tabBar.selectedColor, '#ff385c')
  assert.ok(config.pages.includes('pages/recipe-detail/index'))
  assert.ok(config.pages.includes('pages/recipe-form/index'))
  assert.equal(config.tabBar.list.length, 4)
  for (const tab of config.tabBar.list) {
    assert.match(tab.iconPath, /^assets\/tab\/.+-outline\.png$/)
    assert.match(tab.selectedIconPath, /^assets\/tab\/.+-filled\.png$/)
    assert.ok(fs.existsSync(path.join(root, tab.iconPath)))
    assert.ok(fs.existsSync(path.join(root, tab.selectedIconPath)))
  }
  for (const pageName of ['recommend', 'menu', 'recipes', 'settings', 'recipe-detail', 'recipe-form']) {
    const pageConfig = JSON.parse(fs.readFileSync(path.join(root, 'pages', pageName, 'index.json'), 'utf8'))
    assert.equal(pageConfig.navigationBarTitleText, '')
  }
})

test('sitemap has a valid allow rule for DevTools preview', () => {
  const root = path.join(__dirname, '..')
  const sitemap = JSON.parse(fs.readFileSync(path.join(root, 'sitemap.json'), 'utf8'))
  assert.equal(sitemap.desc, '家宴计划')
  assert.deepEqual(sitemap.rules, [{ action: 'allow', page: '*' }])
})

test('global stylesheet exposes Airbnb color, type, spacing and component tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'app.wxss'), 'utf8')
  assert.match(css, /Airbnb Cereal VF/)
  assert.match(css, /--color-primary:\s*#ff385c/i)
  assert.match(css, /--color-ink:\s*#222222/i)
  assert.match(css, /--space-4:\s*16rpx/i)
  assert.match(css, /--radius-card:\s*28rpx/i)
  assert.match(css, /--shadow-float:/)
  assert.match(css, /\.button--primary/)
  assert.match(css, /\.search-surface/)
  assert.match(css, /\.bottom-sheet/)
  assert.match(css, /\.state-panel/)
})

test('tab pages keep global spacing while recipe catalog owns one fixed viewport', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'app.wxss'), 'utf8')
  const recipesCss = fs.readFileSync(path.join(__dirname, '..', 'pages', 'recipes', 'index.wxss'), 'utf8')
  assert.match(css, /\.page\s*\{[^}]*padding:\s*32rpx 32rpx 48rpx;/s)
  assert.doesNotMatch(css, /\.page\s*\{[^}]*min-height:\s*100vh;/s)
  assert.doesNotMatch(css, /\.page\s*\{[^}]*152rpx|\.page\s*\{[^}]*safe-area-inset-bottom/s)
  assert.match(recipesCss, /\.recipes-page\s*\{[^}]*height:\s*100vh;[^}]*overflow:\s*hidden;/s)
  assert.match(css, /\.button\s*\{[^}]*min-height:\s*88rpx;/s)
  assert.match(css, /\.button--small\s*\{[^}]*min-height:\s*72rpx;/s)
  assert.match(css, /\.search-surface\s*\{[^}]*min-height:\s*80rpx;/s)
})

test('recipe catalog uses compact two-column cards with stable actions', () => {
  const root = path.join(__dirname, '..', 'pages', 'recipes')
  const template = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  const css = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8')
  assert.doesNotMatch(template, /recipe-card__favorite/)
  assert.match(template, /recipe-card__menu/)
  assert.match(css, /\.recipe-grid\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s)
  assert.match(css, /\.recipe-card\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1;/s)
  assert.match(css, /\.recipe-card__photo\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s)
  assert.match(css, /\.recipe-card__title\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s)
})

test('round icon controls keep fixed square touch areas instead of stretching into pills', () => {
  const root = path.join(__dirname, '..', 'pages')
  const circleControls = [
    [path.join(root, 'recommend', 'index.wxss'), 'stepper__button', '64'],
    [path.join(root, 'menu', 'index.wxss'), 'menu-add', '72'],
    [path.join(root, 'recipes', 'index.wxss'), 'add-recipe-button', '72'],
  ]
  for (const [file, className, size] of circleControls) {
    const css = fs.readFileSync(file, 'utf8')
    const selector = new RegExp(`\\.${className}\\s*\\{[^}]*width:\\s*${size}rpx;[^}]*height:\\s*${size}rpx;[^}]*min-width:\\s*${size}rpx;[^}]*border-radius:\\s*50%`, 's')
    assert.match(css, selector, `${className} should have a fixed ${size}rpx square geometry`)
  }
})

test('icon buttons lock their flex basis and maximum width to remain circular', () => {
  const targets = [
    [path.join(__dirname, '..', 'app.wxss'), 'search-orb', '64'],
    [path.join(__dirname, '..', 'app.wxss'), 'sheet-close', '64'],
    [path.join(__dirname, '..', 'pages', 'recommend', 'index.wxss'), 'stepper__button', '64'],
    [path.join(__dirname, '..', 'pages', 'menu', 'index.wxss'), 'menu-add', '72'],
    [path.join(__dirname, '..', 'pages', 'recipes', 'index.wxss'), 'add-recipe-button', '72'],
  ]
  for (const [file, className, size] of targets) {
    const css = fs.readFileSync(file, 'utf8')
    const selector = new RegExp(`\\.${className}\\s*\\{[^}]*width:\\s*${size}rpx;[^}]*max-width:\\s*${size}rpx;[^}]*height:\\s*${size}rpx;[^}]*min-height:\\s*${size}rpx;[^}]*flex:\\s*0 0 ${size}rpx;[^}]*border-radius:\\s*50%`, 's')
    assert.match(css, selector, `${className} must not stretch in a flex row`)
  }
})

test('recipe catalog keeps category rail fixed beside an independently scrolling two-column grid', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'pages', 'recipes', 'index.wxss'), 'utf8')
  const template = fs.readFileSync(path.join(__dirname, '..', 'pages', 'recipes', 'index.wxml'), 'utf8')
  assert.match(template, /category-rail/)
  assert.match(template, /recipe-list/)
  assert.match(template, /recipe-card__photo/)
  assert.match(css, /\.catalog-body\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1;/s)
  assert.match(css, /\.category-rail\s*\{[^}]*height:\s*100%;/s)
  assert.match(css, /\.recipe-list\s*\{[^}]*height:\s*100%;/s)
  assert.match(css, /\.recipe-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s)
})

test('tab pages share the compact page header and recipe search stays subordinate to the list', () => {
  const pages = ['menu', 'recipes']
  for (const pageName of pages) {
    const template = fs.readFileSync(path.join(__dirname, '..', 'pages', pageName, 'index.wxml'), 'utf8')
    assert.match(template, /page-header/, `${pageName} should use the shared page header`)
  }
  const recipesTemplate = fs.readFileSync(path.join(__dirname, '..', 'pages', 'recipes', 'index.wxml'), 'utf8')
  const recipesCss = fs.readFileSync(path.join(__dirname, '..', 'pages', 'recipes', 'index.wxss'), 'utf8')
  assert.match(recipesTemplate, /confirm-type="search"[^>]*bindconfirm="submitSearch"/)
  assert.doesNotMatch(recipesTemplate, /recipe-search__submit/)
  assert.match(recipesCss, /\.recipe-card__menu\s*\{[^}]*width:\s*40rpx;[^}]*height:\s*40rpx;[^}]*font-size:\s*0;/s)
})

test('recommendation screen is a progressive two-click decision flow', () => {
  const root = path.join(__dirname, '..', 'pages', 'recommend')
  const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  const css = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8')
  assert.match(script, /screen:\s*'initial'/)
  assert.match(script, /screen:\s*'loading'/)
  assert.match(script, /screen:\s*'result'/)
  assert.match(script, /screen:\s*'confirmed'/)
  assert.match(script, /screen:\s*'error'/)
  assert.match(script, /applying/)
  assert.match(script, /applied/)
  assert.match(script, /if \(this\.data\.loading/)
  assert.match(script, /request\('\/recommendations', 'POST'/)
  assert.match(script, /request\('\/recipes'\)/)
  assert.match(script, /attachRecipeDetails/)
  assert.match(script, /difficultyLabel/)
  assert.match(script, /request\('\/menus\/items', 'POST'/)
  assert.match(script, /const regenerating = this\.data\.screen === 'result'/)
  assert.match(script, /this\.data\.loading \|\| this\.data\.applying \|\| this\.data\.regenerating/)
  assert.match(script, /this\.data\.applied/)
  assert.match(script, /chooseManually\(\)/)
  assert.match(script, /wx\.switchTab\(\{ url: '\/pages\/recipes\/index' \}\)/)
  assert.match(script, /async retry\(\)\s*\{\s*if \(await this\.ensureLogin\(\)\) this\.generate\(\)/s)
  assert.match(template, /帮我选/)
  assert.match(template, /就吃这些/)
  assert.match(template, /换一组/)
  assert.match(template, /bindtap="generate"/)
  assert.match(template, /bindtap="apply"/)
  assert.match(template, /今晚安排好了/)
  assert.match(template, /result-decision-dock/)
  assert.match(template, /decision-secondary-actions/)
  assert.match(template, /decision-back/)
  assert.match(template, /decision-manual/)
  assert.match(template, /bindtap="chooseManually"/)
  assert.match(template, /confirmed-return/)
  assert.doesNotMatch(template, /result-back|state-navigation/)
  assert.match(template, /item\.initial/)
  assert.match(template, /bindtap="backToInitial"/)
  assert.match(template, /bindtap="backToResult"/)
  assert.match(template, /result-dish__thumb/)
  assert.match(template, /result-dish__description/)
  assert.match(template, /confirmed-recipe-button/)
  assert.match(template, /bindtap="togglePreferences"/)
  assert.match(template, /preference-sheet/)
  assert.doesNotMatch(template, /recommend-search|search-surface|recommend-hero|seasonal-section|dish-fallback|均衡优先|健康优先|快手优先/)
  assert.match(css, /\.preference-sheet\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*0;/s)
  assert.match(css, /\.decision-cta--circle\s*\{[^}]*width:\s*208rpx\s*!important;[^}]*height:\s*208rpx\s*!important;[^}]*min-width:\s*208rpx\s*!important;[^}]*min-height:\s*208rpx\s*!important;[^}]*flex-shrink:\s*0;[^}]*border-radius:\s*50%/s)
  assert.match(css, /\.decision-secondary-action__icon\s*\{[^}]*width:\s*72rpx;[^}]*height:\s*72rpx;[^}]*border-radius:\s*50%/s)
  assert.match(css, /\.result-dish__thumb\s*\{[^}]*width:\s*140rpx;[^}]*height:\s*140rpx;[^}]*flex-shrink:\s*0;/s)
  assert.match(css, /\.confirmed-dish__thumb\s*\{[^}]*width:\s*100rpx;[^}]*height:\s*100rpx;/s)
  assert.match(css, /\.result-refresh\s*\{[^}]*flex:\s*38;/s)
  assert.match(css, /\.result-confirm\s*\{[^}]*flex:\s*62;/s)
  assert.match(css, /\.result-actions\s*\{[^}]*display:\s*flex;/s)
  assert.match(css, /\.result-decision-dock\s*\{[^}]*border-top:\s*1rpx solid #f0f0f0;/s)
  assert.doesNotMatch(css, /\.result-decision-dock\s*\{[^}]*position:\s*fixed/s)
  assert.match(css, /\.result-dish__thumb--empty\s*\{[^}]*background:\s*#f1f1ef/s)
  assert.match(css, /@keyframes recommend-enter/)
  assert.match(css, /transform:\s*translateY\(16rpx\)/)
})

test('menu screen uses a data-driven date strip and three-card meal deck without changing menu actions', () => {
  const root = path.join(__dirname, '..', 'pages', 'menu')
  const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  const css = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8')
  assert.match(script, /normalizeMeals/)
  assert.match(script, /request\('\/recipes'\)/)
  assert.match(script, /buildTimelineItems/)
  assert.match(script, /buildMealCards/)
  assert.match(script, /isHorizontalSwipe/)
  assert.match(script, /getDateRailState/)
  assert.doesNotMatch(script, /showTodayAnchor|setTodayAnchorVisibility/)
  assert.match(script, /measureDateViewport/)
  assert.doesNotMatch(script, /getMetricsForAnchor|dateRailProgrammatic|scheduleDateRailCalibration|reconcileDateRail|dateRailCenterPending/)
  assert.doesNotMatch(script, /stickyTodaySide|todayAnchorTimer|anchorSide/)
  assert.match(script, /handleDateScroll/)
  assert.doesNotMatch(script, /DATE_CENTER_VISUAL_OFFSET_RPX|centerSelectedDate/)
  const selectDateHandler = script.match(/selectDate\(event\) \{[\s\S]*?\n  \},\n\n  handleDateScroll/)?.[0] || ''
  assert.doesNotMatch(selectDateHandler, /dateScrollLeft|getDateScrollLeft|scrollMode/)
  const loadHandler = script.match(/async load\(\) \{[\s\S]*?\n  \},\n\n  measureDeck/)?.[0] || ''
  assert.doesNotMatch(loadHandler, /dateScrollLeft|buildTimelineItems|getDateScrollLeft/)
  assert.match(script, /setSelectedDate\(this\.data\.today, \{ scrollMode: 'center' \}\)/)
  assert.doesNotMatch(script, /select\(`#\$\{dateScrollId\(this\.data\.date\)\}`\)/)
  assert.match(script, /returnToday/)
  assert.match(script, /toggleCalendar/)
  assert.match(script, /handleImageError/)
  assert.match(script, /wx\.showModal/)
  assert.match(template, /bindtap="goRecipes"/)
  assert.match(template, /catchtap="remove"/)
  assert.match(template, /menu-date-scroll/)
  assert.match(template, /scroll-left="\{\{dateScrollLeft\}\}"/)
  assert.match(template, /scroll-with-animation="true"/)
  assert.doesNotMatch(template, /dateScrollWithAnimation/)
  assert.match(template, /bindscroll="handleDateScroll"/)
  assert.match(template, /date-context-row/)
  assert.match(template, /date-context-sidebar/)
  assert.match(template, /date-context-sidebar__month/)
  assert.match(template, /date-context-sidebar__today/)
  assert.match(template, /date-scroll/)
  assert.match(template, /menu-date-scroll-shell/)
  assert.match(template, /id="menu-date-\{\{item\.value\}\}"/)
  assert.doesNotMatch(template, /showTodayAnchor|today-return-slot|today-return-anchor|menu-today-anchor/)
  assert.doesNotMatch(template, /menu-calendar-toggle[^<]*.*menu-date-scroll/s)
  assert.match(template, /menu-calendar-region/)
  assert.match(template, /menu-calendar-panel/)
  assert.match(template, /bindtap="returnToday"/)
  assert.match(template, /meal-deck/)
  assert.match(template, /menu-date--today-selected/)
  assert.match(template, /menu-date--selected/)
  assert.match(template, /menu-date--today/)
  assert.match(template, /item\.value === date/)
  assert.match(template, /meal-note__count/)
  assert.match(template, /scroll-y="\{\{card\.items\.length > 3\}\}"/)
  assert.match(template, /bindtouchstart="handleCardTouchStart"/)
  assert.match(template, /bindtouchend="handleCardTouchEnd"/)
  assert.match(template, /meal-indicator/)
  assert.match(template, /menu-dish__photo/)
  assert.match(template, /src="\{\{item\.coverUrl\}\}" mode="aspectFill"[^>]*binderror="handleImageError"/)
  assert.match(template, /wx:else class="meal-note__empty"/)
  assert.ok(template.includes("meal-note__empty-add {{card.role === 'active' && !deckAnimating ? 'meal-note__empty-add--visible' : ''}}"))
  assert.doesNotMatch(template, />\s*(?:这一餐还空着|添加一道菜)\s*</)
  assert.match(css, /\.menu-date__circle\s*\{[^}]*width:\s*64rpx;[^}]*height:\s*64rpx;[^}]*min-width:\s*64rpx;[^}]*min-height:\s*64rpx;[^}]*border-radius:\s*50%/s)
  assert.match(css, /\.menu-date-list\s*\{[^}]*display:\s*inline-flex;[^}]*padding:\s*0 4rpx;/s)
  assert.match(css, /\.menu-date \+ \.menu-date\s*\{[^}]*margin-left:\s*8rpx;/s)
  assert.match(css, /\.menu-date--today-selected \.menu-date__circle\s*\{[^}]*background:\s*var\(--color-primary\)/s)
  assert.match(css, /\.menu-date--selected \.menu-date__circle\s*\{[^}]*background:\s*#fde7ec/i)
  assert.match(template, /menu-date__marker-slot/)
  assert.match(template, /menu-calendar-day__marker-slot/)
  assert.match(css, /\.menu-date__marker\s*\{[^}]*width:\s*8rpx;[^}]*height:\s*8rpx;[^}]*border-radius:\s*50%/s)
  assert.match(css, /\.menu-date__marker--today[^}]*background:\s*var\(--color-primary\)/s)
  assert.match(css, /\.menu-calendar-day__marker\s*\{[^}]*width:\s*6rpx;[^}]*height:\s*6rpx;[^}]*border-radius:\s*50%/s)
  assert.match(css, /\.date-context-sidebar\s*\{[^}]*width:\s*104rpx;[^}]*flex:\s*0 0 104rpx;/s)
  assert.match(css, /\.date-context-sidebar__month\s*\{[^}]*font-size:\s*34rpx;[^}]*font-weight:\s*600;/s)
  assert.match(css, /\.date-context-sidebar__today\s*\{[^}]*color:\s*#FF385C;/s)
  assert.match(css, /\.menu-calendar-toggle-row\s*\{[^}]*justify-content:\s*center;/s)
  assert.doesNotMatch(css, /today-return-slot--left|today-return-slot--right|calendar-toggle-zone/)
  assert.doesNotMatch(css, /\.menu-calendar-toggle\s*\{[^}]*border:\s*(?:1|[1-9])/s)
  assert.match(css, /\.menu-calendar-region\s*\{[^}]*height:\s*0;[^}]*overflow:\s*hidden;/s)
  assert.doesNotMatch(css, /\.menu-calendar-panel\s*\{[^}]*position:\s*absolute/s)
  assert.match(css, /\.meal-note__dishes\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;/s)
  assert.match(css, /\.menu-dish\s*\{[^}]*width:\s*100%;[^}]*box-sizing:\s*border-box;/s)
  assert.match(css, /\.menu-dish__copy\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*1;/s)
  assert.match(css, /\.menu-dish__remove\s*\{[^}]*flex:\s*0 0 48rpx;/s)
  assert.match(css, /\.menu-calendar-toggle__glyph\s*\{[^}]*width:\s*24rpx;[^}]*height:\s*14rpx;/s)
  assert.match(template, /<image class="menu-calendar-toggle__glyph" src="\/assets\/icons\/menu\/chevron\.png"[^>]*mode="aspectFit"/)
  const viewModel = fs.readFileSync(path.join(root, 'view-model.js'), 'utf8')
  assert.doesNotMatch(viewModel, /items:\s*\(meal\.items \|\| \[\]\)\.slice\(0, 3\)/)
  assert.match(css, /\.meal-note\s*\{[^}]*height:\s*var\(--meal-card-height\)/s)
  assert.match(css, /\.meal-note--breakfast\s*\{[^}]*#fff6d8/i)
  assert.match(css, /\.meal-note--lunch\s*\{[^}]*#ffe8e9/i)
  assert.match(css, /\.meal-note--dinner\s*\{[^}]*#e5f1ff/i)
  assert.match(css, /cubic-bezier\(\.22,\s*1,\s*\.36,\s*1\)/)
  assert.match(css, /\.meal-note__empty-add\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*scale\(\.92\);[^}]*pointer-events:\s*none;/s)
  assert.match(css, /\.meal-note__empty-add--visible\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*scale\(1\);[^}]*pointer-events:\s*auto;/s)
  assert.match(css, /\.meal-note--prev \.menu-dish__photo,[\s\S]*\.meal-note--next \.menu-dish__remove\s*\{[^}]*pointer-events:\s*none;/s)
  assert.match(script, /if \(this\.data\.deckAnimating \|\| index === this\.data\.activeMealIndex\) return/)
})

test('recipe catalog implements the image list and add-to-menu flow', () => {
  const root = path.join(__dirname, '..', 'pages', 'recipes')
  const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  assert.match(template, /category-rail/)
  assert.match(template, /recipe-list/)
  assert.match(template, /catchtap="openAdd"/)
  assert.match(template, /bottom-sheet/)
  assert.match(script, /buildMenuItemPayload/)
  assert.match(script, /wx\.navigateTo\(\{ url: `\/pages\/recipe-detail\/index\?id=/)
  assert.match(script, /request\('\/menus\/items', 'POST'/)
})

test('recipe catalog applies the scoped cloud theme and persists local favorites', () => {
  const miniprogramRoot = path.join(__dirname, '..')
  const theme = fs.readFileSync(path.join(miniprogramRoot, 'styles', 'recipe-theme.wxss'), 'utf8')
  const root = path.join(miniprogramRoot, 'pages', 'recipes')
  const css = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  assert.match(css, /@import\s+["']\.\.\/\.\.\/styles\/recipe-theme\.wxss["'];/)
  assert.match(theme, /\.recipe-cloud-page\s*\{/)
  assert.match(theme, /background-color:\s*#fff/i)
  assert.doesNotMatch(theme, /radial-gradient|linear-gradient/)
  assert.match(theme, /--recipe-surface:/)
  assert.match(template, /class="page recipes-page recipe-cloud-page"/)
  assert.match(template, /wx:key="id"/)
  assert.doesNotMatch(template, /recipe-card__favorite|catchtap="toggleFavorite"/)
  assert.match(template, /recipe-card__menu-icon/)
  assert.doesNotMatch(template, /recipe-card__menu[^>]*>\s*[＋+]?\s*加入菜单/)
  assert.match(template, /binderror="handleImageError"/)
  assert.match(script, /RECIPE_FAVORITES_STORAGE_KEY/)
  assert.match(script, /wx\.getStorageSync\(RECIPE_FAVORITES_STORAGE_KEY\)/)
  assert.match(script, /wx\.setStorageSync\(RECIPE_FAVORITES_STORAGE_KEY/)
  assert.match(script, /normalizeFavoriteRecipeIds/)
  assert.match(script, /toggleFavoriteRecipeId/)
})

test('recipe images use aspectFill and degrade to the neutral fallback on load errors', () => {
  const pagesRoot = path.join(__dirname, '..', 'pages')
  const listTemplate = fs.readFileSync(path.join(pagesRoot, 'recipes', 'index.wxml'), 'utf8')
  const listScript = fs.readFileSync(path.join(pagesRoot, 'recipes', 'index.js'), 'utf8')
  const recommendTemplate = fs.readFileSync(path.join(pagesRoot, 'recommend', 'index.wxml'), 'utf8')
  const recommendScript = fs.readFileSync(path.join(pagesRoot, 'recommend', 'index.js'), 'utf8')
  const menuTemplate = fs.readFileSync(path.join(pagesRoot, 'menu', 'index.wxml'), 'utf8')
  const menuScript = fs.readFileSync(path.join(pagesRoot, 'menu', 'index.js'), 'utf8')
  const detailTemplate = fs.readFileSync(path.join(pagesRoot, 'recipe-detail', 'index.wxml'), 'utf8')
  const detailScript = fs.readFileSync(path.join(pagesRoot, 'recipe-detail', 'index.js'), 'utf8')
  const detailCss = fs.readFileSync(path.join(pagesRoot, 'recipe-detail', 'index.wxss'), 'utf8')
  assert.match(listTemplate, /src="\{\{item\.coverUrl\}\}" mode="aspectFill"[^>]*binderror="handleImageError"/)
  assert.match(listTemplate, /wx:else class="recipe-card__photo recipe-card__photo--placeholder"/)
  assert.match(listScript, /handleImageError\(event\)/)
  assert.match(recommendTemplate, /result-dish__thumb[^>]*src="\{\{item\.coverUrl\}\}" mode="aspectFill"[^>]*binderror="handleImageError"/)
  assert.match(recommendTemplate, /confirmed-dish__thumb[^>]*src="\{\{item\.coverUrl\}\}" mode="aspectFill"[^>]*binderror="handleImageError"/)
  assert.match(recommendScript, /handleImageError\(event\)/)
  assert.match(menuTemplate, /src="\{\{item\.coverUrl\}\}" mode="aspectFill"[^>]*binderror="handleImageError"/)
  assert.match(menuTemplate, /menu-dish__photo menu-dish__photo--fallback/)
  assert.match(menuScript, /handleImageError\(event\)/)
  assert.match(detailTemplate, /src="\{\{recipe\.coverUrl\}\}" mode="aspectFill" binderror="handleImageError"/)
  assert.match(detailTemplate, /detail-photo detail-photo--placeholder/)
  assert.match(detailScript, /handleImageError\(\)/)
  assert.match(detailCss, /\.detail-photo--placeholder\s*\{[^}]*background:\s*#f7f7f7/s)
})

test('recipe detail and form pages use real recipe APIs including ingredients', () => {
  const pages = path.join(__dirname, '..', 'pages')
  const detail = fs.readFileSync(path.join(pages, 'recipe-detail', 'index.js'), 'utf8')
  const form = fs.readFileSync(path.join(pages, 'recipe-form', 'index.js'), 'utf8')
  const formTemplate = fs.readFileSync(path.join(pages, 'recipe-form', 'index.wxml'), 'utf8')
  assert.match(detail, /request\(`\/recipes\/\$\{this\.data\.id\}`\)/)
  assert.match(detail, /\/pages\/recipe-form\/index\?id=/)
  assert.match(form, /request\('\/ingredients'\)/)
  assert.match(form, /serializeIngredients/)
  assert.match(form, /request\(`\/recipes\/\$\{this\.data\.id\}`, 'PUT'/)
  assert.match(form, /request\('\/recipes', 'POST'/)
  assert.match(formTemplate, /ingredient-row/)
  const detailTemplate = fs.readFileSync(path.join(pages, 'recipe-detail', 'index.wxml'), 'utf8')
  assert.match(detailTemplate, /detail-photo/)
  assert.match(detailTemplate, /detail-meta/)
})

test('recipe detail uses custom safe-area navigation and a three-layer ceramic plate hero', () => {
  const root = path.join(__dirname, '..', 'pages', 'recipe-detail')
  const config = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'))
  const template = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  const css = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8')
  const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  assert.equal(config.navigationStyle, 'custom')
  assert.match(template, /class="detail-page recipe-cloud-page"/)
  assert.match(template, /class="detail-nav" style="\{\{navStyle\}\}"/)
  assert.match(template, /plate-shell/)
  assert.match(template, /plate-rim/)
  assert.match(template, /<scroll-view[^>]*class="detail-main"[^>]*scroll-y/)
  assert.match(template, /detail-photo/)
  assert.match(template, /detail-meta__item/)
  assert.match(template, /ingredient-card/)
  assert.match(template, /steps-card/)
  assert.match(css, /\.plate-shell\s*\{[^}]*border-radius:\s*50%;[^}]*box-shadow:/s)
  assert.match(css, /\.plate-rim\s*\{[^}]*border-radius:\s*50%;/s)
  assert.doesNotMatch(template, /detail-meta__accent/)
  assert.match(css, /\.detail-footer__button\s*\{[^}]*width|\.detail-footer__button\s*\{[^}]*max-width/s)
  assert.match(css, /\.detail-footer\s*\{[^}]*env\(safe-area-inset-bottom\)/s)
  assert.match(template, /detail-nav__left-slot/)
  assert.match(template, /detail-nav__actions/)
  assert.match(css, /\.detail-nav__slot\s*\{[^}]*width:\s*186rpx;[^}]*flex:\s*0 0 186rpx;/s)
  assert.match(css, /\.detail-nav__button\s*\{[^}]*width:\s*88rpx;[^}]*height:\s*88rpx;[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent/s)
  assert.doesNotMatch(css, /\.detail-nav\s*\{[^}]*top:\s*0/s)
  assert.match(css, /\.detail-content\s*\{[^}]*padding:\s*0 36rpx/s)
  assert.match(script, /wx\.getWindowInfo/)
  assert.match(script, /wx\.getMenuButtonBoundingClientRect/)
})

test('recipe detail positions the complete custom nav below the native capsule', () => {
  const root = path.join(__dirname, '..', 'pages', 'recipe-detail')
  const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  const functionSource = script.slice(
    script.indexOf('function getNavigationLayout()'),
    script.indexOf('\n\nPage({')
  )
  const getNavigationLayout = require('node:vm').runInNewContext(`(${functionSource})`, {
    wx: {
      getWindowInfo: () => ({ windowWidth: 390, statusBarHeight: 47 }),
      getMenuButtonBoundingClientRect: () => ({ top: 27, bottom: 75, height: 48, left: 250 })
    }
  })
  const layout = getNavigationLayout()

  assert.match(layout.navStyle, /top:87\.48px/)
  assert.match(layout.navStyle, /height:41\.6px/)
  assert.match(layout.contentStyle, /padding-top:145\.72/)
  assert.match(script, /menuButtonTop/)
  assert.match(script, /menuButtonBottom/)
  assert.match(script, /menuButtonHeight/)

  const deviceCases = [
    ['iPhone 15 Pro', 393, 54, { top: 28, bottom: 76, height: 48 }],
    ['iPhone 12/13', 390, 47, { top: 27, bottom: 75, height: 48 }],
    ['iPhone SE', 375, 20, { top: 20, bottom: 54, height: 34 }],
    ['Android narrow', 360, 24, { top: 8, bottom: 42, height: 34 }]
  ]
  for (const [device, windowWidth, statusBarHeight, menuButton] of deviceCases) {
    const getDeviceLayout = require('node:vm').runInNewContext(`(${functionSource})`, {
      wx: {
        getWindowInfo: () => ({ windowWidth, statusBarHeight }),
        getMenuButtonBoundingClientRect: () => menuButton
      }
    })
    const deviceLayout = getDeviceLayout()
    const readPx = (style, property) => Number(style.match(new RegExp(`${property}:([0-9.]+)px`))[1])
    const expectedTop = menuButton.bottom + (24 * windowWidth / 750)
    const expectedNavHeight = 80 * windowWidth / 750
    const expectedHeroGap = 32 * windowWidth / 750
    assert.ok(Math.abs(readPx(deviceLayout.navStyle, 'top') - expectedTop) < 0.001, device)
    assert.ok(Math.abs(readPx(deviceLayout.navStyle, 'height') - expectedNavHeight) < 0.001, device)
    assert.ok(Math.abs(readPx(deviceLayout.contentStyle, 'padding-top') - expectedTop - expectedNavHeight - expectedHeroGap) < 0.001, device)
  }
})

test('recipe detail scheme A actions keep edit in the footer and share as pending', () => {
  const root = path.join(__dirname, '..', 'pages', 'recipe-detail')
  const miniprogramRoot = path.join(__dirname, '..')
  const template = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8')

  assert.match(template, /detail-footer__edit[^>]*bindtap="edit"/)
  assert.match(template, /assets\/icons\/recipes\/edit\.png/)
  assert.doesNotMatch(script, /itemList:\s*\['编辑菜谱'/)
  assert.match(script, /itemList:\s*\['分享菜品（待开发）',\s*'删除菜品'\]/)
  assert.match(script, /shareRecipe\(\)/)
  assert.match(script, /分享功能待开发/)
  assert.ok(fs.existsSync(path.join(miniprogramRoot, 'assets', 'icons', 'recipes', 'edit.png')))
  assert.ok(fs.existsSync(path.join(miniprogramRoot, 'assets', 'icons', 'recipes', 'share.png')))
})

test('recipe detail uses the confirmed white reading layout and rounded content cards', () => {
  const root = path.join(__dirname, '..', 'pages', 'recipe-detail')
  const template = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  const css = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8')

  assert.doesNotMatch(template, /recipe-glass-card/)
  assert.match(css, /\.detail-meta\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s)
  assert.match(css, /\.detail-meta__item \+ \.detail-meta__item::before\s*\{[^}]*height:\s*60rpx;[^}]*background:\s*#eeeeee/s)
  assert.match(css, /\.detail-description\s*\{[^}]*border-radius:\s*28rpx;[^}]*background:\s*#f7f7f7/s)
  assert.match(css, /\.detail-card\s*\{[^}]*box-sizing:\s*border-box;[^}]*border-radius:\s*30rpx;[^}]*background:\s*#fafafa/s)
  assert.match(css, /\.step-number\s*\{[^}]*width:\s*72rpx;[^}]*height:\s*72rpx;[^}]*border-radius:\s*50%;[^}]*background:\s*#fff0f4/s)
  assert.match(css, /\.detail-footer\s*\{[^}]*env\(safe-area-inset-bottom\)/s)
  assert.match(css, /\.detail-footer__edit\s*\{[^}]*flex:\s*42;/s)
  assert.match(css, /\.detail-footer__add\s*\{[^}]*flex:\s*58;/s)
  assert.match(template, /class="detail-footer__button detail-footer__edit"/)
  assert.match(template, /class="detail-footer__button detail-footer__add"/)
})

test('recipe detail persists local favorite state and exposes real edit/delete actions', () => {
  const root = path.join(__dirname, '..', 'pages', 'recipe-detail')
  const template = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  assert.match(template, /bindtap="toggleFavorite"/)
  assert.match(template, /bindtap="openMore"/)
  assert.match(script, /RECIPE_FAVORITES_STORAGE_KEY/)
  assert.match(script, /wx\.getStorageSync\(RECIPE_FAVORITES_STORAGE_KEY\)/)
  assert.match(script, /wx\.setStorageSync\(RECIPE_FAVORITES_STORAGE_KEY/)
  assert.match(script, /wx\.showActionSheet/)
  assert.match(script, /request\(`\/recipes\/\$\{this\.data\.id\}`, 'DELETE'\)/)
  assert.match(script, /\/pages\/recipe-form\/index\?id=/)
})

test('recipe editor is a scoped modular form with one real cover preview and one save action', () => {
  const root = path.join(__dirname, '..', 'pages', 'recipe-form')
  const config = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'))
  const template = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  const css = fs.readFileSync(path.join(root, 'index.wxss'), 'utf8')
  const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  assert.equal(config.navigationStyle, 'custom')
  assert.match(css, /@import\s+["']\.\.\/\.\.\/styles\/recipe-theme\.wxss["'];/)
  assert.match(template, /class="form-page recipe-cloud-page"/)
  assert.match(template, /form-cover/)
  assert.match(template, /src="\{\{coverUrl\}\}"[^>]*binderror="handleCoverError"/)
  assert.match(template, /目前支持单张封面/)
  assert.doesNotMatch(template, /chooseMedia|chooseImage|上传图片|添加图片|多图/)
  assert.equal((template.match(/bindtap="save"/g) || []).length, 1)
  assert.match(css, /\.form-nav__save\s*\{[^}]*width:\s*112rpx;[^}]*flex:\s*0 0 112rpx;[^}]*max-width:\s*112rpx;/s)
  assert.match(template, /<scroll-view[^>]*class="form-main"[^>]*scroll-y/)
  assert.match(template, /basic-info-card/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
  assert.match(script, /wx\.getWindowInfo/)
})

test('recipe editor uses an ingredient bottom sheet and structured reorderable step blocks', () => {
  const root = path.join(__dirname, '..', 'pages', 'recipe-form')
  const template = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  assert.match(template, /ingredient-sheet/)
  assert.match(template, /bindtap="openIngredientSheet"/)
  assert.match(template, /bindtap="editIngredient"/)
  assert.match(template, /bindtap="confirmIngredient"/)
  assert.match(template, /wx:for="\{\{stepItems\}\}" wx:key="key"/)
  assert.match(template, /bindtap="addStep"/)
  assert.match(template, /catchtap="removeStep"/)
  assert.match(template, /catchtap="moveStep"/)
  assert.match(script, /parseRecipeSteps/)
  assert.match(script, /serializeRecipeSteps/)
  assert.match(script, /openIngredientSheet\(\)/)
  assert.match(script, /editIngredient\(event\)/)
  assert.match(script, /confirmIngredient\(\)/)
  assert.match(script, /some\(\(item, index\)/)
  assert.match(script, /updateStep\(event\)/)
  assert.match(script, /addStep\(\)/)
  assert.match(script, /removeStep\(event\)/)
  assert.match(script, /moveStep\(event\)/)
})

test('settings keeps real family actions in consumer-style profile sections', () => {
  const root = path.join(__dirname, '..', 'pages', 'settings')
  const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'index.wxml'), 'utf8')
  assert.match(script, /request\('\/auth\/me'\)/)
  assert.match(script, /request\('\/families\/current'\)/)
  assert.match(script, /request\('\/insights'\)/)
  assert.match(template, /settings-profile/)
  assert.match(template, /settings-member/)
  assert.match(template, /settings-group/)
  assert.match(template, /bindtap="createFamily"/)
  assert.match(template, /bindtap="joinFamily"/)
  assert.match(template, /bindtap="copyCode"/)
  assert.match(template, /即将开放/)
})

test('settings and about pages use scoped tokens, real actions and custom about navigation', () => {
  const settingsRoot = path.join(__dirname, '..', 'pages', 'settings')
  const aboutRoot = path.join(__dirname, '..', 'pages', 'about')
  const settingsCss = fs.readFileSync(path.join(settingsRoot, 'index.wxss'), 'utf8')
  const settingsTemplate = fs.readFileSync(path.join(settingsRoot, 'index.wxml'), 'utf8')
  const settingsScript = fs.readFileSync(path.join(settingsRoot, 'index.js'), 'utf8')
  const settingsConfig = JSON.parse(fs.readFileSync(path.join(settingsRoot, 'index.json'), 'utf8'))
  const aboutConfig = JSON.parse(fs.readFileSync(path.join(aboutRoot, 'index.json'), 'utf8'))
  const aboutTemplate = fs.readFileSync(path.join(aboutRoot, 'index.wxml'), 'utf8')
  const aboutCss = fs.readFileSync(path.join(aboutRoot, 'index.wxss'), 'utf8')
  const aboutScript = fs.readFileSync(path.join(aboutRoot, 'index.js'), 'utf8')
  const appConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'))
  assert.match(settingsCss, /--settings-bg: #ffffff/)
  assert.match(settingsCss, /--settings-dashboard: #fff5f7/)
  assert.match(settingsCss, /env\(safe-area-inset-bottom\)/)
  assert.match(settingsTemplate, /settings-profile/)
  assert.match(settingsTemplate, /settings-dashboard/)
  assert.match(settingsTemplate, /settings-quick-card/)
  assert.match(settingsTemplate, /bindtap="showFamilyInfo"/)
  assert.match(settingsTemplate, /家庭邀请码/)
  assert.match(settingsTemplate, /settings-group/)
  assert.match(settingsTemplate, /src="\/assets\/icons\/settings\/family\.png"/)
  assert.match(settingsTemplate, /bindtap="goAbout"/)
  assert.match(settingsScript, /TEMP_CACHE_KEYS/)
  assert.match(settingsScript, /removeStorageSync/)
  assert.match(settingsScript, /familyMemberCount/)
  assert.match(settingsScript, /showFamilyInfo\(\)/)
  assert.match(settingsScript, /cacheLabel: ''/)
  assert.match(settingsScript, /getMenuButtonBoundingClientRect/)
  assert.equal(settingsConfig.navigationStyle, 'custom')
  assert.match(settingsTemplate, /style="\{\{navStyle\}\}"/)
  assert.equal(aboutConfig.navigationStyle, 'custom')
  assert.match(aboutTemplate, /bindtap="goBack"/)
  assert.match(aboutTemplate, /about-group/)
  assert.match(aboutCss, /--about-accent: #ff4f79/)
  assert.match(aboutCss, /env\(safe-area-inset-bottom\)/)
  assert.match(aboutScript, /getAccountInfoSync/)
  assert.match(aboutScript, /getWindowInfo/)
  assert.ok(appConfig.pages.includes('pages/about/index'))
})

test('every visible WXML event is backed by a page handler', () => {
  const pagesRoot = path.join(__dirname, '..', 'pages')
  for (const pageName of fs.readdirSync(pagesRoot)) {
    const pageRoot = path.join(pagesRoot, pageName)
    const templatePath = path.join(pageRoot, 'index.wxml')
    const scriptPath = path.join(pageRoot, 'index.js')
    if (!fs.existsSync(templatePath) || !fs.existsSync(scriptPath)) continue
    const template = fs.readFileSync(templatePath, 'utf8')
    const script = fs.readFileSync(scriptPath, 'utf8')
    const handlers = [...template.matchAll(/(?:bind|catch)(?:tap|input|change|confirm|touchmove)="([A-Za-z0-9_]+)"/g)].map((match) => match[1])
    for (const handler of handlers) {
      assert.match(script, new RegExp(`\\b${handler}\\s*\\(`), `${pageName}.${handler} is missing`)
    }
    assert.doesNotMatch(template, /\{\{[^}]*\.(?:slice|map|filter|indexOf|reduce|padStart)\(/)
  }
})
