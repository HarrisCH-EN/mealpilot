const { request } = require('../../utils/api')

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
  const rpxToPx = (rpx) => rpx * windowWidth / 750
  const capsuleTop = Number(capsule && capsule.top)
  const capsuleBottom = Number(capsule && capsule.bottom)
  const capsuleHeight = Number(capsule && capsule.height)
  const hasMenuButton = Number.isFinite(capsuleTop)
    && Number.isFinite(capsuleBottom)
    && Number.isFinite(capsuleHeight)
    && capsuleHeight > 0
    && capsuleBottom >= capsuleTop
  const navTop = (hasMenuButton ? capsuleBottom : statusBarHeight) + rpxToPx(12)
  const navigationHeight = rpxToPx(80)
  const navBottom = navTop + navigationHeight
  return {
    navStyle: `top:${navTop}px;height:${navigationHeight}px;padding:0 ${rpxToPx(36)}px;`,
    contentStyle: `padding-top:${navBottom + rpxToPx(20)}px;`
  }
}

Page({
  data: {
    navStyle: '',
    contentStyle: '',
    loading: false,
    error: '',
    systemTags: [],
    customTags: [],
    creating: false,
    editingTagId: 0,
    deletingTagId: 0
  },

  onLoad() {
    this.setData(getNavigationLayout())
  },

  onShow() {
    this.loadTags()
  },

  async loadTags() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const catalog = await request('/tags')
      this.setData({
        systemTags: catalog.systemTags || [],
        customTags: catalog.customTags || []
      })
    } catch (error) {
      this.setData({ error: Number(error.status) === 403 ? '请先创建或加入家庭' : (error.message || '标签加载失败，请重试') })
    } finally {
      this.setData({ loading: false })
    }
  },

  retry() {
    this.loadTags()
  },

  back() {
    wx.navigateBack()
  },

  createTag() {
    if (this.data.creating || this.data.loading) return
    wx.showModal({
      title: '新建标签',
      editable: true,
      placeholderText: '例如：下饭、儿童爱吃',
      confirmText: '创建',
      success: async (result) => {
        const name = String(result.content || '').trim()
        if (!result.confirm) return
        if (!name) {
          wx.showToast({ title: '请输入标签名称', icon: 'none' })
          return
        }
        this.setData({ creating: true })
        try {
          await request('/tags', 'POST', { name })
          wx.showToast({ title: '标签已创建', icon: 'success' })
          await this.loadTags()
        } catch (error) {
          wx.showToast({ title: Number(error.status) === 409 ? '这个标签已经存在' : (error.message || '创建失败'), icon: 'none' })
        } finally {
          this.setData({ creating: false })
        }
      }
    })
  },

  renameTag(event) {
    const tagId = Number(event.currentTarget.dataset.tagId)
    const tag = this.data.customTags.find((item) => Number(item.id) === tagId)
    if (!tag || this.data.editingTagId || this.data.deletingTagId) return
    wx.showModal({
      title: '修改标签',
      editable: true,
      value: tag.name,
      placeholderText: '输入标签名称',
      confirmText: '保存',
      success: async (result) => {
        const name = String(result.content || '').trim()
        if (!result.confirm) return
        if (!name) {
          wx.showToast({ title: '请输入标签名称', icon: 'none' })
          return
        }
        this.setData({ editingTagId: tagId })
        try {
          await request(`/tags/${tagId}`, 'PUT', { name })
          await this.loadTags()
          wx.showToast({ title: '标签名称已更新', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: Number(error.status) === 409 ? '这个标签已经存在' : (error.message || '修改失败'), icon: 'none' })
        } finally {
          this.setData({ editingTagId: 0 })
        }
      }
    })
  },

  deleteTag(event) {
    const tagId = Number(event.currentTarget.dataset.tagId)
    const tag = this.data.customTags.find((item) => Number(item.id) === tagId)
    if (!tag || this.data.deletingTagId || this.data.editingTagId) return
    wx.showModal({
      title: `删除“${tag.name}”标签？`,
      content: '删除后，该标签会从所有关联菜品中移除，并且无法恢复。',
      confirmText: '删除',
      confirmColor: '#e94b6b',
      success: async (result) => {
        if (!result.confirm) return
        this.setData({ deletingTagId: tagId })
        try {
          await request(`/tags/${tagId}`, 'DELETE')
          await this.loadTags()
          wx.showToast({ title: '标签已删除', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: Number(error.status) === 403 ? '你没有权限删除这个标签' : (error.message || '删除失败，请稍后重试'), icon: 'none' })
        } finally {
          this.setData({ deletingTagId: 0 })
        }
      }
    })
  }
})
