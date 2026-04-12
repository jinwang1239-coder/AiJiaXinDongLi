const LOGIN_STATE_KEY = 'xdlLoginState'

function setStoredLoginState(isLoggedIn) {
  try {
    wx.setStorageSync(LOGIN_STATE_KEY, !!isLoggedIn)
  } catch (error) {
    console.error('保存登录状态失败:', error)
  }
}

function getStoredLoginState() {
  try {
    return wx.getStorageSync(LOGIN_STATE_KEY) === true
  } catch (error) {
    console.error('读取登录状态失败:', error)
    return false
  }
}

function syncUserToApp(user) {
  const app = getApp()
  app.setUserProfile(user)

  if (user) {
    setStoredLoginState(true)
  }
}

function getUserProfile() {
  return new Promise((resolve, reject) => {
    wx.getUserProfile({
      desc: '用于完善会员资料',
      success: resolve,
      fail: reject
    })
  })
}

function checkLoginStatus() {
  return new Promise(resolve => {
    wx.checkSession({
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

function getCurrentUserInfo() {
  return wx.cloud.callFunction({
    name: 'userManagement',
    data: {
      action: 'getUserInfo'
    }
  }).then(res => {
    if (!res.result.success) {
      throw new Error(res.result.error || '获取用户信息失败')
    }

    const user = res.result.data
    syncUserToApp(user)
    return user
  })
}

function updateProfile(data) {
  return wx.cloud.callFunction({
    name: 'userManagement',
    data: {
      action: 'updateProfile',
      data
    }
  }).then(res => {
    if (!res.result.success) {
      throw new Error(res.result.error || '更新个人信息失败')
    }

    const user = res.result.data
    syncUserToApp(user)
    return user
  })
}

function getUserRole() {
  return getCurrentUserInfo().catch(err => {
    console.error('获取用户角色失败:', err)
    return null
  })
}

function getCachedUser() {
  const app = getApp()
  if (!app.globalData.hasUserInfo || !app.globalData.openid) {
    return null
  }

  return app.globalData.userProfile || {
    ...app.globalData.userInfo,
    openid: app.globalData.openid,
    role: app.globalData.userRole,
    profileCompleted: app.globalData.profileCompleted
  }
}

function ensureLoggedIn() {
  const cachedUser = getCachedUser()
  if (cachedUser) {
    return Promise.resolve(cachedUser)
  }

  if (!getStoredLoginState()) {
    return Promise.resolve(null)
  }

  return getCurrentUserInfo().catch(err => {
    console.error('恢复登录状态失败:', err)
    logout()
    return null
  })
}

function logout() {
  const app = getApp()
  app.setUserProfile(null)
  setStoredLoginState(false)
}

function login() {
  return new Promise((resolve, reject) => {
    wx.showLoading({
      title: '登录中...'
    })

    getUserProfile()
      .then(userProfile => {
        return wx.cloud.callFunction({
          name: 'userManagement',
          data: {
            action: 'login',
            data: {
              userInfo: userProfile.userInfo
            }
          }
        })
      })
      .then(res => {
        if (!res.result.success) {
          throw new Error(res.result.error || '登录失败')
        }

        const userData = res.result.data.user
        syncUserToApp(userData)
        resolve({
          userInfo: getApp().globalData.userInfo,
          userRole: userData
        })
      })
      .catch(err => {
        console.error('登录失败:', err)
        reject(err)
      })
      .finally(() => {
        wx.hideLoading()
      })
  })
}

module.exports = {
  getUserProfile,
  checkLoginStatus,
  getUserRole,
  getCurrentUserInfo,
  updateProfile,
  ensureLoggedIn,
  logout,
  login
}
