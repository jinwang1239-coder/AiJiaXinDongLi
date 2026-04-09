// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化 cloud
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV // 使用当前云环境
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, data } = event
  try {
    switch (action) {
      case 'login':
        return await login(wxContext, data)
      case 'updateProfile':
        return await updateProfile(wxContext, data)
      case 'getUserInfo':
        return await getUserInfo(wxContext)
      case 'getUsersByRole':
        return await getUsersByRole(wxContext, data)
      case 'test':
        return { success: true, message: 'userManagement 云函数正常运行' }
      default:
        return {
          success: false,
          error: '未知操作'
        }
    }
  } catch (error) {
    console.error('云函数执行错误:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// 用户登录
async function login(wxContext, data) {
  const { userInfo } = data
  const openid = wxContext.OPENID
  
  // 查询用户是否已存在
  const userQuery = await db.collection('users').where({
    openid: openid
  }).get()
  
  let user
  if (userQuery.data.length === 0) {
    // 新用户，创建记录
    const createResult = await db.collection('users').add({
      data: {
        openid: openid,
        ...userInfo,
        role: 'sales_person', // 默认角色
        status: 'active',
        createTime: new Date(),
        updateTime: new Date()
      }
    })
    
    user = {
      _id: createResult._id,
      openid: openid,
      ...userInfo,
      role: 'sales_person',
      status: 'active'
    }
  } else {
    // 更新用户信息
    user = userQuery.data[0]
    await db.collection('users').doc(user._id).update({
      data: {
        ...userInfo,
        updateTime: new Date()
      }
    })
    
    user = { ...user, ...userInfo }
  }
  
  return {
    success: true,
    data: {
      user: user,
      isNewUser: userQuery.data.length === 0
    }
  }
}

// 更新用户资料
async function updateProfile(wxContext, data) {
  const openid = wxContext.OPENID
  
  const result = await db.collection('users').where({
    openid: openid
  }).update({
    data: {
      ...data,
      updateTime: new Date()
    }
  })
  
  return {
    success: true,
    data: result
  }
}

// 获取用户信息
async function getUserInfo(wxContext) {
  const openid = wxContext.OPENID
  
  const result = await db.collection('users').where({
    openid: openid
  }).get()
  
  if (result.data.length === 0) {
    return {
      success: false,
      error: '用户不存在'
    }
  }
  
  return {
    success: true,
    data: result.data[0]
  }
}

// 根据角色获取用户列表（仅管理员权限）
async function getUsersByRole(wxContext, data) {
  const openid = wxContext.OPENID
  const { role } = data
  
  // 验证权限
  const currentUser = await db.collection('users').where({
    openid: openid
  }).get()
  
  if (currentUser.data.length === 0 || !['district_manager', 'sales_department'].includes(currentUser.data[0].role)) {
    return {
      success: false,
      error: '权限不足'
    }
  }
  
  const query = db.collection('users')
  if (role) {
    query.where({
      role: role
    })
  }
  
  const result = await query.get()
  
  return {
    success: true,
    data: result.data
  }
}
