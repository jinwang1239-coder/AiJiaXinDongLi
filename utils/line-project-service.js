const exportUtil = require('./export')

function callLineProject(action, data = {}) {
  return wx.cloud.callFunction({
    name: 'lineProjectData',
    data: {
      action,
      data
    }
  }).then(res => {
    if (!res.result || !res.result.success) {
      throw new Error((res.result && res.result.error) || '集客线路项目请求失败')
    }
    return res.result.data || {}
  })
}

async function exportLineProject(viewType, filters = {}) {
  const data = await callLineProject('export', {
    viewType,
    filters
  })
  await exportUtil.saveExcelFile(data.base64, data.filename)
  return data
}

module.exports = {
  callLineProject,
  exportLineProject
}
