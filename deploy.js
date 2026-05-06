// 部署脚本说明
console.log('开始部署微信小程序...')

const cloudFunctions = [
  'userManagement',
  'businessData',
  'fileUpload',
  'salaryFeedback'
]

console.log('需要部署的云函数：', cloudFunctions)
console.log('请在微信开发者工具中手动部署这些云函数：')
cloudFunctions.forEach(func => {
  console.log(`- 右键点击 cloudfunctions/${func}/ 文件夹`)
  console.log('- 选择"创建并部署：云端安装依赖"')
})

const collections = [
  {
    name: 'users',
    description: '用户信息表',
    permissions: '仅创建者可读写'
  },
  {
    name: 'business_records',
    description: '业务记录表',
    permissions: '仅创建者可读写'
  },
  {
    name: 'salary_feedbacks',
    description: '薪酬反馈表',
    permissions: '仅创建者可读写'
  },
  {
    name: 'feedback_routes',
    description: '薪酬反馈审批路由表',
    permissions: '仅创建者可读写'
  }
]

console.log('\n需要创建的数据库集合：')
collections.forEach(col => {
  console.log(`- ${col.name}: ${col.description} (${col.permissions})`)
})

console.log('\n部署检查清单：')
console.log('- 云开发环境已创建 (cloud1-1g65i23w93c28d35)')
console.log('- 云函数已部署')
console.log('- 数据库集合已创建')
console.log('- 数据库权限已配置')
console.log('- 小程序已提审')
