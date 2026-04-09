// 测试Excel导出功能
// 可以在小程序中运行此代码来测试

// 测试数据
const testData = [
  {
    date: new Date('2025-08-15'),
    userId: 'test_user_1',
    district: '监利',
    businessName: '中小企业千里眼10元/月',
    userPhone: '13963524198',
    developer: '孙杨',
    commission: 18.00,
    createTime: new Date('2025-08-15 12:23:24')
  },
  {
    date: new Date('2025-08-14'),
    userId: 'test_user_1',
    district: '监利',
    businessName: '湖北移动看家小福袋组网版(25元/月)【2025】',
    userPhone: '13963524198',
    developer: '孙杨',
    commission: 47.00,
    createTime: new Date('2025-08-14 16:37:15')
  }
]

// 测试云函数调用
function testExportFunction() {
  wx.cloud.callFunction({
    name: 'businessData',
    data: {
      action: 'export',
      filters: {},
      format: 'xlsx'
    }
  }).then(res => {
    console.log('云函数调用成功:', res)
    
    if (res.result.success) {
      const { base64, filename } = res.result.data
      console.log('获取到Excel文件:', filename)
      console.log('Base64长度:', base64.length)
      
      // 测试保存文件
      testSaveFile(base64, filename)
    } else {
      console.error('导出失败:', res.result.error)
    }
  }).catch(err => {
    console.error('云函数调用失败:', err)
  })
}

// 测试文件保存
function testSaveFile(base64String, filename) {
  try {
    const binaryString = wx.base64ToArrayBuffer(base64String)
    const fs = wx.getFileSystemManager()
    const filePath = `${wx.env.USER_DATA_PATH}/${filename}`
    
    fs.writeFile({
      filePath: filePath,
      data: binaryString,
      success: (res) => {
        console.log('文件保存成功:', filePath)
        
        // 尝试打开文件
        wx.openDocument({
          filePath: filePath,
          fileType: 'xlsx',
          success: () => {
            console.log('文件打开成功')
          },
          fail: (err) => {
            console.log('文件打开失败:', err)
          }
        })
      },
      fail: (err) => {
        console.error('文件保存失败:', err)
      }
    })
  } catch (error) {
    console.error('处理失败:', error)
  }
}

// 在管理页面中调用此函数进行测试
// testExportFunction()

export { testExportFunction, testSaveFile }
