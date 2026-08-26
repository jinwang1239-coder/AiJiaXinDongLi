const auth = require('../../utils/auth')
const lineProjectService = require('../../utils/line-project-service')
const lineProjectConfig = require('../../utils/line-project-config')
const workspace = require('../../utils/workspace')

function buildProjectGroups(records = []) {
  const groups = {}
  records.forEach(record => {
    const project = record.relatedProject || {}
    const projectKey = project.workOrderKey || record.workOrderKey || ''
    const key = `${record.district || ''}:${projectKey || 'legacy'}`
    if (!groups[key]) {
      groups[key] = {
        workOrderKey: key,
        projectCode: project.workOrderCode || '',
        projectTitle: project.workOrderSubject || project.workOrderNameRaw || '历史未关联材料',
        subCategory: project.subCategory || '',
        legacy: !projectKey,
        imageCount: 0,
        records: []
      }
    }
    groups[key].imageCount += (record.fileIDs || []).length
    groups[key].records.push(record)
  })
  return Object.values(groups)
}

function getMonthStatusText(status = {}) {
  if (status.status === 'has_project_materials') {
    return `已关联${status.projectCount || 0}个项目 · ${status.materialCount || 0}组材料 · ${status.imageCount || 0}张图片`
  }
  if (status.status === 'no_special_scenario') return '已确认本月无特殊场景'
  return '本月特殊场景状态未确认'
}

Page({
  data: {
    loading: false,
    uploading: false,
    confirming: false,
    projectSearching: false,
    canUpload: false,
    canViewAll: false,
    viewMode: false,
    district: '',
    navTitle: '附件材料',
    scopeText: '',
    monthPickerValue: lineProjectConfig.toMonthPickerValue(),
    settlementMonth: lineProjectConfig.getDefaultSettlementMonth(),
    monthStatus: 'unconfirmed',
    monthStatusText: '本月特殊场景状态未确认',
    projectKeyword: '',
    projectResults: [],
    selectedProject: null,
    selectedImages: [],
    records: [],
    projectGroups: [],
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
      navTitle: district ? `${district}附件材料` : '附件材料'
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
    if (!access.canViewEvidence) throw new Error('当前账号没有查看附件材料的权限')
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
      const district = this.data.district || (!access.canViewAllEvidence && (access.managedDistricts || [])[0]) || ''
      const canUpload = !this.data.viewMode && !!access.canUploadEvidence
      const result = await this.callEvidence('listEvidence', {
        filters: { settlementMonth: this.data.settlementMonth, district }
      })
      const records = result.records || []
      const status = (result.districtStatuses || []).find(item => item.district === district) || { status: 'unconfirmed' }
      const viewRecords = records.map(item => ({
        ...item,
        uploaderName: (item.uploader && (item.uploader.realName || item.uploader.gridAccount)) || '未知人员',
        totalImageCount: (item.fileIDs || []).length,
        imageUrls: (item.imageUrls || []).filter(url => /^https?:\/\//i.test(url))
      }))
      this.setData({
        district,
        canUpload,
        canViewAll: !!result.canViewAll,
        scopeText: district
          ? `查看范围：${district}`
          : result.canViewAll ? '查看范围：全部区县' : '查看范围：本人管理区县',
        monthStatus: status.status,
        monthStatusText: getMonthStatusText(status),
        records: viewRecords,
        projectGroups: buildProjectGroups(viewRecords)
      })
    } catch (error) {
      console.error('加载附件材料失败:', error)
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
      records: [],
      projectGroups: [],
      projectKeyword: '',
      projectResults: [],
      selectedProject: null
    }, () => this.loadRecords())
  },

  onProjectKeywordInput(e) {
    this.setData({
      projectKeyword: e.detail.value,
      projectResults: [],
      selectedProject: null
    })
  },

  async searchProjects() {
    const keyword = String(this.data.projectKeyword || '').trim()
    if (!keyword) {
      wx.showToast({ title: '请输入项目编号', icon: 'none' })
      return
    }
    try {
      this.setData({ projectSearching: true, projectResults: [], selectedProject: null })
      const result = await this.callEvidence('listByWorkOrder', {
        filters: {
          settlementMonth: this.data.settlementMonth,
          district: this.data.district,
          keyword
        },
        page: 1,
        pageSize: 20,
        sortBy: 'totalAmount',
        sortOrder: 'desc'
      })
      const projectResults = result.records || []
      const exactProject = projectResults.find(item => String(item.workOrderCode || '').trim() === keyword)
      if (exactProject) {
        this.setData({ selectedProject: exactProject })
        wx.showToast({ title: '已关联项目', icon: 'success' })
        return
      }
      this.setData({ projectResults })
      if (!projectResults.length) wx.showToast({ title: '未查到匹配项目', icon: 'none' })
    } catch (error) {
      wx.showToast({ title: error.message || '查询失败', icon: 'none' })
    } finally {
      this.setData({ projectSearching: false })
    }
  },

  selectProject(e) {
    const project = this.data.projectResults[Number(e.currentTarget.dataset.index)]
    if (!project) return
    this.setData({
      selectedProject: project,
      projectKeyword: project.workOrderCode || this.data.projectKeyword,
      projectResults: []
    })
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
    this.openImagePreview(e.currentTarget.dataset.url)
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
    const project = this.data.selectedProject
    if (!project || !project.workOrderKey) {
      wx.showToast({ title: '请选择关联项目', icon: 'none' })
      return
    }
    if (!this.data.canUpload || !this.data.selectedImages.length) {
      wx.showToast({ title: '请先选择附件图片', icon: 'none' })
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
        district: this.data.district,
        workOrderKey: project.workOrderKey,
        fileIDs: uploadedFileIDs
      })
      this.setData({
        selectedImages: [],
        projectKeyword: '',
        projectResults: [],
        selectedProject: null
      })
      wx.showToast({ title: '附件材料已提交', icon: 'success' })
      await this.loadRecords()
    } catch (error) {
      if (uploadedFileIDs.length) wx.cloud.deleteFile({ fileList: uploadedFileIDs }).catch(() => {})
      console.error('提交附件材料失败:', error)
      wx.showToast({ title: error.message || '提交失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ uploading: false })
    }
  },

  confirmNoSpecialScenario() {
    if (!this.data.canUpload || this.data.monthStatus !== 'unconfirmed') return
    wx.showModal({
      title: '确认无特殊场景',
      content: `确认${this.data.settlementMonth}本区县没有需要提交附件材料的特殊场景？`,
      success: async res => {
        if (!res.confirm) return
        try {
          this.setData({ confirming: true })
          await this.callEvidence('confirmNoSpecialScenario', {
            settlementMonth: this.data.settlementMonth,
            district: this.data.district
          })
          wx.showToast({ title: '状态已确认', icon: 'success' })
          await this.loadRecords()
        } catch (error) {
          wx.showToast({ title: error.message || '确认失败', icon: 'none' })
        } finally {
          this.setData({ confirming: false })
        }
      }
    })
  }
})
