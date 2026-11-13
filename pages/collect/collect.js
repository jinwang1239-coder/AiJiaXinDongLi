const auth = require('../../utils/auth')
const { callSales, currentMonth } = require('../../utils/sales-service')

function getMaintenanceVersions(versions, month = '') {
  const districts = new Map()
  versions.forEach(version => {
    if (month && version.businessMonth !== month) return
    const current = districts.get(version.district)
    if (!current || version.businessMonth > current.businessMonth) districts.set(version.district, version)
  })
  return Array.from(districts.values())
}

Page({
  data: {
    canImport: false, canMaintain: false, maintenanceOnly: false, busy: false, importAction: '', businessMonth: currentMonth(),
    cutoffDate: '',
    maintenanceMonths: ['最新数据'], maintenanceMonthIndex: 0,
    finalized: false, file: null, fileID: '', preview: null, activeVersions: [], employeeId: ''
  },
  onLoad(options = {}) { this.setData({ maintenanceOnly: options.mode === 'maintenance' }) },
  async onShow() {
    try {
      if (!await auth.ensureLoggedIn()) { wx.switchTab({ url: '/pages/login/login' }); return }
      const access = await callSales('getAccess')
      const now = new Date()
      this.setData({ canImport: access.canImport, canMaintain: access.canMaintain, cutoffDate: this.data.cutoffDate ||
        currentMonth() + '-' + String(now.getDate()).padStart(2, '0') })
      if (access.canImport || access.canMaintain) await this.loadActiveVersions()
    } catch (error) { this.setData({ canImport: false }); this.showError(error) }
  },
  showError(error) { wx.showModal({ title: '操作提示', content: error.message || '操作失败', showCancel: false }) },
  onMonthChange(e) {
    const month = e.detail.value
    const [year, number] = month.split('-').map(Number)
    const last = new Date(year, number, 0).getDate()
    const day = month === currentMonth() ? new Date().getDate() : last
    this.setData({ businessMonth: month, cutoffDate: month + '-' + String(day).padStart(2, '0'), preview: null, finalized: false })
  },
  onCutoffChange(e) { this.setData({ cutoffDate: e.detail.value, preview: null }) },
  onMaintenanceMonthChange(e) {
    const index = Number(e.detail.value)
    this.setData({ maintenanceMonthIndex: index,
      activeVersions: getMaintenanceVersions(this.activeVersionRecords || [], index ? this.data.maintenanceMonths[index] : '') })
  },
  onFinalizedChange(e) { this.setData({ finalized: e.detail.value, preview: null }) },
  onEmployeeInput(e) { this.setData({ employeeId: e.detail.value }) },
  chooseFile() {
    wx.chooseMessageFile({
      count: 1, type: 'file', extension: ['xls', 'xlsx'],
      success: res => {
        const file = res.tempFiles[0]
        if (!/\.(xls|xlsx)$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
          this.showError(new Error('请选择10MB以内的Excel文件')); return
        }
        this.setData({ file, fileID: '', preview: null })
      }
    })
  },
  metadata() {
    return { businessMonth: this.data.businessMonth, cutoffDate: this.data.cutoffDate,
      finalized: this.data.finalized, fileID: this.data.fileID,
      fileName: this.data.file ? this.data.file.name : '' }
  },
  async previewImport() {
    if (this.data.busy) return
    if (!this.data.file) { this.showError(new Error('请选择Excel文件')); return }
    this.setData({ busy: true, importAction: 'preview', preview: null })
    try {
      let fileID = this.data.fileID
      if (!fileID) {
        const upload = await wx.cloud.uploadFile({
          cloudPath: 'sales_imports/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.xlsx',
          filePath: this.data.file.path
        })
        fileID = upload.fileID
        this.setData({ fileID })
      }
      const preview = await callSales('importPreview', this.metadata())
      this.setData({ preview })
    } catch (error) { this.showError(error) } finally { this.setData({ busy: false, importAction: '' }) }
  },
  async commitImport() {
    if (this.data.busy || !this.data.preview || this.data.preview.errors.length) return
    const decision = await new Promise(resolve => wx.showModal({
      title: this.data.finalized ? '覆盖并定版' : '覆盖累计业务量',
      content: this.data.businessMonth + '，' + this.data.preview.meta.districts.join('、') +
        '：以本文件替换整月业务量，缺失员工原业务量将不再生效。统计截至' + this.data.cutoffDate +
        (this.data.finalized ? '。请确认最终统计范围，定版后普通导入将被锁定。' : '。不是新增量累加。'),
      success: resolve, fail: () => resolve({ confirm: false })
    }))
    if (!decision.confirm || this.data.busy || !this.data.preview) return
    this.setData({ busy: true, importAction: 'publish' })
    try {
      const result = await callSales('importCommit', { ...this.metadata(), previewToken: this.data.preview.previewToken })
      this.setData({ preview: null, file: null, fileID: '', finalized: false })
      wx.showToast({ title: result.unchanged ? '数据相同，无需更新' : '发布成功', icon: 'success' })
    } catch (error) {
      this.setData({ preview: null })
      this.showError(error)
      if (error.code === 'SALES_FUNCTION_TIMEOUT') {
        try { await this.loadActiveVersions() } catch (refreshError) { console.error('发布超时后读取区县数据状态失败:', refreshError) }
      }
      return
    } finally { this.setData({ busy: false, importAction: '' }) }
    try { await this.loadActiveVersions() } catch (error) { this.showError(new Error('发布已完成，但区县数据状态刷新失败，请重新进入页面查看。')) }
  },
  async loadActiveVersions() {
    const result = await callSales('getActiveVersions')
    const selectedMonth = this.data.maintenanceMonthIndex ? this.data.maintenanceMonths[this.data.maintenanceMonthIndex] : ''
    const maintenanceMonths = ['最新数据', ...new Set(result.versions.map(version => version.businessMonth).sort().reverse())]
    const maintenanceMonthIndex = Math.max(0, maintenanceMonths.indexOf(selectedMonth))
    this.activeVersionRecords = result.versions
    this.setData({ maintenanceMonths, maintenanceMonthIndex,
      activeVersions: getMaintenanceVersions(result.versions, maintenanceMonthIndex ? maintenanceMonths[maintenanceMonthIndex] : '') })
  },
  async reopenMonth(e) {
    if (this.data.busy) return
    const version = this.data.activeVersions[e.currentTarget.dataset.index]
    const decision = await new Promise(resolve => wx.showModal({
      title: '撤销定版：' + version.businessMonth + ' ' + version.district,
      editable: true, placeholderText: '请输入更正原因', success: resolve, fail: () => resolve({})
    }))
    if (!decision.confirm || !String(decision.content || '').trim()) return
    this.setData({ busy: true })
    try {
      await callSales('reopenMonth', { ...version, reason: decision.content })
      this.setData({ preview: null })
      await this.loadActiveVersions()
    } catch (error) { this.showError(error) } finally { this.setData({ busy: false }) }
  },
  async releaseClaim() {
    if (this.data.busy || !this.data.employeeId.trim()) return
    const decision = await new Promise(resolve => wx.showModal({
      title: '解除该员工的微信认领',
      editable: true, placeholderText: '请输入错误认领或换绑原因', success: resolve, fail: () => resolve({})
    }))
    if (!decision.confirm || !String(decision.content || '').trim()) return
    this.setData({ busy: true })
    try {
      const response = await wx.cloud.callFunction({ name: 'userManagement', data: {
        action: 'releaseSalesClaim', data: { employeeId: this.data.employeeId, reason: decision.content }
      } })
      if (!response.result || !response.result.success) throw new Error(response.result && response.result.error || '解除失败')
      wx.showToast({ title: '已解除，可重新认领' })
    } catch (error) { this.showError(error) } finally { this.setData({ busy: false }) }
  },
  async clearDistrictMonth(e) {
    if (this.data.busy || !this.data.canMaintain) return
    const version = this.data.activeVersions[e.currentTarget.dataset.index]
    const decision = await new Promise(resolve => wx.showModal({
      title: '清空：' + version.businessMonth + ' ' + version.district,
      content: '仅用于该区县人员全部调出等更正。原版本与认领关系保留，请填写更正原因。',
      editable: true, placeholderText: '更正原因', success: resolve, fail: () => resolve({})
    }))
    if (!decision.confirm || !String(decision.content || '').trim()) return
    this.setData({ busy: true })
    try {
      await callSales('clearDistrictMonth', { ...version, reason: decision.content })
      await this.loadActiveVersions()
      wx.showToast({ title: '已更正', icon: 'success' })
    } catch (error) { this.showError(error) } finally { this.setData({ busy: false }) }
  }
})
