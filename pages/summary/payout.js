const auth = require('../../utils/auth')
const { callSales, currentMonth, formatCommissionPlan, renderSalesData } = require('../../utils/sales-service')

Page({
  data: { payoutMonth: currentMonth(), detail: null, loading: false, error: '', receiptWarning: '' },
  onLoad(options = {}) {
    if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(options.payoutMonth || '')) {
      this.setData({ payoutMonth: options.payoutMonth })
    }
  },
  onShow() { this.visible = true; return this.loadData() },
  onHide() { this.visible = false; this.requestId = (this.requestId || 0) + 1 },
  onUnload() { this.onHide() },
  onBack() {
    if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1 })
    else wx.switchTab({ url: '/pages/login/login' })
  },
  onMonthChange(e) { this.setData({ payoutMonth: e.detail.value }); return this.loadData() },
  onPullDownRefresh() { return this.loadData() },
  async loadData() {
    if (!this.visible) return
    const requestId = this.requestId = (this.requestId || 0) + 1
    const current = () => this.visible && this.requestId === requestId
    const payoutMonth = this.data.payoutMonth
    this.setData({ loading: true, detail: null, error: '', receiptWarning: '' })
    try {
      if (!await auth.ensureLoggedIn()) {
        if (current()) wx.switchTab({ url: '/pages/login/login' })
        return
      }
      const result = await callSales('getSummary', { businessMonth: payoutMonth, payoutMonth })
      if (!current()) return
      if (!result.commissionPlan) throw new Error('当前账号无法查看个人核发组成')
      const plan = formatCommissionPlan(result.commissionPlan)
      const receipts = plan.receipts.filter(receipt => plan.payoutGroups.some(group => group.businessMonth === receipt.businessMonth))
      await renderSalesData(this, { detail: { payoutTotal: plan.payoutTotal, payoutGroups: plan.payoutGroups }, loading: false }, receipts, current)
    } catch (error) {
      if (current()) this.setData({ error: error.message || '核发组成加载失败，请重试' })
    } finally {
      if (current()) { this.setData({ loading: false }); wx.stopPullDownRefresh() }
    }
  }
})
