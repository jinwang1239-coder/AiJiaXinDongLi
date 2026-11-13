const auth = require('../../utils/auth')
const { callSales, currentMonth, formatCommissionPlan, renderSalesData } = require('../../utils/sales-service')
const money = value => Number(value || 0).toFixed(2)

Page({
  data: { businessMonth: currentMonth(), payoutMonth: currentMonth(), district: '', districtIndex: 0,
    summary: null, commissionPlan: null, expandedProduct: '', loading: false, error: '', receiptWarning: '' },
  onShow() {
    const app = getApp()
    const query = app.globalData.salesSummaryQuery
    if (query) {
      delete app.globalData.salesSummaryQuery
      const validMonth = month => /^20\d{2}-(0[1-9]|1[0-2])$/.test(month || '')
      this.setData({ businessMonth: validMonth(query.businessMonth) ? query.businessMonth : currentMonth(),
        payoutMonth: validMonth(query.payoutMonth) ? query.payoutMonth : currentMonth(), district: '', districtIndex: 0, expandedProduct: '' })
      this.pendingSection = query.section === 'business-detail' ? 'business-detail' : ''
    }
    this.visible = true
    this.loadData()
  },
  onHide() { this.visible = false; this.requestId = (this.requestId || 0) + 1 },
  onUnload() { this.onHide() },
  onMonthChange(e) { this.setData({ businessMonth: e.detail.value, expandedProduct: '' }); this.loadData() },
  onPayoutMonthChange(e) { this.setData({ payoutMonth: e.detail.value }); this.loadData() },
  onFutureMonthTap(e) {
    wx.navigateTo({ url: '/pages/summary/payout?payoutMonth=' + encodeURIComponent(e.currentTarget.dataset.month) })
  },
  toggleProduct(e) {
    const name = e.currentTarget.dataset.name
    this.setData({ expandedProduct: this.data.expandedProduct === name ? '' : name })
  },
  onDistrictChange(e) {
    const index = Number(e.detail.value)
    this.setData({ district: index ? this.data.summary.districtOptions[index - 1] : '', districtIndex: index })
    this.loadData()
  },
  onPullDownRefresh() { this.loadData() },
  async loadData() {
    if (!this.visible) return
    const requestId = this.requestId = (this.requestId || 0) + 1
    const current = () => this.visible && this.requestId === requestId
    const query = { businessMonth: this.data.businessMonth, payoutMonth: this.data.payoutMonth, district: this.data.district }
    this.setData({ loading: true, summary: null, commissionPlan: null, error: '', receiptWarning: '' })
    try {
      if (!await auth.ensureLoggedIn()) {
        if (current()) wx.switchTab({ url: '/pages/login/login' })
        return
      }
      const result = await callSales('getSummary', query)
      if (!current()) return
      const cutoffDates = result.cutoffDates || []
      const dataDateText = cutoffDates.length > 1
        ? '各区县截至' + cutoffDates[0] + '～' + cutoffDates[cutoffDates.length - 1]
        : cutoffDates.length ? '截至' + cutoffDates[0] : result.hasData ? '未设置统计截止日期' : '暂无导入数据'
      const summary = { ...result, dataDateText, nextAmount: money(result.nextAmount), deferredAmount: money(result.deferredAmount),
        products: result.products.map(item => ({ ...item, nextAmount: money(item.nextAmount), deferredAmount: money(item.deferredAmount) })),
        districtPickerOptions: ['全部区县', ...result.districtOptions] }
      const commissionPlan = result.commissionPlan ? formatCommissionPlan(result.commissionPlan) : null
      await renderSalesData(this, { summary, commissionPlan, loading: false },
        commissionPlan ? commissionPlan.receipts.filter(receipt => receipt.businessMonth === query.businessMonth)
          : result.receipt ? [result.receipt] : [], current)
      if (current() && this.pendingSection && commissionPlan) {
        const selector = '#' + this.pendingSection
        this.pendingSection = ''
        wx.pageScrollTo({ selector, duration: 200 })
      }
    } catch (error) {
      if (current()) this.setData({ error: error.message || '汇总加载失败，请重试' })
    } finally {
      if (current()) { this.setData({ loading: false }); wx.stopPullDownRefresh() }
    }
  }
})
