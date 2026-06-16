const auth = require('../../utils/auth')
const lineProjectService = require('../../utils/line-project-service')
const lineProjectConfig = require('../../utils/line-project-config')
const workspace = require('../../utils/workspace')

Page({
  data: {
    userRole: '',
    canImport: false,
    monthPickerValue: lineProjectConfig.toMonthPickerValue(),
    filters: {
      settlementMonth: lineProjectConfig.getDefaultSettlementMonth(),
      majorCategory: lineProjectConfig.CURRENT_MAJOR_CATEGORY,
      subCategory: lineProjectConfig.CURRENT_SUBCATEGORY
    },
    importFile: null,
    uploadState: null,
    previewResult: null,
    batches: [],
    previewing: false,
    importing: false,
    loadingBatches: false
  },

  onLoad(options = {}) {
    const settlementMonth = options.settlementMonth || this.data.filters.settlementMonth
    this.setData({
      monthPickerValue: lineProjectConfig.toMonthPickerValue(settlementMonth),
      'filters.settlementMonth': settlementMonth
    })
  },

  onShow() {
    this.loadBatches()
  },

  async ensureLogin() {
    const user = await auth.ensureLoggedIn()
    if (!user) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return null
    }

    if (!workspace.isLineProjectWorkspace(user)) {
      workspace.denyWorkspaceAccess(user, workspace.WORKSPACE_TYPES.LINE_PROJECT)
      return null
    }

    const canImport = ['district_manager', 'sales_department'].includes(user.role)
    this.setData({
      userRole: user.role || '',
      canImport
    })
    return user
  },

  onMonthChange(e) {
    const settlementMonth = (e.detail.value || '').slice(0, 7)
    this.setData({
      monthPickerValue: e.detail.value,
      'filters.settlementMonth': settlementMonth
    })
    this.resetPreviewState()
  },

  resetPreviewState() {
    this.setData({
      uploadState: null,
      previewResult: null
    })
  },

  chooseImportFile() {
    if (!this.data.canImport) {
      wx.showToast({
        title: '当前角色没有导入权限',
        icon: 'none'
      })
      return
    }

    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xls', 'xlsx'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) {
          return
        }

        if (!/\.(xls|xlsx)$/i.test(file.name || '')) {
          wx.showToast({
            title: '请选择 Excel 文件',
            icon: 'none'
          })
          return
        }

        this.setData({
          importFile: file
        })
        this.resetPreviewState()
      }
    })
  },

  clearImportFile() {
    this.setData({
      importFile: null
    })
    this.resetPreviewState()
  },

  async ensureUploadedFile() {
    if (this.data.uploadState && this.data.uploadState.fileID) {
      return this.data.uploadState
    }

    const file = this.data.importFile
    if (!file) {
      throw new Error('请先选择 Excel 文件')
    }

    const safeName = (file.name || 'jkkt-import.xlsx').replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')
    const uploadResult = await wx.cloud.uploadFile({
      cloudPath: `line_project_imports/${Date.now()}_${safeName}`,
      filePath: file.path
    })

    const uploadState = {
      fileID: uploadResult.fileID,
      fileName: file.name || safeName
    }

    this.setData({ uploadState })
    return uploadState
  },

  async previewImport() {
    const user = await this.ensureLogin()
    if (!user) {
      return
    }

    if (!this.data.importFile) {
      wx.showToast({
        title: '请先选择 Excel 文件',
        icon: 'none'
      })
      return
    }

    try {
      this.setData({ previewing: true })
      wx.showLoading({ title: '正在预解析...' })
      const uploaded = await this.ensureUploadedFile()
      const previewResult = await lineProjectService.callLineProject('importPreview', {
        fileID: uploaded.fileID,
        fileName: uploaded.fileName,
        settlementMonth: this.data.filters.settlementMonth
      })
      this.setData({ previewResult })
    } catch (error) {
      console.error('集客开通预解析失败:', error)
      wx.showToast({
        title: error.message || '预解析失败',
        icon: 'none'
      })
    } finally {
      this.setData({ previewing: false })
      wx.hideLoading()
    }
  },

  async commitImport() {
    const user = await this.ensureLogin()
    if (!user) {
      return
    }

    if (!this.data.previewResult || !this.data.uploadState) {
      wx.showToast({
        title: '请先执行预解析',
        icon: 'none'
      })
      return
    }

    if (this.data.previewResult.hasBlockingErrors) {
      wx.showToast({
        title: '存在阻断错误，请先处理后再导入',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '确认导入',
      content: '系统将按“结算月份 + 集客开通 + 导入区县”覆盖旧数据，确认继续？',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        try {
          this.setData({ importing: true })
          wx.showLoading({ title: '正在导入...' })
          const result = await lineProjectService.callLineProject('importCommit', {
            fileID: this.data.uploadState.fileID,
            fileName: this.data.uploadState.fileName,
            settlementMonth: this.data.filters.settlementMonth
          })

          wx.showToast({
            title: `导入成功 ${result.summary.successRows} 条`,
            icon: 'success'
          })

          this.setData({
            importFile: null,
            uploadState: null,
            previewResult: null
          })
          this.loadBatches()
        } catch (error) {
          console.error('集客开通导入失败:', error)
          wx.showToast({
            title: error.message || '正式导入失败',
            icon: 'none'
          })
        } finally {
          this.setData({ importing: false })
          wx.hideLoading()
        }
      }
    })
  },

  async loadBatches() {
    const user = await this.ensureLogin()
    if (!user || !this.data.canImport) {
      return
    }

    try {
      this.setData({ loadingBatches: true })
      const data = await lineProjectService.callLineProject('getImportBatches', {
        filters: {
          settlementMonth: this.data.filters.settlementMonth
        }
      })

      this.setData({
        batches: (data.records || []).map(item => ({
          ...item,
          calculatedAmountTotalText: lineProjectConfig.formatMoney(item.calculatedAmountTotal)
        }))
      })
    } catch (error) {
      console.error('加载导入批次失败:', error)
    } finally {
      this.setData({ loadingBatches: false })
    }
  }
})
