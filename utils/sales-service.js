const callSales = async (action, data = {}) => {
  let response
  try {
    response = await wx.cloud.callFunction({ name: 'businessData', data: { action, data } })
  } catch (error) {
    if (Number(error.errCode) === -504003 || /-504003|FUNCTIONS_TIME_LIMIT_EXCEEDED|Invoking task timed out/i.test(error.errMsg || error.message || '')) {
      const timeout = new Error('业务云函数执行超时。请在云开发控制台将 businessData 的执行超时时间设为至少60秒。' +
        (action === 'importCommit' ? '本次发布结果尚未确认，请先刷新最近导入批次，再重新预览，勿连续重复提交。' : '调整后重新操作。'))
      timeout.code = 'SALES_FUNCTION_TIMEOUT'
      throw timeout
    }
    throw error
  }
  if (!response.result || response.result.apiVersion !== 'sales-monthly-v2') {
    throw new Error('销售接口版本不一致，请在当前云环境重新部署 businessData 云函数（上传并部署：云端安装依赖），再重新编译小程序。')
  }
  if (!response.result.success) throw new Error(response.result.error || '销售数据请求失败')
  const result = response.result.data
  if (action === 'getSummary' && (!result || !Array.isArray(result.products) || !Array.isArray(result.districtOptions))) {
    throw new Error('业务汇总返回格式异常，请重新部署 businessData 云函数。')
  }
  if (['list', 'getStats', 'getImportBatches'].includes(action) &&
      (!result || !Array.isArray(result.records) || !Array.isArray(result.versions) ||
      (action !== 'getImportBatches' && (!result.stats || typeof result.stats !== 'object')))) {
    throw new Error('销售接口返回格式异常，请检查当前云环境并重新部署 businessData 云函数。')
  }
  return result
}
const currentMonth = () => {
  const now = new Date()
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
}
async function renderSalesData(page, patch, receipts = [], isCurrent = () => true) {
  if (!isCurrent()) return
  await new Promise(resolve => page.setData(patch, resolve))
  if (!isCurrent()) return
  try { await Promise.all(receipts.map(receipt => callSales('recordReceipt', receipt))) } catch (error) {
    if (isCurrent()) page.setData({ receiptWarning: '查看记录未保存，请刷新重试：' + error.message })
  }
}
async function exportSales(filters) {
  const result = await callSales('export', { filters })
  await require('./export').saveExcelFile(result.base64, result.filename)
}
module.exports = { callSales, currentMonth, renderSalesData, exportSales }
