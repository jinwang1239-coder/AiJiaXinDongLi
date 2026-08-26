const auth = require('../../utils/auth')
const lineProjectService = require('../../utils/line-project-service')
const lineProjectConfig = require('../../utils/line-project-config')
const workspace = require('../../utils/workspace')

function withMoney(items = [], viewMode = '') {
  return items.map(item => ({
    ...item,
    itemKey: viewMode === 'person' ? item.personKey : item.workOrderKey,
    districtText: item.district || (item.districts || []).join('、'),
    totalAmountText: lineProjectConfig.formatMoney(item.totalAmount),
    workloadSummaryText: item.workloadSummary || `业务量 ${Number(item.businessQtyTotal || 0)}`
  }))
}

function decorateWorkloadItems(items = []) {
  return items.map(item => ({
    ...item,
    unitPriceText: lineProjectConfig.formatMoney(item.unitPrice),
    amountText: lineProjectConfig.formatMoney(item.amount)
  }))
}

Page({
  data: {
    loading: false,
    exporting: false,
    canAccess: false,
    isSystemAdmin: false,
    managedDistrictsText: '',
    viewMode: 'workorder',
    subCategoryOptions: ['全部模块', ...lineProjectConfig.SUBCATEGORY_OPTIONS],
    subCategoryIndex: 0,
    monthPickerValue: lineProjectConfig.toMonthPickerValue(),
    filters: {
      settlementMonth: lineProjectConfig.getDefaultSettlementMonth(),
      subCategory: '',
      keyword: ''
    },
    stats: {
      totalAmountText: '0.00',
      totalWorkOrders: 0,
      totalPeople: 0,
      totalRecords: 0,
      totalBusinessQty: 0,
      mismatchCount: 0
    },
    records: [],
    detail: null
  },

  onLoad(options = {}) {
    const settlementMonth = options.settlementMonth || this.data.filters.settlementMonth
    const subCategory = options.subCategory || ''
    const subCategoryIndex = Math.max(this.data.subCategoryOptions.indexOf(subCategory || '全部模块'), 0)
    this.setData({
      monthPickerValue: lineProjectConfig.toMonthPickerValue(settlementMonth),
      'filters.settlementMonth': settlementMonth,
      subCategoryIndex,
      'filters.subCategory': subCategory
    })
  },

  onShow() {
    this.loadPage()
  },

  async ensureAccess() {
    const user = await auth.ensureLoggedIn()
    if (!user || !workspace.isLineProjectWorkspace(user)) {
      if (user) workspace.denyWorkspaceAccess(user, workspace.WORKSPACE_TYPES.LINE_PROJECT)
      return null
    }
    const access = await lineProjectService.callLineProject('getAccessProfile')
    const canAccess = !!access.canManage
    this.setData({
      canAccess,
      isSystemAdmin: !!access.isSystemAdmin,
      managedDistrictsText: (access.managedDistricts || []).join('、') || '全部区县'
    })
    return canAccess ? access : null
  },

  async loadPage() {
    const access = await this.ensureAccess()
    if (!access) return
    try {
      this.setData({ loading: true })
      const action = this.data.viewMode === 'person' ? 'listByPerson' : 'listByWorkOrder'
      const filters = { ...this.data.filters }
      const [dashboard, list] = await Promise.all([
        lineProjectService.callLineProject('dashboard', { filters }),
        lineProjectService.callLineProject(action, {
          filters,
          page: 1,
          pageSize: 100,
          sortBy: 'totalAmount',
          sortOrder: 'desc'
        })
      ])
      this.setData({
        stats: {
          ...(dashboard.stats || {}),
          totalAmountText: lineProjectConfig.formatMoney(dashboard.stats && dashboard.stats.totalAmount)
        },
        records: withMoney(list.records || [], this.data.viewMode)
      })
    } catch (error) {
      wx.showToast({ title: error.message || '数据加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onMonthChange(e) {
    const settlementMonth = (e.detail.value || '').slice(0, 7)
    this.setData({
      monthPickerValue: e.detail.value,
      'filters.settlementMonth': settlementMonth,
      detail: null
    })
    this.loadPage()
  },

  onKeywordInput(e) {
    this.setData({ 'filters.keyword': e.detail.value })
  },

  onSubCategoryChange(e) {
    const subCategoryIndex = Number(e.detail.value || 0)
    const value = this.data.subCategoryOptions[subCategoryIndex] || '全部模块'
    this.setData({
      subCategoryIndex,
      'filters.subCategory': value === '全部模块' ? '' : value,
      detail: null
    })
    this.loadPage()
  },

  search() {
    this.loadPage()
  },

  switchView(e) {
    const viewMode = e.currentTarget.dataset.mode
    if (!viewMode || viewMode === this.data.viewMode) return
    this.setData({ viewMode, records: [], detail: null })
    this.loadPage()
  },

  async openDetail(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const personView = this.data.viewMode === 'person'
    try {
      const data = await lineProjectService.callLineProject(
        personView ? 'getPersonDetail' : 'getWorkOrderDetail',
        {
          filters: this.data.filters,
          [personView ? 'personKey' : 'workOrderKey']: key
        }
      )
      const summary = data.summary || {}
      this.setData({
        detail: {
          ...data,
          personView,
          summary: {
            ...summary,
            totalAmountText: lineProjectConfig.formatMoney(summary.totalAmount),
            detailMetaText: [
              summary.subCategory,
              `业务量 ${Number(summary.businessQtyTotal || 0)}`,
              summary.completionDateText,
              summary.siteLevel,
              summary.endpoint
            ].filter(Boolean).join(' · ')
          },
          participants: (data.participants || []).map(item => ({
            ...item,
            amountText: lineProjectConfig.formatMoney(item.amount),
            workloadItems: decorateWorkloadItems(item.workloadItems || [])
          })),
          workOrders: withMoney(data.workOrders || [], 'workorder'),
          evidenceRecords: (data.evidenceRecords || []).map(item => ({
            ...item,
            uploaderName: (item.uploader && (item.uploader.realName || item.uploader.gridAccount)) || '未知人员',
            imageUrls: (item.imageUrls || []).filter(url => /^https?:\/\//i.test(url))
          }))
        }
      })
    } catch (error) {
      wx.showToast({ title: error.message || '明细加载失败', icon: 'none' })
    }
  },

  closeDetail() {
    this.setData({ detail: null })
  },

  stopPropagation() {},

  previewEvidenceImage(e) {
    const url = e.currentTarget.dataset.url
    const urls = (this.data.detail && this.data.detail.evidenceRecords || [])
      .flatMap(item => item.imageUrls || [])
    if (url && urls.length) wx.previewImage({ current: url, urls })
  },

  async exportData() {
    if (this.data.exporting) return
    try {
      this.setData({ exporting: true })
      await lineProjectService.exportLineProject(this.data.viewMode, this.data.filters)
    } catch (error) {
      wx.showToast({ title: error.message || '导出失败', icon: 'none' })
    } finally {
      this.setData({ exporting: false })
    }
  }
})
