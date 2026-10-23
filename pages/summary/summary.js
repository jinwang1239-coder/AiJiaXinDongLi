const auth = require('../../utils/auth')
const { callSales, currentMonth, renderSalesData } = require('../../utils/sales-service')
const money = value => Number(value || 0).toFixed(2)

Page({
  data: { businessMonth: currentMonth(), district: '', districtIndex: 0, summary: null, loading: false, error: '', receiptWarning: '' },
  onShow() { this.visible = true; this.loadData() },
  onHide() { this.visible = false; this.requestId = (this.requestId || 0) + 1 },
  onUnload() { this.onHide() },
  onMonthChange(e) { this.setData({ businessMonth: e.detail.value }); this.loadData() },
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
    const query = { businessMonth: this.data.businessMonth, district: this.data.district }
    this.setData({ loading: true, summary: null, error: '', receiptWarning: '' })
    try {
      if (!await auth.ensureLoggedIn()) {
        if (current()) wx.switchTab({ url: '/pages/login/login' })
        return
      }
      const result = await callSales('getSummary', query)
      if (!current()) return
      const summary = { ...result, nextAmount: money(result.nextAmount), deferredAmount: money(result.deferredAmount),
        products: result.products.map(item => ({ ...item, nextAmount: money(item.nextAmount), deferredAmount: money(item.deferredAmount) })),
        districtPickerOptions: ['全部区县', ...result.districtOptions] }
      await renderSalesData(this, { summary }, result.receipt ? [result.receipt] : [], current)
    } catch (error) {
      if (current()) this.setData({ error: error.message || '汇总加载失败，请重试' })
    } finally {
      if (current()) { this.setData({ loading: false }); wx.stopPullDownRefresh() }
    }
  }
})
