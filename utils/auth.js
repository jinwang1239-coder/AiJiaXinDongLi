function syncUserToApp(user) {
  const app = getApp()
  app.setUserProfile(user)
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
  login
}
