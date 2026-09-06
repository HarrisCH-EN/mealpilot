const test = require('node:test')
const assert = require('node:assert/strict')
const mysql = require('mysql2/promise')
const { getConfig } = require('../src/config')

const expectedTitles = [
  '番茄炒蛋', '蒜蓉西兰花', '冬瓜虾仁汤', '香煎鸡胸肉', '清炒菠菜', '家常豆腐汤', '土豆焖饭',
  '清蒸鲈鱼', '青椒肉丝', '土豆炖牛肉', '香菇滑鸡', '虾仁炒蛋', '糖醋里脊', '红烧鸡翅',
  '芹菜炒牛肉', '蒜苔炒肉', '葱爆羊肉', '红烧鱼块', '宫保鸡丁', '清炒菜心', '蒜蓉空心菜',
  '香菇青菜', '手撕包菜', '家常茄子', '地三鲜', '醋溜白菜', '清炒荷兰豆', '凉拌黄瓜',
  '木耳炒山药', '香菇豆腐', '紫菜蛋花汤', '番茄牛腩汤', '玉米排骨汤', '海带豆腐汤',
  '鲫鱼豆腐汤', '丝瓜虾皮汤', '菌菇鸡汤', '莲藕排骨汤', '香菇鸡肉粥', '小米南瓜粥',
  '皮蛋瘦肉粥', '三鲜水饺', '猪肉白菜包子', '葱油饼', '蛋炒饭', '扬州炒饭', '南瓜发糕', '红豆小米粥'
]

test('seeded demo catalog has 48 active recipes and core ingredient relations', async () => {
  const config = getConfig()
  const connection = await mysql.createConnection(config.mysql)
  try {
    const [recipes] = await connection.execute("SELECT id, title, category, cover_url AS coverUrl FROM recipes WHERE status = 'active' ORDER BY id")
    assert.equal(recipes.length, 48)
    assert.deepEqual(recipes.slice(0, 7).map((recipe) => [recipe.id, recipe.title]), expectedTitles.slice(0, 7).map((title, index) => [index + 1, title]))
    assert.deepEqual(recipes.map((recipe) => recipe.title), expectedTitles)
    assert.ok(recipes.every((recipe) => ['荤菜', '素菜', '汤', '主食'].includes(recipe.category)))
    assert.ok(recipes.filter((recipe) => recipe.coverUrl).every((recipe) => /^\/assets\/recipes\/[a-z0-9]+(?:-[a-z0-9]+)*\.jpg$/.test(recipe.coverUrl)))

    const [relations] = await connection.execute('SELECT recipe_id AS recipeId, COUNT(*) AS ingredientCount FROM recipe_ingredients GROUP BY recipe_id')
    const relationCounts = new Map(relations.map((row) => [Number(row.recipeId), Number(row.ingredientCount)]))
    assert.equal(relationCounts.size, 48)
    assert.ok([...relationCounts.values()].every((count) => count >= 2))
  } finally {
    await connection.end()
  }
})
