const auth = require('../../utils/auth')
const lineProjectService = require('../../utils/line-project-service')
const lineProjectConfig = require('../../utils/line-project-config')
const workspace = require('../../utils/workspace')

Page({
  data: {
    canImport: false,
    monthPickerValue: lineProjectConfig.toMonthPickerValue(),
    settlementMonth: lineProjectConfig.getDefaultSettlementMonth(),
    importFile: null,
    uploadState: null,
    previewResult: null,
    batches: [],
    previewing: false,
    importing: false
  },

  onLoad(options = {}) {
    const settlementMonth = options.settlementMonth || this.data.settlementMonth
    this.setData({
      settlementMonth,
      monthPickerValue: lineProjectConfig.toMonthPickerValue(settlementMonth)
    })
  },

  onShow() {
    this.loadBatches()
  },

  async ensureAdmin() {
    const user = await auth.ensureLoggedIn()
    if (!user) return null
    if (!workspace.isLineProjectWorkspace(user)) {
      workspace.denyWorkspaceAccess(user, workspace.WORKSPACE_TYPES.LINE_PROJECT)
      return null
    }
    const access = await lineProjectService.callLineProject('getAccessProfile')
    const canImport = !!access.isSystemAdmin
    this.setData({ canImport })
    return canImport ? user : null
  },

  onMonthChange(e) {
    const settlementMonth = (e.detail.value || '').slice(0, 7)
    this.setData({
      settlementMonth,
      monthPickerValue: e.detail.value,
      uploadState: null,
      previewResult: null
    })
    this.loadBatches()
  },

  chooseImportFile() {
    if (!this.data.canImport) return
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xls', 'xlsx'],
      success: res => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !/\.(xls|xlsx)$/i.test(file.name || '')) {
          wx.showToast({ title: '请选择 Excel 文件', icon: 'none' })
          return
        }
        this.setData({ importFile: file, uploadState: null, previewResult: null })
      }
    })
  },

  clearImportFile() {
    this.setData({ importFile: null, uploadState: null, previewResult: null })
  },

  async ensureUploadedFile() {
    if (this.data.uploadState) return this.data.uploadState
    const file = this.data.importFile
    if (!file) throw new Error('请先选择 Excel 文件')
    const safeName = (file.name || 'salary-import.xlsx').replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')
    const result = await wx.cloud.uploadFile({
      cloudPath: `line_project_salary_imports/${Date.now()}_${safeName}`,
      filePath: file.path
    })
    const uploadState = { fileID: result.fileID, fileName: file.name || safeName }
    this.setData({ uploadState })
    return uploadState
  },

  decoratePreview(data = {}) {
    const summary = data.summary || {}
    return {
      ...data,
      summary: {
        ...summary,
        netPayTotalText: lineProjectConfig.formatMoney(summary.netPayTotal),
        districtSummaries: (summary.districtSummaries || []).map(item => ({
          ...item,
          fixedPayTotalText: lineProjectConfig.formatMoney(item.fixedPayTotal),
          quantitativePayTotalText: lineProjectConfig.formatMoney(item.quantitativePayTotal),
          netPayTotalText: lineProjectConfig.formatMoney(item.netPayTotal)
        }))
      },
      hasBlockingErrors: !!(data.blockingErrors && data.blockingErrors.length),
      previewRows: (data.previewRows || []).map(item => ({
        ...item,
        fixedPayText: lineProjectConfig.formatMoney(item.fixedPay),
        quantitativePayText: lineProjectConfig.formatMoney(item.quantitativePay),
        netPayText: lineProjectConfig.formatMoney(item.calculatedNetPay)
      }))
    }
  },

  async previewImport() {
    if (!await this.ensureAdmin()) return
    try {
      this.setData({ previewing: true })
      wx.showLoading({ title: '正在核对工资表...' })
      const uploaded = await this.ensureUploadedFile()
      const data = await lineProjectService.callLineProject('salaryImportPreview', {
        ...uploaded,
        settlementMonth: this.data.settlementMonth
      })
      this.setData({ previewResult: this.decoratePreview(data) })
    } catch (error) {
      wx.showToast({ title: error.message || '预解析失败', icon: 'none' })
    } finally {
      this.setData({ previewing: false })
      wx.hideLoading()
    }
  },

  async commitImport() {
    if (!await this.ensureAdmin()) return
    if (!this.data.previewResult || !this.data.uploadState) {
      wx.showToast({ title: '请先执行预解析', icon: 'none' })
      return
    }
    if (this.data.previewResult.hasBlockingErrors) {
      wx.showToast({ title: '请先修正阻断错误', icon: 'none' })
      return
    }
    wx.showModal({
      title: '确认导入整体工资',
      content: `确认用当前文件更新 ${this.data.settlementMonth} 的个人整体工资吗？`,
      success: async res => {
        if (!res.confirm) return
        try {
          this.setData({ importing: true })
          wx.showLoading({ title: '正在导入...' })
          const result = await lineProjectService.callLineProject('salaryImportCommit', {
            ...this.data.uploadState,
            settlementMonth: this.data.settlementMonth
          })
          wx.showToast({ title: `成功导入 ${result.summary.successRows} 人`, icon: 'success' })
          await this.loadBatches()
        } catch (error) {
          wx.showToast({ title: error.message || '导入失败', icon: 'none' })
        } finally {
          this.setData({ importing: false })
          wx.hideLoading()
        }
      }
    })
  },

  async loadBatches() {
    try {
      if (!await this.ensureAdmin()) return
      const data = await lineProjectService.callLineProject('getSalaryImportBatches', {
        settlementMonth: this.data.settlementMonth
      })
      this.setData({
        batches: (data.records || []).map(item => ({
          ...item,
          districtText: (item.districts || []).join('、'),
          netPayTotalText: lineProjectConfig.formatMoney(item.netPayTotal)
        }))
      })
    } catch (error) {
      console.error('加载整体工资导入批次失败:', error)
    }
  }
})
