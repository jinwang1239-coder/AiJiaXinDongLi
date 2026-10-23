// 销售与集客共用的Excel保存功能。
async function saveExcelFile(base64, filename) {
  const safeName = String(filename || '业务数据.xlsx').replace(/[\\/:*?"<>|]/g, '_')
  const filePath = wx.env.USER_DATA_PATH + '/' + Date.now() + '_' + safeName
  await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({
    filePath, data: base64, encoding: 'base64', success: resolve, fail: reject
  }))
  await new Promise((resolve, reject) => wx.openDocument({
    filePath, fileType: 'xlsx', showMenu: true, success: resolve, fail: reject
  }))
  return { success: true, filePath }
}
module.exports = { saveExcelFile }
