// 简化测试：直接测试云函数调用
// 在小程序控制台中运行此代码

function testCloudFunction() {
  console.log('开始测试云函数调用...')
  
  wx.cloud.callFunction({
    name: 'businessData',
    data: {
      action: 'export',
      filters: {
        startDate: '2025-08-01',
        endDate: '2025-08-15'
      },
      format: 'xlsx'
    }
  }).then(res => {
    console.log('云函数调用成功:', res)
    
    if (res.result && res.result.success) {
      console.log('导出成功，数据长度:', res.result.data.total)
      console.log('base64数据长度:', res.result.data.base64.length)
      
      // 尝试保存文件
      const { base64, filename } = res.result.data
      console.log('文件名:', filename)
      
      try {
        const binaryString = wx.base64ToArrayBuffer(base64)
        console.log('base64转换成功，ArrayBuffer长度:', binaryString.byteLength)
        
        const fs = wx.getFileSystemManager()
        const filePath = `${wx.env.USER_DATA_PATH}/${filename}`
        
        fs.writeFile({
          filePath: filePath,
          data: binaryString,
          success: (writeRes) => {
            console.log('文件保存成功:', filePath)
            
            wx.openDocument({
              filePath: filePath,
              fileType: 'xlsx',
              success: () => {
                console.log('文件打开成功')
              },
              fail: (openErr) => {
                console.log('文件打开失败:', openErr)
              }
            })
          },
          fail: (writeErr) => {
            console.error('文件保存失败:', writeErr)
          }
        })
      } catch (error) {
        console.error('处理文件时出错:', error)
      }
    } else {
      console.error('导出失败:', res.result ? res.result.error : '未知错误')
    }
  }).catch(err => {
    console.error('云函数调用失败:', err)
  })
}

// 调用测试函数
testCloudFunction()
