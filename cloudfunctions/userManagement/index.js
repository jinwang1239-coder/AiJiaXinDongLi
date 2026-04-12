const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event) => {
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

async function login(wxContext, data) {
  const { userInfo } = data
  const openid = wxContext.OPENID
  const userQuery = await db.collection('users').where({ openid }).get()

  let user
  if (userQuery.data.length === 0) {
    const newUser = {
      openid,
      nickName: userInfo.nickName,
      avatarUrl: userInfo.avatarUrl,
      role: 'sales_person',
      status: 'active',
      district: '',
      gridName: '',
      realName: '',
      gridAccount: '',
      profileCompleted: false,
      profileCompletedTime: null,
      createTime: new Date(),
      updateTime: new Date()
    }

    const createResult = await db.collection('users').add({
      data: newUser
    })

    user = {
      _id: createResult._id,
      ...newUser
    }
  } else {
    const currentUser = userQuery.data[0]
    const now = new Date()
    const normalizedUser = normalizeUser({
      ...currentUser,
      nickName: userInfo.nickName,
      avatarUrl: userInfo.avatarUrl
    })
    const updateData = {
      nickName: userInfo.nickName,
      avatarUrl: userInfo.avatarUrl,
      updateTime: now
    }

    if (normalizedUser.profileCompleted && !currentUser.profileCompleted) {
      updateData.profileCompleted = true
      updateData.profileCompletedTime = currentUser.profileCompletedTime || now
    }

    await db.collection('users').doc(currentUser._id).update({
      data: updateData
    })

    user = {
      ...currentUser,
      ...updateData
    }
  }

  return {
    success: true,
    data: {
      user: normalizeUser(user),
      isNewUser: userQuery.data.length === 0
    }
  }
}

async function updateProfile(wxContext, data = {}) {
  const openid = wxContext.OPENID
  const profileData = {
    realName: (data.realName || '').trim(),
    gridAccount: (data.gridAccount || '').trim(),
    district: (data.district || '').trim(),
    gridName: (data.gridName || '').trim()
  }
  const profileCompleted = isProfileCompleted(profileData)

  if (!profileCompleted) {
    return {
      success: false,
      error: '请完整填写姓名、网格通账号、区县和所属网格'
    }
  }

  const userQuery = await db.collection('users').where({ openid }).get()
  const now = new Date()

  if (userQuery.data.length === 0) {
    const newUser = {
      openid,
      nickName: '',
      avatarUrl: '',
      role: 'sales_person',
      status: 'active',
      ...profileData,
      profileCompleted: true,
      profileCompletedTime: now,
      createTime: now,
      updateTime: now
    }

    const createResult = await db.collection('users').add({
      data: newUser
    })

    return {
      success: true,
      data: normalizeUser({
        _id: createResult._id,
        ...newUser
      })
    }
  }

  const currentUser = userQuery.data[0]
  const updateData = {
    ...profileData,
    profileCompleted: true,
    profileCompletedTime: currentUser.profileCompletedTime || now,
    updateTime: now
  }

  const updateResult = await db.collection('users').doc(currentUser._id).update({
    data: updateData
  })

  const updatedCount = updateResult && (
    updateResult.updated !== undefined
      ? updateResult.updated
      : updateResult.stats && updateResult.stats.updated
  )

  if (updatedCount === 0) {
    throw new Error('个人信息保存失败，请稍后重试')
  }

  return {
    success: true,
    data: normalizeUser({
      ...currentUser,
      ...updateData
    })
  }
}

async function getUserInfo(wxContext) {
  const openid = wxContext.OPENID
  const result = await db.collection('users').where({ openid }).get()

  if (result.data.length === 0) {
    return {
      success: false,
      error: '用户不存在'
    }
  }

  return {
    success: true,
    data: normalizeUser(result.data[0])
  }
}

async function getUsersByRole(wxContext, data) {
  const openid = wxContext.OPENID
  const { role } = data
  const currentUser = await db.collection('users').where({ openid }).get()

  if (currentUser.data.length === 0 || !['district_manager', 'sales_department'].includes(currentUser.data[0].role)) {
    return {
      success: false,
      error: '权限不足'
    }
  }

  let query = db.collection('users')
  if (role) {
    query = query.where({ role })
  }

  const result = await query.get()
  return {
    success: true,
    data: result.data.map(normalizeUser)
  }
}

function normalizeUser(user) {
  const profileCompleted = !!user.profileCompleted || isProfileCompleted(user)

  return {
    ...user,
    district: user.district || '',
    gridName: user.gridName || '',
    realName: user.realName || '',
    gridAccount: user.gridAccount || '',
    profileCompleted,
    profileCompletedTime: user.profileCompletedTime || null
  }
}

function isProfileCompleted(user) {
  return !!(
    (user.realName || '').trim() &&
    (user.gridAccount || '').trim() &&
    (user.district || '').trim() &&
    (user.gridName || '').trim()
  )
}

