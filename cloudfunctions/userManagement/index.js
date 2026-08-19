const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const WORKSPACE_TYPES = {
  SALES: 'sales',
  LINE_PROJECT: 'line_project'
}
const SYSTEM_ADMIN_ROLE = 'system_admin'
const MAX_QUERY_LIMIT = 100

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
      workspaceType: WORKSPACE_TYPES.SALES,
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
    if (currentUser.status === 'inactive') {
      throw new Error('当前账号已停用')
    }
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

    if (currentUser.workspaceType && currentUser.workspaceType !== normalizedUser.workspaceType) {
      updateData.workspaceType = normalizedUser.workspaceType
    }

    if (currentUser.role !== normalizedUser.role) {
      updateData.role = normalizedUser.role
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

  const duplicateAccountQuery = await db.collection('users').where({
    gridAccount: profileData.gridAccount
  }).limit(2).get()
  const duplicateAccount = duplicateAccountQuery.data.find(user => user.openid !== openid)

  if (duplicateAccount) {
    return {
      success: false,
      error: '该网格通账号已被其他用户使用'
    }
  }

  const userQuery = await db.collection('users').where({ openid }).get()
  const now = new Date()
  const currentUser = userQuery.data[0] || {}
  if (currentUser.gridAccount && currentUser.gridAccount !== profileData.gridAccount) {
    const boundRecords = await getBoundLineProjectRecords(openid)
    if (boundRecords.length) {
      throw new Error('当前账号已认领集客线路数据，不能自行修改网格通账号，请联系管理员处理')
    }
  }
  const pendingClaimRecords = await getPendingLineProjectRecords(profileData.gridAccount)
  validatePendingClaimIdentity(pendingClaimRecords, profileData)
  const lineProjectAccess = await resolveLineProjectAccess({
    ...currentUser,
    ...profileData,
    hasLineProjectData: pendingClaimRecords.length > 0 || currentUser.workspaceType === WORKSPACE_TYPES.LINE_PROJECT
  })

  if (userQuery.data.length === 0) {
    const newUser = {
      openid,
      nickName: '',
      avatarUrl: '',
      role: getUserRole(profileData),
      workspaceType: lineProjectAccess.workspaceType,
      lineProjectRoles: lineProjectAccess.lineProjectRoles,
      managedDistricts: lineProjectAccess.managedDistricts,
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
    const claimedRecords = await claimLineProjectRecords(pendingClaimRecords, {
      _id: createResult._id,
      ...newUser
    }, now)

    return {
      success: true,
      data: normalizeUser({
        _id: createResult._id,
        ...newUser,
        lineProjectClaimedRecords: claimedRecords
      })
    }
  }

  const updateData = {
    ...profileData,
    role: getUserRole({
      ...currentUser,
      ...profileData
    }),
    workspaceType: lineProjectAccess.workspaceType,
    lineProjectRoles: lineProjectAccess.lineProjectRoles,
    managedDistricts: lineProjectAccess.managedDistricts,
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
  const claimedRecords = await claimLineProjectRecords(pendingClaimRecords, {
    ...currentUser,
    ...updateData
  }, now)

  return {
    success: true,
    data: normalizeUser({
      ...currentUser,
      ...updateData,
      lineProjectClaimedRecords: claimedRecords
    })
  }
}

async function fetchAllRecords(query) {
  const records = []
  let offset = 0
  while (true) {
    const result = await query.skip(offset).limit(MAX_QUERY_LIMIT).get()
    const page = result.data || []
    records.push(...page)
    if (page.length < MAX_QUERY_LIMIT) return records
    offset += page.length
  }
}

async function getPendingLineProjectRecords(gridAccount) {
  try {
    const records = await fetchAllRecords(db.collection('line_project_records').where({ gridAccount }))
    const versions = await getActiveVersionMap()
    return records.filter(record => record.bindingStatus === 'pending_claim' && (
      versions[record.settlementMonth]
        ? record.importBatchId === versions[record.settlementMonth]
        : !['superseded', 'rolled_back', 'staged', 'versioned'].includes(record.publishStatus)
    ))
  } catch (error) {
    if (isCollectionNotFoundError(error)) return []
    throw error
  }
}

async function getBoundLineProjectRecords(openid) {
  try {
    const records = await fetchAllRecords(db.collection('line_project_records').where({ userOpenid: openid }))
    const versions = await getActiveVersionMap()
    return records.filter(record => record.bindingStatus === 'bound' && (
      versions[record.settlementMonth]
        ? record.importBatchId === versions[record.settlementMonth]
        : !['superseded', 'rolled_back', 'staged', 'versioned'].includes(record.publishStatus)
    )).slice(0, 1)
  } catch (error) {
    if (isCollectionNotFoundError(error)) return []
    throw error
  }
}

async function getActiveVersionMap() {
  try {
    const versions = await fetchAllRecords(db.collection('line_project_active_versions'))
    return versions.reduce((map, version) => {
      if (version.settlementMonth && version.activeBatchNo) map[version.settlementMonth] = version.activeBatchNo
      return map
    }, {})
  } catch (error) {
    if (isCollectionNotFoundError(error)) return {}
    throw error
  }
}

function validatePendingClaimIdentity(records = [], profile = {}) {
  if (!records.length) return
  const names = [...new Set(records.map(record => String(record.personName || '').trim()).filter(Boolean))]
  const districts = [...new Set(records.map(record => String(record.district || '').trim()).filter(Boolean))]
  if (names.length !== 1 || names[0] !== profile.realName) {
    throw new Error(`该网格通账号的待认领数据姓名为${names.join('、') || '空'}，与当前填写姓名不一致`)
  }
  if (districts.length !== 1 || districts[0] !== profile.district) {
    throw new Error(`该网格通账号的待认领数据区县为${districts.join('、') || '空'}，与当前选择区县不一致`)
  }
}

async function claimLineProjectRecords(records = [], user = {}, now = new Date()) {
  for (const record of records) {
    await db.collection('line_project_records').doc(record._id).update({
      data: {
        userOpenid: user.openid,
        boundUserId: user._id || '',
        bindingStatus: 'bound',
        bindingSource: 'auto_profile',
        boundTime: now,
        updateTime: now
      }
    })
  }
  return records.length
}

async function resolveLineProjectAccess(user = {}) {
  const gridAccount = String(user.gridAccount || '').trim()
  const roles = new Set()
  const managedDistricts = new Set()

  if (user.role === 'district_manager' && user.district) {
    roles.add('district_manager')
    managedDistricts.add(user.district)
  }

  if (gridAccount) {
    try {
      const [supervisorResult, managerResult, leaderResult] = await Promise.all([
        db.collection('feedback_routes').where({
          'supervisor.gridAccount': gridAccount
        }).get(),
        db.collection('feedback_routes').where({
          'districtManager.gridAccount': gridAccount
        }).get(),
        db.collection('feedback_routes').where({
          'districtLeader.gridAccount': gridAccount
        }).get()
      ])

      ;(supervisorResult.data || [])
        .filter(route => (
          route.status !== 'inactive' &&
          route.district === user.district &&
          (!route.supervisor.name || String(route.supervisor.name).trim() === String(user.realName || '').trim())
        ))
        .forEach(route => {
          roles.add('district_supervisor')
          if (route.district) managedDistricts.add(route.district)
        })
      ;(managerResult.data || [])
        .filter(route => (
          route.status !== 'inactive' &&
          route.district === user.district &&
          (!route.districtManager.name || String(route.districtManager.name).trim() === String(user.realName || '').trim())
        ))
        .forEach(route => {
          roles.add('district_manager')
          if (route.district) managedDistricts.add(route.district)
        })
      ;(leaderResult.data || [])
        .filter(route => (
          route.status !== 'inactive' &&
          route.district === user.district &&
          (!route.districtLeader.name || String(route.districtLeader.name).trim() === String(user.realName || '').trim())
        ))
        .forEach(route => {
          roles.add('district_leader')
          if (route.district) managedDistricts.add(route.district)
        })
    } catch (error) {
      if (!isCollectionNotFoundError(error)) throw error
    }
  }

  const isAdmin = getUserRole(user) === SYSTEM_ADMIN_ROLE
  return {
    workspaceType: isAdmin || roles.size > 0 || user.hasLineProjectData
      ? WORKSPACE_TYPES.LINE_PROJECT
      : normalizeWorkspaceType(user.workspaceType),
    lineProjectRoles: [...roles],
    managedDistricts: [...managedDistricts].sort()
  }
}

function isCollectionNotFoundError(error) {
  const message = String((error && error.message) || error || '')
  return (
    message.includes('database collection not exists') ||
    message.includes('Db or Table not exist') ||
    message.includes('ResourceNotFound')
  )
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

  if (currentUser.data.length === 0 || !['district_manager', 'sales_department', SYSTEM_ADMIN_ROLE].includes(normalizeUser(currentUser.data[0]).role)) {
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
  const role = getUserRole(user)
  const workspaceType = role === SYSTEM_ADMIN_ROLE
    ? WORKSPACE_TYPES.LINE_PROJECT
    : normalizeWorkspaceType(user.workspaceType)

  return {
    ...user,
    role,
    workspaceType,
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

function normalizeWorkspaceType(workspaceType) {
  return workspaceType === WORKSPACE_TYPES.LINE_PROJECT
    ? WORKSPACE_TYPES.LINE_PROJECT
    : WORKSPACE_TYPES.SALES
}

function getUserRole(user = {}) {
  return user.role || 'sales_person'
}

module.exports.__test__ = {
  validatePendingClaimIdentity,
  claimLineProjectRecords
}

