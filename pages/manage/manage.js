const auth = require('../../utils/auth')
const { callSales, exportSales, currentMonth, renderSalesData } = require('../../utils/sales-service')
const products = require('../../utils/product-config')
const initialFilters = () => ({ businessMonth: currentMonth(), district: '', businessName: '', developer: '' })
Page({
  data: {
    records: [], stats: {}, loading: false, page: 1, hasMore: false,
    filters: initialFilters(), appliedFilters: null, referenceMonth: '', error: '', receiptWarning: '',
    businessTypes: ['全部业务', ...products.getProducts().map(item => item.name)], districts: ['全部区县'],
    showDetail: false, detail: null
  },
  onShow() { this.visible = true; this.loadData() },
  onHide() { this.visible = false; this.requestId = (this.requestId || 0) + 1 },
  onUnload() { this.onHide() },
  async loadData(append = false, filters = this.data.filters) {
    if (!this.visible || append && this.data.loading) return
    const requestId = this.requestId = (this.requestId || 0) + 1
    const current = () => this.visible && this.requestId === requestId
    const query = { ...filters }
    this.setData({ loading: true, error: '', receiptWarning: '' })
    if (!append) this.setData({ records: [], hasMore: false, showDetail: false, detail: null })
    try {
      if (!await auth.ensureLoggedIn()) { if (current()) wx.switchTab({ url: '/pages/login/login' }); return }
      const page = append ? this.data.page + 1 : 1
      const result = await callSales('list', { page, pageSize: 30, filters: query })
      if (!current()) return
      const records = append ? this.data.records.concat(result.records) : result.records
      const stats = { ...result.stats }
      for (const key of ['totalCommission', 'settledCommission', 'unsettledCommission']) stats[key] = Number(stats[key] || 0).toFixed(2)
      await renderSalesData(this, { records, stats, page, appliedFilters: query,
        referenceMonth: result.referenceMonth, hasMore: records.length < result.total,
        districts: ['全部区县', ...result.filterOptions.districts] }, result.receipts || [], current)
    } catch (error) {
      if (current()) this.setData({ records: [], stats: {}, hasMore: false, appliedFilters: null, error: error.message || '加载失败，请重试' })
    } finally { if (current()) { this.setData({ loading: false }); wx.stopPullDownRefresh() } }
  },
  onMonthChange(e) { this.setData({ 'filters.businessMonth': e.detail.value }); this.loadData() },
  onBusinessChange(e) { this.setData({ 'filters.businessName': Number(e.detail.value) ? this.data.businessTypes[Number(e.detail.value)] : '' }); this.loadData() },
  onDistrictChange(e) { this.setData({ 'filters.district': Number(e.detail.value) ? this.data.districts[Number(e.detail.value)] : '' }); this.loadData() },
  onSearchInput(e) { this.setData({ 'filters.developer': e.detail.value }) },
  search() { this.loadData() },
  resetFilter() { this.setData({ filters: initialFilters() }); this.loadData() },
  showAllMonths() { this.setData({ 'filters.businessMonth': '' }); this.loadData() },
  onReachBottom() { if (this.data.hasMore && this.data.appliedFilters) this.loadData(true, this.data.appliedFilters) },
  onPullDownRefresh() { this.loadData() },
  openDetail(e) { this.setData({ detail: this.data.records[e.currentTarget.dataset.index], showDetail: true }) },
  closeDetail() { this.setData({ showDetail: false }) },
  stopTap() {},
  async exportData() {
    if (!this.data.appliedFilters || this.data.loading) return
    try { wx.showLoading({ title: '导出中' }); await exportSales(this.data.appliedFilters) } catch (error) {
      wx.showToast({ title: error.message || '导出失败', icon: 'none' })
    } finally { wx.hideLoading() }
  }
})
