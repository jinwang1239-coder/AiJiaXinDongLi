const auth = require('../../utils/auth')
const lineProjectService = require('../../utils/line-project-service')
const lineProjectConfig = require('../../utils/line-project-config')
const workspace = require('../../utils/workspace')

function decorateGroupedWorkloads(groups = [], expandedGroups = {}) {
  return (groups || []).map(group => {
    const items = group.items || []
    const activeCount = items.filter(item => Number(item.qty || 0) > 0).length
    const itemCount = items.length

    return {
      ...group,
      activeCount,
      itemCount,
      summaryText: activeCount > 0 ? `${activeCount}/${itemCount}项有量` : `0/${itemCount}项`,
      amountTotal: items.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      amountTotalText: lineProjectConfig.formatMoney(items.reduce((sum, item) => sum + Number(item.amount || 0), 0)),
      expanded: !!expandedGroups[group.groupName]
    }
  })
}

function buildDefaultOverview(settlementMonth, subCategory = '') {
  const opening = !subCategory || subCategory === lineProjectConfig.CURRENT_SUBCATEGORY
  return {
    settlementMonth,
    subCategory,
    totalAmount: 0,
    totalAmountText: lineProjectConfig.formatMoney(0),
    totalWorkOrders: 0,
    totalRecords: 0,
    businessQtyTotal: 0,
    groupedWorkloads: opening
      ? decorateGroupedWorkloads(lineProjectConfig.buildGroupedWorkloadItems([]), {})
      : []
  }
}

function getDefaultExpandedGroups(groups = []) {
  const firstGroup = (groups || []).find(group => Number(group.activeCount || 0) > 0) || groups[0]
  return firstGroup ? { [firstGroup.groupName]: true } : {}
}

Page({
  data: {
    loading: false,
    overviewLoading: false,
    monthPickerValue: lineProjectConfig.toMonthPickerValue(),
    filters: {
      settlementMonth: lineProjectConfig.getDefaultSettlementMonth(),
      subCategory: '',
      keyword: ''
    },
    overview: buildDefaultOverview(lineProjectConfig.getDefaultSettlementMonth()),
    overviewExpandedGroups: {},
    records: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
    showDetail: false,
    detail: null,
    detailExpandedGroups: {}
  },

  onLoad(options = {}) {
    const settlementMonth = lineProjectConfig.decodeQueryValue(options.settlementMonth) || this.data.filters.settlementMonth
    const subCategory = lineProjectConfig.normalizeSubCategory(options.subCategory, lineProjectConfig.CURRENT_SUBCATEGORY)
    this.setData({
      monthPickerValue: lineProjectConfig.toMonthPickerValue(settlementMonth),
      'filters.settlementMonth': settlementMonth,
      'filters.subCategory': subCategory,
      overview: buildDefaultOverview(settlementMonth, subCategory)
    })
  },

  onShow() {
    this.loadOverview()
    this.loadRecords(true)
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

    return user
  },

  async loadOverview() {
    const user = await this.ensureLogin()
    if (!user) {
      return
    }

    try {
      this.setData({ overviewLoading: true })
      const data = await lineProjectService.callLineProject('getMyOverview', {
        filters: {
          settlementMonth: this.data.filters.settlementMonth,
          subCategory: this.data.filters.subCategory
        }
      })
      const category = (data.categories && data.categories[0]) || {}
      const selectedCategory = (data.categories || []).find(item => item.subCategory === this.data.filters.subCategory) || category
      const totalAmount = Number(data.summary && data.summary.totalAmount) || 0
      const baseGroups = this.data.filters.subCategory === lineProjectConfig.CURRENT_SUBCATEGORY
        ? decorateGroupedWorkloads(lineProjectConfig.buildGroupedWorkloadItems(selectedCategory.workloadItems || []), {})
        : []
      const expandedGroups = getDefaultExpandedGroups(baseGroups)
      const groupedWorkloads = decorateGroupedWorkloads(baseGroups, expandedGroups)

      this.setData({
        overviewExpandedGroups: expandedGroups,
        overview: {
          settlementMonth: data.summary ? data.summary.settlementMonth : this.data.filters.settlementMonth,
          subCategory: this.data.filters.subCategory,
          totalAmount,
          totalAmountText: lineProjectConfig.formatMoney(totalAmount),
          totalWorkOrders: Number(data.summary && data.summary.totalWorkOrders) || 0,
          totalRecords: Number(data.summary && data.summary.totalRecords) || 0,
          businessQtyTotal: Number(data.summary && data.summary.businessQtyTotal) || 0,
          groupedWorkloads
        }
      })
    } catch (error) {
      console.error('加载集客线路模块汇总失败:', error)
      wx.showToast({
        title: error.message || '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ overviewLoading: false })
    }
  },

  async loadRecords(reset = true) {
    const user = await this.ensureLogin()
    if (!user) {
      return
    }

    try {
      this.setData({ loading: true })
      const page = reset ? 1 : this.data.page + 1
      const data = await lineProjectService.callLineProject('listMyWorkOrders', {
        page,
        pageSize: this.data.pageSize,
        filters: this.data.filters
      })

      const nextRecords = (data.records || []).map(item => ({
        ...item,
        totalAmountText: lineProjectConfig.formatMoney(item.totalAmount),
        projectTitle: item.workOrderSubject || item.workOrderNameRaw,
        projectCode: item.workOrderCode || '未识别工单号',
        workloadSummaryText: item.workloadSummary || `业务量 ${Number(item.businessQtyTotal || 0)}`
      }))
      const records = reset ? nextRecords : this.data.records.concat(nextRecords)

      this.setData({
        records,
        page,
        total: Number(data.total || 0),
        hasMore: records.length < Number(data.total || 0)
      })
    } catch (error) {
      console.error('加载集客线路项目列表失败:', error)
      wx.showToast({
        title: error.message || '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onMonthChange(e) {
    const settlementMonth = (e.detail.value || '').slice(0, 7)
    this.setData({
      monthPickerValue: e.detail.value,
      'filters.settlementMonth': settlementMonth,
      overview: buildDefaultOverview(settlementMonth, this.data.filters.subCategory)
    })
  },

  onKeywordInput(e) {
    this.setData({
      'filters.keyword': e.detail.value || ''
    })
  },

  applyFilters() {
    this.loadOverview()
    this.loadRecords(true)
  },

  toggleOverviewGroup(e) {
    const groupName = e.currentTarget.dataset.groupName || ''
    if (!groupName) {
      return
    }

    const nextExpandedGroups = {
      ...this.data.overviewExpandedGroups,
      [groupName]: !this.data.overviewExpandedGroups[groupName]
    }

    this.setData({
      overviewExpandedGroups: nextExpandedGroups,
      'overview.groupedWorkloads': decorateGroupedWorkloads(this.data.overview.groupedWorkloads, nextExpandedGroups)
    })
  },

  async openDetail(e) {
    const workOrderKey = e.currentTarget.dataset.workOrderKey
    try {
      wx.showLoading({ title: '加载详情...' })
      const data = await lineProjectService.callLineProject('getMyWorkOrderDetail', {
        workOrderKey,
        filters: {
          settlementMonth: this.data.filters.settlementMonth,
          subCategory: this.data.filters.subCategory
        }
      })
      const opening = data.summary.subCategory === lineProjectConfig.CURRENT_SUBCATEGORY
      const baseDetailGroups = opening
        ? decorateGroupedWorkloads(lineProjectConfig.buildGroupedWorkloadItems(data.workloadItems || []), {})
        : []
      const detailExpandedGroups = getDefaultExpandedGroups(baseDetailGroups)

      this.setData({
        detailExpandedGroups,
        showDetail: true,
        detail: {
          summary: {
            ...data.summary,
            totalAmountText: lineProjectConfig.formatMoney(data.summary.totalAmount)
          },
          groupedWorkloads: opening
            ? decorateGroupedWorkloads(baseDetailGroups, detailExpandedGroups)
            : []
        }
      })
    } catch (error) {
      console.error('加载工单详情失败:', error)
      wx.showToast({
        title: error.message || '加载详情失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  },

  closeDetail() {
    this.setData({
      showDetail: false,
      detail: null,
      detailExpandedGroups: {}
    })
  },

  toggleDetailGroup(e) {
    const groupName = e.currentTarget.dataset.groupName || ''
    if (!groupName || !this.data.detail) {
      return
    }

    const nextExpandedGroups = {
      ...this.data.detailExpandedGroups,
      [groupName]: !this.data.detailExpandedGroups[groupName]
    }

    this.setData({
      detailExpandedGroups: nextExpandedGroups,
      'detail.groupedWorkloads': decorateGroupedWorkloads(this.data.detail.groupedWorkloads, nextExpandedGroups)
    })
  },

  onReachBottom() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadRecords(false)
    }
  }
})
