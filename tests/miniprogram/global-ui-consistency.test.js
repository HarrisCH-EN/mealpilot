const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..', 'miniprogram')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function rulesWith(css, selectorPart) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match => match[1].includes(selectorPart))
    .map(match => ({ selector: match[1].trim(), body: match[2] }))
}

function assertAllFontSizesUse(relativePath, selectorPart, token) {
  const rules = rulesWith(read(relativePath), selectorPart)
  const sizes = rules
    .map(rule => rule.body.match(/font-size\s*:\s*([^;]+)/)?.[1]?.trim())
    .filter(Boolean)
  assert.ok(sizes.length, `${relativePath} should define ${selectorPart}`)
  assert.deepEqual(sizes, Array(sizes.length).fill(`var(${token})`), `${selectorPart} should use ${token} at every breakpoint`)
}

test('shared UI tokens define the approved brand, typography and 28rpx rectangle radius', () => {
  const css = read('app.wxss')
  assert.ok(/--color-primary:\s*#FF385C\s*;/.test(css), 'primary color should be the approved #FF385C')
  assert.ok(/--radius-rect:\s*28rpx\s*;/.test(css), 'rectangular radius should be 28rpx')
  assert.ok(/--radius-card:\s*var\(--radius-rect\)\s*;/.test(css))
  assert.ok(/--radius-input:\s*var\(--radius-rect\)\s*;/.test(css))
  assert.ok(/--font-page-title:\s*48rpx\s*;/.test(css))
  assert.ok(/--font-content-title:\s*48rpx\s*;/.test(css))
  assert.ok(/--font-nav-title:\s*32rpx\s*;/.test(css))
  assert.ok(/--font-section-title:\s*32rpx\s*;/.test(css))
  assert.ok(/\.page-title\s*\{[^}]*font-size:\s*var\(--font-page-title\)/s.test(css))
  assert.ok(/\.section-title\s*\{[^}]*font-size:\s*var\(--font-section-title\)/s.test(css))
})

test('page title and section heading overrides use the shared typography scale', () => {
  for (const [file, selector] of [
    ['pages/recommend/index.wxss', 'recommend-title'],
    ['pages/menu/index.wxss', 'menu-header__title'],
    ['pages/recipes/index.wxss', 'recipes-title'],
    ['pages/settings/index.wxss', 'settings-header__title'],
    ['pages/family-management/index.wxss', 'family-hero__name'],
    ['pages/recipe-detail/index.wxss', 'detail-title']
  ]) {
    assertAllFontSizesUse(file, selector, selector === 'family-hero__name' || selector === 'detail-title'
      ? '--font-content-title'
      : '--font-page-title')
  }

  for (const [file, selector] of [
    ['pages/about/index.wxss', 'about-nav__title'],
    ['pages/account-management/index.wxss', 'account-header__title'],
    ['pages/family-management/index.wxss', 'family-nav__title'],
    ['pages/recipe-detail/index.wxss', 'detail-nav__title'],
    ['pages/recipe-form/index.wxss', 'form-nav__title'],
    ['pages/restrictions/index.wxss', 'restrictions-nav__title'],
    ['pages/tag-management/index.wxss', 'tag-management-nav__title']
  ]) {
    assertAllFontSizesUse(file, selector, '--font-nav-title')
  }

  for (const [file, selector] of [
    ['pages/account-management/index.wxss', 'account-section__title'],
    ['pages/family-management/index.wxss', 'family-section__title'],
    ['pages/recipe-detail/index.wxss', 'detail-card__title'],
    ['pages/recipe-form/index.wxss', 'section-title'],
    ['pages/recipes/index.wxss', 'recipe-list__title'],
    ['pages/recommend/index.wxss', 'recommend-section-heading'],
    ['pages/restrictions/index.wxss', 'restrictions-section-title'],
    ['pages/settings/index.wxss', 'settings-section__title'],
    ['pages/tag-management/index.wxss', 'tag-management-section-title']
  ]) {
    assertAllFontSizesUse(file, selector, '--font-section-title')
  }
})

test('rectangular surfaces use the shared radius while pills and circles retain their shape', () => {
  const styles = [
    ['app.wxss', read('app.wxss')],
    ...fs.readdirSync(path.join(root, 'pages'), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name !== 'menu')
      .map(entry => [`pages/${entry.name}/index.wxss`, path.join(root, 'pages', entry.name, 'index.wxss')])
      .filter(([, file]) => fs.existsSync(file))
      .map(([relativePath, file]) => [relativePath, fs.readFileSync(file, 'utf8')])
  ]
  const exemptions = /(?:__mark\b|__pointer\b|__handle\b|indicator__dot\b)/
  const inconsistent = []

  for (const [file, css] of styles) {
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].trim()
      const value = match[2].match(/border-radius\s*:\s*([^;]+)/)?.[1]?.trim()
      if (!value || exemptions.test(selector)) continue
      if (/^(?:0|50%|(?:999|9999)rpx|inherit|var\()/i.test(value)) continue
      inconsistent.push(`${file}: ${selector} uses ${value}`)
    }
  }

  assert.deepEqual(inconsistent, [], `rectangular surfaces must use the 28rpx token:\n${inconsistent.join('\n')}`)
})

test('brand accents are canonical and the tab bar uses the same primary color', () => {
  const files = []
  for (const entry of fs.readdirSync(path.join(root, 'pages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    for (const extension of ['wxss', 'js']) {
      const file = path.join(root, 'pages', entry.name, `index.${extension}`)
      if (fs.existsSync(file)) files.push(fs.readFileSync(file, 'utf8'))
    }
  }
  assert.ok(!/#ff4f7b|#f14d70/i.test(files.join('\n')), 'page-level styles must not define competing pink brand colors')
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  assert.equal(appConfig.tabBar.selectedColor, '#FF385C')
  assert.match(read('styles/recipe-theme.wxss'), /--recipe-primary:\s*var\(--color-primary\)\s*;/)
})

test('redundant helper copy is removed from the settings, family and recipe-tag headers', () => {
  assert.ok(!/用美食，连接家人的每一餐/.test(read('pages/settings/index.wxml')))
  assert.ok(!/用于邀请家人加入这个家庭|查看成员与家庭权限/.test(read('pages/family-management/index.wxml')))
  assert.ok(!/选择这道菜最有代表性的特点，最多选择 3 个/.test(read('pages/recipe-form/index.wxml')))
})

test('daily-menu meal rotation and dropdown calendar keep their defining visuals and interaction hooks', () => {
  const css = read('pages/menu/index.wxss')
  const template = read('pages/menu/index.wxml')
  assert.ok(/\.meal-note\s*\{[^}]*border-radius:\s*34rpx/s.test(css))
  assert.ok(/\.meal-note--prev\s*\{[^}]*rotate\(-2deg\)/s.test(css))
  assert.ok(/\.meal-note--next\s*\{[^}]*rotate\(2deg\)/s.test(css))
  assert.ok(/\.menu-calendar-region\s*\{[^}]*transition:\s*height 420ms[^}]*opacity 420ms[^}]*transform 420ms/s.test(css))
  assert.ok(/\.menu-calendar-toggle--open \.menu-calendar-toggle__glyph\s*\{[^}]*rotate\(180deg\)/s.test(css))
  assert.ok(template.includes('class="meal-note meal-note--{{card.theme}} meal-note--{{card.role}}"'))
  assert.ok(template.includes('class="menu-calendar-region {{calendarOpen ? \'menu-calendar-region--open\' : \'\'}}"'))
})
