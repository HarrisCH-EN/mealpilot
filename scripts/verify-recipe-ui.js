const automator = require('miniprogram-automator')
const path = require('node:path')

const endpoint = process.env.MINIPROGRAM_AUTOMATION_ENDPOINT || 'ws://127.0.0.1:9420'
const outputRoot = process.env.RECIPE_UI_OUTPUT_ROOT

if (!outputRoot) throw new Error('RECIPE_UI_OUTPUT_ROOT is required')

async function ensureDemoSession(miniProgram) {
  const response = await fetch('http://127.0.0.1:3000/api/auth/dev-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ openid: 'demo-owner', displayName: '演示用户' })
  })
  const body = await response.json()
  if (!response.ok || !body.ok) throw new Error(body.message || 'Demo login failed')
  await miniProgram.evaluate((session) => getApp().setSession(session), body.data)
}

async function route(miniProgram, method, url) {
  const current = await miniProgram.currentPage()
  const targetPath = url.replace(/^\//, '').split('?')[0]
  if (current && current.path === targetPath) return current

  console.error(`stage: route-${method}-start`)
  await miniProgram.evaluate((payload) => {
    if (payload.method === 'switchTab') wx.switchTab({ url: payload.url })
    else if (payload.method === 'navigateTo') wx.navigateTo({ url: payload.url })
    else wx.reLaunch({ url: payload.url })
    return true
  }, { method, url })
  console.error(`stage: route-${method}-dispatched`)
  await new Promise((resolve) => setTimeout(resolve, 3200))
  return miniProgram.currentPage()
}

async function readPageData(miniProgram) {
  return miniProgram.evaluate(() => {
    const page = getCurrentPages().slice(-1)[0]
    if (!page) return null
    const data = page.data
    if (page.route === 'pages/recipes/index') {
      return {
        loading: data.loading,
        error: data.error,
        category: data.category,
        recipeCount: data.recipes.length,
        firstRecipeId: data.recipes[0] ? Number(data.recipes[0].id) : 0,
        sheetOpen: data.sheetOpen
      }
    }
    if (page.route === 'pages/recipe-detail/index') {
      return {
        loading: data.loading,
        error: data.error,
        sheetOpen: data.sheetOpen,
        recipe: data.recipe ? {
          id: data.recipe.id,
          ingredients: data.recipe.ingredients || [],
          stepList: data.recipe.stepList || []
        } : null
      }
    }
    if (page.route === 'pages/recipe-form/index') {
      return {
        loading: data.loading,
        coverUrl: data.coverUrl,
        ingredientSheetOpen: data.ingredientSheetOpen,
        stepItems: data.stepItems || [],
        form: data.form ? {
          title: data.form.title,
          ingredients: data.form.ingredients || []
        } : null
      }
    }
    return { loading: data.loading, error: data.error }
  })
}

async function callPage(miniProgram, method, event) {
  return miniProgram.evaluate((payload) => {
    const page = getCurrentPages().slice(-1)[0]
    if (!page || typeof page[payload.method] !== 'function') {
      throw new Error(`Page method ${payload.method} is unavailable`)
    }
    return page[payload.method](payload.event)
  }, { method, event })
}

async function main() {
  const miniProgram = await automator.connect({ wsEndpoint: endpoint })
  console.error('stage: connected')

  try {
    await ensureDemoSession(miniProgram)
    console.error('stage: session-ready')

    await route(miniProgram, 'switchTab', '/pages/recipes/index')
    console.error('stage: catalog-route-ready')
    const catalogScreenshot = path.join(outputRoot, 'recipe-catalog.png')
    const catalogData = await readPageData(miniProgram)
    console.error('stage: catalog-data-ready')
    if (catalogData.error) throw new Error(`Catalog error: ${catalogData.error}`)
    if (!catalogData.recipeCount || !catalogData.firstRecipeId) throw new Error('Catalog has no recipes')

    const favoriteBefore = await miniProgram.callWxMethod('getStorageSync', 'recipeFavoriteIds')
    await callPage(miniProgram, 'toggleFavorite', {
      currentTarget: { dataset: { id: catalogData.firstRecipeId } }
    })
    await new Promise((resolve) => setTimeout(resolve, 120))
    const favoriteAfter = await miniProgram.callWxMethod('getStorageSync', 'recipeFavoriteIds')
    await miniProgram.callWxMethod('setStorageSync', 'recipeFavoriteIds', favoriteBefore || [])

    await callPage(miniProgram, 'openAdd', {
      currentTarget: { dataset: { id: catalogData.firstRecipeId } }
    })
    await new Promise((resolve) => setTimeout(resolve, 120))
    const catalogSheetOpen = (await readPageData(miniProgram)).sheetOpen === true
    await callPage(miniProgram, 'closeSheet')

    const recipeId = catalogData.firstRecipeId
    await route(miniProgram, 'reLaunch', `/pages/recipe-detail/index?id=${recipeId}`)
    const detailScreenshot = path.join(outputRoot, 'recipe-detail.png')
    const detailData = await readPageData(miniProgram)
    if (detailData.error) throw new Error(`Detail error: ${detailData.error}`)
    if (!detailData.recipe) throw new Error('Detail recipe was not rendered')
    await callPage(miniProgram, 'openAdd')
    const detailSheetOpen = (await readPageData(miniProgram)).sheetOpen === true
    await callPage(miniProgram, 'closeSheet')

    await route(miniProgram, 'reLaunch', `/pages/recipe-form/index?id=${recipeId}`)
    const formScreenshot = path.join(outputRoot, 'recipe-editor.png')
    const formData = await readPageData(miniProgram)
    if (formData.loading) throw new Error('Recipe editor remained in loading state')
    if (!formData.form || !formData.form.title) throw new Error('Recipe editor did not load recipe data')
    await callPage(miniProgram, 'openIngredientSheet')
    const ingredientSheetOpen = (await readPageData(miniProgram)).ingredientSheetOpen === true
    await callPage(miniProgram, 'closeIngredientSheet')
    const stepCountBefore = (await readPageData(miniProgram)).stepItems.length
    await callPage(miniProgram, 'addStep')
    const stepCountAfter = (await readPageData(miniProgram)).stepItems.length

    console.log(JSON.stringify({
      viewport: await miniProgram.systemInfo(),
      catalog: {
        screenshot: catalogScreenshot,
        recipeCount: catalogData.recipeCount,
        category: catalogData.category,
        sheetOpened: catalogSheetOpen,
        favoriteChanged: JSON.stringify(favoriteBefore || []) !== JSON.stringify(favoriteAfter || [])
      },
      detail: {
        screenshot: detailScreenshot,
        recipeId,
        ingredientCount: detailData.recipe.ingredients.length,
        stepCount: detailData.recipe.stepList.length,
        sheetOpened: detailSheetOpen
      },
      editor: {
        screenshot: formScreenshot,
        coverUrl: formData.coverUrl || '',
        ingredientCount: formData.form.ingredients.length,
        ingredientSheetOpened: ingredientSheetOpen,
        stepAdded: stepCountAfter === stepCountBefore + 1
      }
    }, null, 2))
  } finally {
    miniProgram.disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
