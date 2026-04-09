/**
 * 测试数据生成脚本
 * 在微信开发者工具的云开发控制台中执行此脚本来生成测试数据
 */

// 生成测试用户数据
const testUsers = [
  {
    openid: "test_sales_001",
    nickName: "张三",
    avatarUrl: "https://thirdwx.qlogo.cn/mmopen/test1.jpg",
    role: "sales_person",
    status: "active",
    phone: "13800138001",
    department: "销售一部",
    createTime: new Date(),
    updateTime: new Date()
  },
  {
    openid: "test_sales_002",
    nickName: "李四",
    avatarUrl: "https://thirdwx.qlogo.cn/mmopen/test2.jpg",
    role: "sales_person",
    status: "active",
    phone: "13800138002",
    department: "销售二部",
    createTime: new Date(),
    updateTime: new Date()
  },
  {
    openid: "test_manager_001",
    nickName: "王经理",
    avatarUrl: "https://thirdwx.qlogo.cn/mmopen/test3.jpg",
    role: "district_manager",
    status: "active",
    phone: "13800138003",
    department: "片区管理部",
    createTime: new Date(),
    updateTime: new Date()
  },
  {
    openid: "test_admin_001",
    nickName: "销售总监",
    avatarUrl: "https://thirdwx.qlogo.cn/mmopen/test4.jpg",
    role: "sales_department",
    status: "active",
    phone: "13800138004",
    department: "销售总部",
    createTime: new Date(),
    updateTime: new Date()
  }
]

// 生成测试业务记录
const testBusinessRecords = [
  {
    businessName: "张氏餐厅",
    businessType: "FTTR_50M",
    contactPerson: "张老板",
    contactPhone: "13900139001",
    address: "北京市朝阳区XX街道XX号",
    bandwidth: 50,
    monthlyFee: 299,
    commission: 600,
    images: [],
    notes: "客户对网络稳定性要求较高",
    submittedBy: {
      openid: "test_sales_001",
      userId: "test_user_001",
      name: "张三",
      role: "sales_person"
    },
    status: "approved",
    createTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1天前
    updateTime: new Date()
  },
  {
    businessName: "李记服装店",
    businessType: "FTTR_100M",
    contactPerson: "李经理",
    contactPhone: "13900139002",
    address: "上海市浦东新区XX路XX号",
    bandwidth: 100,
    monthlyFee: 499,
    commission: 1000,
    images: [],
    notes: "需要支持多个收银终端",
    submittedBy: {
      openid: "test_sales_002",
      userId: "test_user_002",
      name: "李四",
      role: "sales_person"
    },
    status: "pending",
    createTime: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12小时前
    updateTime: new Date()
  },
  {
    businessName: "王氏便利店",
    businessType: "FTTR_200M",
    contactPerson: "王店长",
    contactPhone: "13900139003",
    address: "广州市天河区XX大道XX号",
    bandwidth: 200,
    monthlyFee: 799,
    commission: 1600,
    images: [],
    notes: "24小时营业，网络稳定性要求极高",
    submittedBy: {
      openid: "test_sales_001",
      userId: "test_user_001",
      name: "张三",
      role: "sales_person"
    },
    status: "approved",
    createTime: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2天前
    updateTime: new Date()
  },
  {
    businessName: "陈氏美容院",
    businessType: "FTTR_100M",
    contactPerson: "陈总",
    contactPhone: "13900139004",
    address: "深圳市南山区XX街XX号",
    bandwidth: 100,
    monthlyFee: 499,
    commission: 1000,
    images: [],
    notes: "客户较多，需要稳定的wifi覆盖",
    submittedBy: {
      openid: "test_sales_002",
      userId: "test_user_002",
      name: "李四",
      role: "sales_person"
    },
    status: "rejected",
    reviewNotes: "地址信息不完整，请补充详细地址",
    createTime: new Date(Date.now() - 72 * 60 * 60 * 1000), // 3天前
    updateTime: new Date()
  },
  {
    businessName: "刘氏药店",
    businessType: "FTTR_50M",
    contactPerson: "刘药师",
    contactPhone: "13900139005",
    address: "成都市锦江区XX路XX号",
    bandwidth: 50,
    monthlyFee: 299,
    commission: 600,
    images: [],
    notes: "医保系统对网络延迟敏感",
    submittedBy: {
      openid: "test_sales_001",
      userId: "test_user_001",
      name: "张三",
      role: "sales_person"
    },
    status: "pending",
    createTime: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6小时前
    updateTime: new Date()
  }
]

// 执行数据插入
async function insertTestData() {
  try {
    // 插入测试用户
    console.log('插入测试用户数据...')
    for (const user of testUsers) {
      const existingUser = await db.collection('users').where({
        openid: user.openid
      }).get()
      
      if (existingUser.data.length === 0) {
        await db.collection('users').add({
          data: user
        })
        console.log(`插入用户: ${user.nickName}`)
      } else {
        console.log(`用户已存在: ${user.nickName}`)
      }
    }
    
    // 插入测试业务记录
    console.log('插入测试业务记录...')
    for (const record of testBusinessRecords) {
      await db.collection('business_records').add({
        data: record
      })
      console.log(`插入业务记录: ${record.businessName}`)
    }
    
    console.log('测试数据插入完成！')
    
    // 显示统计信息
    const userCount = await db.collection('users').count()
    const recordCount = await db.collection('business_records').count()
    
    console.log(`总用户数: ${userCount.total}`)
    console.log(`总业务记录数: ${recordCount.total}`)
    
  } catch (error) {
    console.error('插入测试数据失败:', error)
  }
}

// 清理测试数据的函数
async function clearTestData() {
  try {
    console.log('清理测试数据...')
    
    // 删除测试用户
    const testOpenids = testUsers.map(user => user.openid)
    for (const openid of testOpenids) {
      await db.collection('users').where({
        openid: openid
      }).remove()
    }
    
    // 删除测试业务记录
    await db.collection('business_records').where({
      'submittedBy.openid': db.command.in(testOpenids)
    }).remove()
    
    console.log('测试数据清理完成！')
  } catch (error) {
    console.error('清理测试数据失败:', error)
  }
}

// 执行插入测试数据
insertTestData()

// 如果需要清理测试数据，取消下面这行的注释
// clearTestData()
