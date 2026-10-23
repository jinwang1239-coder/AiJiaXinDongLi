const crypto = require('crypto')
module.exports = (db, all) => async (user, businessMonth) => {
  if (user.workspaceType !== 'sales' || user.role !== 'sales_person' || !user.employeeId) throw new Error('仅已认领员工可提交个人酬金反馈')
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(businessMonth || ''))) throw new Error('业务月份无效')
  let binding
  try { binding = (await db.collection('sales_employees').doc(crypto.createHash('sha256').update(user.employeeId).digest('hex')).get()).data } catch (error) {
    if (!/document.*(?:not exist|not found)|DOCUMENT_NOT_FOUND/i.test(error.message)) throw error
  }
  if (!binding || binding.userOpenid !== user.openid) throw new Error('请先认领员工编号')
  const versions = await all(db.collection('sales_active_versions').where({ businessMonth }))
  const records = await all(db.collection('sales_month_records').where({ employeeId: user.employeeId, businessMonth }))
  const active = records.filter(row => versions.some(version => version.activeBatchId === row.importBatchId && version.district === row.district))
  if (active.length !== 1) throw new Error('该业务月份暂无唯一有效的本人数据，请联系市场营销部')
  const row = active[0]
  return { businessMonth, batchId: row.importBatchId, salaryAmount: row.commission,
    realName: row.realName, district: row.district, gridName: row.gridName, employeeId: row.employeeId }
}
