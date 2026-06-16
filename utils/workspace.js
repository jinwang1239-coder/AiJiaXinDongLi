const WORKSPACE_TYPES = {
  SALES: 'sales',
  LINE_PROJECT: 'line_project'
}

const PREFERRED_WORKSPACE_KEY = 'preferredWorkspaceType'

const SALES_ROLE_TEXT = {
  sales_person: '销售师傅',
  district_manager: '区县主管',
  sales_department: '销售业务部'
}

const LINE_PROJECT_ROLE_TEXT = {
  sales_person: '集客装维人员',
  district_manager: '集客线路区县主管',
  sales_department: '集客线路管理员'
}

function normalizeWorkspaceType(workspaceType) {
  return workspaceType === WORKSPACE_TYPES.LINE_PROJECT
    ? WORKSPACE_TYPES.LINE_PROJECT
    : WORKSPACE_TYPES.SALES
}

function getWorkspaceType(input) {
  if (input && typeof input === 'object') {
    return normalizeWorkspaceType(input.workspaceType)
  }
  return normalizeWorkspaceType(input)
}

function isSalesWorkspace(input) {
  return getWorkspaceType(input) === WORKSPACE_TYPES.SALES
}

function isLineProjectWorkspace(input) {
  return getWorkspaceType(input) === WORKSPACE_TYPES.LINE_PROJECT
}

function getWorkspaceLabel(input) {
  return isLineProjectWorkspace(input) ? '集客线路项目' : '销售业务'
}

function getWorkspaceHomeUrl(input) {
  return isLineProjectWorkspace(input)
    ? '/pages/line-project/index'
    : '/pages/login/login'
}

function getRoleText(user = {}) {
  const roleMap = isLineProjectWorkspace(user) ? LINE_PROJECT_ROLE_TEXT : SALES_ROLE_TEXT
  return roleMap[user.role] || (isLineProjectWorkspace(user) ? '集客线路项目人员' : '未知角色')
}

function relaunchWorkspaceHome(input) {
  return new Promise((resolve, reject) => {
    wx.reLaunch({
      url: getWorkspaceHomeUrl(input),
      success: resolve,
      fail: reject
    })
  })
}

function denyWorkspaceAccess(user, expectedWorkspaceType, message) {
  const fallbackMessage = expectedWorkspaceType === WORKSPACE_TYPES.LINE_PROJECT
    ? '当前账号仅可使用销售界面'
    : '当前账号仅可使用集客线路项目界面'

  wx.showToast({
    title: message || fallbackMessage,
    icon: 'none',
    duration: 2000
  })

  setTimeout(() => {
    relaunchWorkspaceHome(user).catch(error => {
      console.error('workspace redirect failed:', error)
    })
  }, 250)
}

function getPreferredWorkspaceType() {
  try {
    const storedValue = wx.getStorageSync(PREFERRED_WORKSPACE_KEY)
    return normalizeWorkspaceType(storedValue)
  } catch (error) {
    console.error('read preferred workspace failed:', error)
    return WORKSPACE_TYPES.SALES
  }
}

function setPreferredWorkspaceType(workspaceType) {
  try {
    wx.setStorageSync(PREFERRED_WORKSPACE_KEY, normalizeWorkspaceType(workspaceType))
  } catch (error) {
    console.error('save preferred workspace failed:', error)
  }
}

module.exports = {
  WORKSPACE_TYPES,
  normalizeWorkspaceType,
  getWorkspaceType,
  isSalesWorkspace,
  isLineProjectWorkspace,
  getWorkspaceLabel,
  getWorkspaceHomeUrl,
  getRoleText,
  relaunchWorkspaceHome,
  denyWorkspaceAccess,
  getPreferredWorkspaceType,
  setPreferredWorkspaceType
}
