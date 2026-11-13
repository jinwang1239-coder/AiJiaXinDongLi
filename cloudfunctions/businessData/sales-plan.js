const core = require('./sales-core')

// 只使用有效业务快照里的分期金额，不用当前单价重算历史业务。
module.exports = function buildCommissionPlan(rows, versions, businessMonth, payoutMonth) {
  const versionFor = row => versions.find(version => version.businessMonth === row.businessMonth &&
    version.district === row.district && version.activeBatchId === row.importBatchId)
  const activeRows = rows.filter(versionFor)
  const businessRows = activeRows.filter(row => row.businessMonth === businessMonth)
  const businessVersions = businessRows.map(versionFor)
  const sum = (items, key) => core.money(items.reduce((total, item) => total + Number(item[key] || 0), 0))
  const schedule = (details, month) => [1, 2, 3, 4, 5].map(period => ({
    period: 'T+' + period, settlementMonth: core.addMonth(month, period), amount: Number(details['T' + period] || 0)
  }))
  const products = core.PRODUCT_NAMES.map(businessName => {
    const items = businessRows.flatMap(row => row.items.filter(item => item.businessName === businessName))
    const details = {}
    for (let period = 1; period <= 5; period++) {
      details['T' + period] = core.money(items.reduce((total, item) => total + Number(item.commissionDetails['T' + period] || 0), 0))
    }
    return { businessName, quantity: sum(items, 'quantity'),
      total: core.money(items.reduce((total, item) => total + Number(item.commissionDetails.total || 0), 0)),
      schedule: schedule(details, businessMonth) }
  })
  const businessSchedule = [1, 2, 3, 4, 5].map((period, index) => ({
    period: 'T+' + period, settlementMonth: core.addMonth(businessMonth, period),
    amount: core.money(products.reduce((total, product) => total + product.schedule[index].amount, 0))
  }))
  const groups = new Map(), future = new Map(), receiptVersions = new Map()
  const remember = row => {
    const version = versionFor(row)
    const key = [version.businessMonth, version.district, version.activeBatchId].join('|')
    receiptVersions.set(key, { businessMonth: version.businessMonth, district: version.district, activeBatchId: version.activeBatchId })
  }
  businessRows.forEach(remember)
  activeRows.filter(row => row.businessMonth <= payoutMonth).forEach(row => {
    row.items.filter(item => item.quantity > 0).forEach(item => {
      schedule(item.commissionDetails, row.businessMonth).filter(part => part.amount > 0).forEach(part => {
        if (part.settlementMonth > payoutMonth) {
          future.set(part.settlementMonth, core.money((future.get(part.settlementMonth) || 0) + part.amount))
        }
        if (part.settlementMonth !== payoutMonth) return
        remember(row)
        if (!groups.has(row.businessMonth)) groups.set(row.businessMonth, { businessMonth: row.businessMonth, items: new Map() })
        const group = groups.get(row.businessMonth)
        const unitAmount = core.money(part.amount / item.quantity)
        const key = [item.businessName, part.period, unitAmount].join('|')
        const previous = group.items.get(key) || { key, businessName: item.businessName, period: part.period, unitAmount, quantity: 0, amount: 0 }
        group.items.set(key, { ...previous, quantity: previous.quantity + item.quantity, amount: core.money(previous.amount + part.amount) })
      })
    })
  })
  const payoutGroups = Array.from(groups.values()).sort((a, b) => b.businessMonth.localeCompare(a.businessMonth))
    .map(group => {
      const items = Array.from(group.items.values())
      return { businessMonth: group.businessMonth, items, amount: sum(items, 'amount') }
    })
  const futureMonths = Array.from(future, ([settlementMonth, amount]) => ({ settlementMonth, amount }))
    .sort((a, b) => a.settlementMonth.localeCompare(b.settlementMonth))
  const nextPayoutMonth = core.addMonth(payoutMonth, 1)
  return {
    businessMonth, payoutMonth, payoutGroups, payoutTotal: sum(payoutGroups, 'amount'),
    businessQuantity: sum(products, 'quantity'), businessTotal: sum(products, 'total'),
    businessHasData: businessRows.length > 0,
    businessStatus: businessRows.length ? (businessVersions.every(version => version.finalized) ? '已定版' : '更新中') : '暂无数据',
    businessCutoffDate: businessVersions.map(version => version.cutoffDate || '').sort().pop() || '',
    products, businessSchedule, nextPayoutMonth,
    nextPayoutTotal: future.get(nextPayoutMonth) || 0, futureTotal: sum(futureMonths, 'amount'), futureMonths,
    receipts: Array.from(receiptVersions.values())
  }
}
