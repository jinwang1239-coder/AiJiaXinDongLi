const auth = require('../../utils/auth')
const lineProjectService = require('../../utils/line-project-service')
const lineProjectConfig = require('../../utils/line-project-config')
const workspace = require('../../utils/workspace')

Page({
  data: {
    loading: false,
    uploading: false,
    canUpload: false,
    canViewAll: false,
    viewMode: false,
    district: '',
    navTitle: '证明材料',
    scopeText: '',
    monthPickerValue: lineProjectConfig.toMonthPickerValue(),
    settlementMonth: lineProjectConfig.getDefaultSettlementMonth(),
    selectedImages: [],
    records: [],
    previewVisible: false,
    previewUrl: ''
  },

  onLoad(options = {}) {
    const settlementMonth = lineProjectConfig.decodeQueryValue(options.settlementMonth) || this.data.settlementMonth
    const district = lineProjectConfig.decodeQueryValue(options.district)
    const mode = lineProjectConfig.decodeQueryValue(options.mode)
    this.setData({
      settlementMonth,
      monthPickerValue: lineProjectConfig.toMonthPickerValue(settlementMonth),
      district,
      viewMode: mode === 'view',
      navTitle: district ? `${district}证明材料` : '证明材料'
    })
  },

  onShow() {
    this.loadRecords()
  },

  async ensureAccess() {
    const user = await auth.ensureLoggedIn()
    if (!user) throw new Error('请先登录')
    if (!workspace.isLineProjectWorkspace(user)) {
      workspace.denyWorkspaceAccess(user, workspace.WORKSPACE_TYPES.LINE_PROJECT)
      return null
    }
    const access = await lineProjectService.callLineProject('getAccessProfile')
    if (!access.canViewEvidence) throw new Error('当前账号没有查看证明材料的权限')
    return access
  },

  async callEvidence(action, data = {}) {
    return lineProjectService.callLineProject(action, data)
  },

  async loadRecords() {
    try {
      this.setData({ loading: true })
      const access = await this.ensureAccess()
      if (!access) return
      const result = await this.callEvidence('listEvidence', {
        filters: {
          settlementMonth: this.data.settlementMonth,
          district: this.data.district
        }
      })
      const records = result.records || []
      this.setData({
        canUpload: !this.data.viewMode && !!result.canUpload,
        canViewAll: !!result.canViewAll,
        scopeText: this.data.district
          ? `查看范围：${this.data.district}`
          : result.canViewAll ? '查看范围：全部区县' : '查看范围：本人管理区县',
        records: records.map(item => ({
          ...item,
          uploaderName: (item.uploader && (item.uploader.realName || item.uploader.gridAccount)) || '未知人员',
          totalImageCount: (item.fileIDs || []).length,
          imageUrls: (item.imageUrls || []).filter(url => /^https?:\/\//i.test(url))
        }))
      })
    } catch (error) {
      console.error('加载证明材料失败:', error)
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onMonthChange(e) {
    const settlementMonth = String(e.detail.value || '').slice(0, 7)
    this.setData({
      settlementMonth,
      monthPickerValue: e.detail.value,
      selectedImages: [],
      records: []
    }, () => this.loadRecords())
  },

  chooseImages() {
    const remainCount = 9 - this.data.selectedImages.length
    if (remainCount <= 0) {
      wx.showToast({ title: '单次最多选择9张图片', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remainCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        this.setData({ selectedImages: this.data.selectedImages.concat(res.tempFiles || []) })
      }
    })
  },

  removeSelectedImage(e) {
    const selectedImages = this.data.selectedImages.slice()
    selectedImages.splice(Number(e.currentTarget.dataset.index), 1)
    this.setData({ selectedImages })
  },

  previewSelectedImage(e) {
    const image = this.data.selectedImages[Number(e.currentTarget.dataset.index)]
    if (image) this.openImagePreview(image.tempFilePath)
  },

  previewRecordImage(e) {
    const record = this.data.records[Number(e.currentTarget.dataset.recordIndex)]
    if (!record) return
    this.openImagePreview(record.imageUrls[Number(e.currentTarget.dataset.imageIndex)])
  },

  openImagePreview(url) {
    if (!url) {
      wx.showToast({ title: '图片暂时无法加载', icon: 'none' })
      return
    }
    this.setData({ previewVisible: true, previewUrl: url })
  },

  closeImagePreview() {
    this.setData({ previewVisible: false, previewUrl: '' })
  },

  onPreviewImageError() {
    this.closeImagePreview()
    wx.showToast({ title: '图片加载失败，请刷新重试', icon: 'none' })
  },

  stopPropagation() {
  },

  async submitEvidence() {
    if (!this.data.canUpload || !this.data.selectedImages.length) {
      wx.showToast({ title: '请先选择证明图片', icon: 'none' })
      return
    }

    const uploadedFileIDs = []
    try {
      this.setData({ uploading: true })
      wx.showLoading({ title: '上传中' })
      const taskId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      for (let index = 0; index < this.data.selectedImages.length; index += 1) {
        const file = this.data.selectedImages[index]
        const match = String(file.tempFilePath || '').match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
        const ext = match ? match[1].toLowerCase() : 'jpg'
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath: `line_project_evidences/${this.data.settlementMonth}/${taskId}_${index}.${ext}`,
          filePath: file.tempFilePath
        })
        uploadedFileIDs.push(uploadResult.fileID)
      }
      await this.callEvidence('createEvidence', {
        settlementMonth: this.data.settlementMonth,
        fileIDs: uploadedFileIDs
      })
      this.setData({ selectedImages: [] })
      wx.showToast({ title: '证明材料已提交', icon: 'success' })
      await this.loadRecords()
    } catch (error) {
      if (uploadedFileIDs.length) wx.cloud.deleteFile({ fileList: uploadedFileIDs }).catch(() => {})
      console.error('提交证明材料失败:', error)
      wx.showToast({ title: error.message || '提交失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ uploading: false })
    }
  }
})
