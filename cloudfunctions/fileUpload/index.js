// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化 cloud
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, data } = event
  try {
    switch (action) {
      case 'getUploadUrl':
        return await getUploadUrl(wxContext, data)
      case 'deleteFile':
        return await deleteFile(wxContext, data)
      case 'getFileList':
        return await getFileList(wxContext, data)
      case 'test':
        return { success: true, message: 'fileUpload 云函数正常运行' }
      default:
        return {
          success: false,
          error: '未知操作'
        }
    }
  } catch (error) {
    console.error('文件上传云函数错误:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// 获取上传URL
async function getUploadUrl(wxContext, data) {
  const { fileName, fileType } = data
  const openid = wxContext.OPENID
  
  // 生成唯一文件名
  const timestamp = new Date().getTime()
  const randomStr = Math.random().toString(36).substring(2)
  const cloudPath = `business-images/${openid}/${timestamp}_${randomStr}_${fileName}`
  
  try {
    // 获取上传URL
    const result = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: data.fileContent // 这个在实际使用中会是文件内容
    })
    
    return {
      success: true,
      data: {
        fileID: result.fileID,
        cloudPath: cloudPath
      }
    }
  } catch (error) {
    return {
      success: false,
      error: '获取上传URL失败: ' + error.message
    }
  }
}

// 删除文件
async function deleteFile(wxContext, data) {
  const { fileID } = data
  
  try {
    const result = await cloud.deleteFile({
      fileList: [fileID]
    })
    
    return {
      success: true,
      data: result
    }
  } catch (error) {
    return {
      success: false,
      error: '删除文件失败: ' + error.message
    }
  }
}

// 获取文件列表
async function getFileList(wxContext, data) {
  const { prefix } = data
  const openid = wxContext.OPENID
  
  try {
    // 这里可以根据需要实现文件列表获取逻辑
    // 由于云开发的限制，可能需要通过数据库记录文件信息
    
    return {
      success: true,
      data: {
        fileList: []
      }
    }
  } catch (error) {
    return {
      success: false,
      error: '获取文件列表失败: ' + error.message
    }
  }
}
