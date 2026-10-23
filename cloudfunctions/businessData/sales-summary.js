const core = require('./sales-core')
const RECEIPTS = 'sales_data_receipts'

module.exports = (db, { all, optionalDoc, activeRows, versionId }) => {
  const percentage = (received, expected) => expected ? (received * 100 / expected).toFixed(1) + '%' : '—'

  async function participation(rows, versions, businessMonth, district) {
    const receipts = []
    const batchIds = [...new Set(versions.map(version => version.activeBatchId))]
    for (let offset = 0; offset < batchIds.length; offset += 20) {
      receipts.push(...await all(db.collection(RECEIPTS).where({
        businessMonth, activeBatchId: db.command.in(batchIds.slice(offset, offset + 20))
      })))
    }
    // 换绑后，旧微信的查看不能代表新绑定人员已查看。
    const bindings = new Map(rows.length
      ? (await all(db.collection('sales_employees'))).map(binding => [binding.employeeId, binding.userOpenid]) : [])
    const managers = await all(db.collection('users').where({ role: db.command.in(['district_manager', 'sales_department', 'system_admin']) }))
    const managementIds = new Set(managers.filter(user => user.employeeId &&
      (!bindings.has(user.employeeId) || bindings.get(user.employeeId) === user.openid)).map(user => user.employeeId))
    const districts = (district ? [district] : core.DISTRICTS).map(name => {
      const version = versions.find(item => item.district === name)
      const expectedIds = new Set(rows.filter(row => row.district === name && !managementIds.has(row.employeeId)).map(row => row.employeeId))
      const receivedIds = new Set(receipts.filter(receipt => version && receipt.district === name &&
        receipt.activeBatchId === version.activeBatchId && expectedIds.has(receipt.employeeId) &&
        bindings.get(receipt.employeeId) === receipt.userOpenid).map(receipt => receipt.employeeId))
      return { district: name, expected: expectedIds.size, received: receivedIds.size,
        pending: expectedIds.size - receivedIds.size, rate: percentage(receivedIds.size, expectedIds.size) }
    })
    const expected = districts.reduce((sum, item) => sum + item.expected, 0)
    const received = districts.reduce((sum, item) => sum + item.received, 0)
    return { districts, expected, received, pending: expected - received, rate: percentage(received, expected) }
  }

  async function getSummary(user, data) {
    const businessMonth = String(data.businessMonth || core.monthNow())
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(businessMonth)) throw new Error('请选择有效业务月份')
    const district = String(data.district || '')
    if (district && !core.DISTRICTS.includes(district)) throw new Error('区县无效')
    const active = await activeRows(user, false, businessMonth)
    const rows = active.rows.filter(row => !district || row.district === district)
    const versions = active.versions.filter(version => (!district || version.district === district) &&
      (user.role !== 'sales_person' || rows.some(row => row.importBatchId === version.activeBatchId && row.district === version.district)))
    const products = core.PRODUCT_NAMES.map(businessName => {
      const items = rows.flatMap(row => row.items.filter(item => item.businessName === businessName))
      const sum = key => core.money(items.reduce((total, item) => total + Number(item.commissionDetails[key] || 0), 0))
      return { businessName, quantity: items.reduce((total, item) => total + item.quantity, 0),
        nextAmount: sum('T1'), deferredAmount: sum('T2') }
    })
    const canFilterDistrict = ['sales_department', 'system_admin'].includes(user.role)
    const result = {
      businessMonth, nextMonth: core.addMonth(businessMonth, 1), deferredMonth: core.addMonth(businessMonth, 2),
      scopeLabel: user.role === 'sales_person' ? '个人' : user.role === 'district_manager'
        ? user.salesManagedDistrict || '未配置管理区县' : district || '全市',
      canFilterDistrict, districtOptions: canFilterDistrict ? core.DISTRICTS : [],
      hasData: rows.length > 0, products,
      totalQuantity: products.reduce((sum, item) => sum + item.quantity, 0),
      nextAmount: core.money(products.reduce((sum, item) => sum + item.nextAmount, 0)),
      deferredAmount: core.money(products.reduce((sum, item) => sum + item.deferredAmount, 0)),
      receipt: null, participation: null
    }
    if (user.role === 'sales_person' && versions.length) {
      result.receipt = { businessMonth, district: versions[0].district, activeBatchId: versions[0].activeBatchId }
    }
    if (user.role !== 'sales_person') result.participation = await participation(rows, versions, businessMonth,
      user.role === 'district_manager' ? user.salesManagedDistrict : district)
    return result
  }

  async function recordReceipt(user, data) {
    if (user.role !== 'sales_person' || !user.employeeId) throw new Error('仅已认领员工可记录本人查看情况')
    const { businessMonth, district, activeBatchId } = data
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(businessMonth || '')) ||
        !core.DISTRICTS.includes(district) || typeof activeBatchId !== 'string' || !activeBatchId) {
      throw new Error('查看版本无效，请刷新业务汇总')
    }
    await db.runTransaction(async transaction => {
      const freshUser = (await transaction.collection('users').doc(user._id).get()).data
      if (freshUser.status === 'inactive' || freshUser.role !== 'sales_person' || freshUser.workspaceType !== 'sales' ||
          freshUser.employeeId !== user.employeeId) throw new Error('账号或认领关系已变更，请重新登录')
      const binding = await optionalDoc('sales_employees', core.hash(user.employeeId), transaction)
      if (!binding || binding.userOpenid !== user.openid) throw new Error('员工认领关系已变更，请重新登录')
      const version = await optionalDoc('sales_active_versions', versionId(businessMonth, district), transaction)
      if (!version || version.activeBatchId !== activeBatchId) throw new Error('数据已更新，请刷新后查看最新版本')
      const row = await optionalDoc('sales_month_records', core.hash(activeBatchId + '|' + user.employeeId), transaction)
      if (!row || row.businessMonth !== businessMonth || row.district !== district) throw new Error('当前版本没有本人员工数据')
      const id = core.hash([businessMonth, district, activeBatchId, user.employeeId].join('|'))
      const previous = await optionalDoc(RECEIPTS, id, transaction)
      if (!previous || previous.userOpenid !== user.openid) {
        await transaction.collection(RECEIPTS).doc(id).set({ data: {
          businessMonth, district, activeBatchId, employeeId: user.employeeId, userOpenid: user.openid, viewedAt: new Date()
        } })
      }
    })
    return { recorded: true }
  }

  return { getSummary, recordReceipt }
}
