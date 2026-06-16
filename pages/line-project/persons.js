const lineProjectConfig = require('../../utils/line-project-config')

Page({
  onLoad(options = {}) {
    const settlementMonth = options.settlementMonth || lineProjectConfig.getDefaultSettlementMonth()
    wx.redirectTo({
      url: `/pages/line-project/workorders?${lineProjectConfig.buildQueryString({
        settlementMonth
      })}`
    })
  }
})
