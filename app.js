App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-1g65i23w93c28d35',
        traceUser: true
      })
    }

    this.globalData = {
      userInfo: null,
      userRole: null,
      hasUserInfo: false,
      openid: '',
      profileCompleted: false,
      userProfile: null
    }
  },

  getUserInfo() {
    return new Promise((resolve, reject) => {
      if (this.globalData.userInfo) {
        resolve(this.globalData.userInfo)
      } else {
        wx.getSetting({
          success: res => {
            if (res.authSetting['scope.userInfo']) {
              wx.getUserInfo({
                success: response => {
                  this.globalData.userInfo = response.userInfo
                  this.globalData.hasUserInfo = true
                  resolve(response.userInfo)
                },
                fail: reject
              })
            } else {
              reject('用户未授权')
            }
          },
          fail: reject
        })
      }
    })
  },

  setUserRole(role) {
    this.globalData.userRole = role
  },

  getUserRole() {
    return this.globalData.userRole
  },

  setUserProfile(user) {
    if (!user) {
      this.globalData.userInfo = null
      this.globalData.userRole = null
      this.globalData.hasUserInfo = false
      this.globalData.openid = ''
      this.globalData.profileCompleted = false
      this.globalData.userProfile = null
      return
    }

    const profileCompleted = !!user.profileCompleted || !!(
      (user.realName || '').trim() &&
      (user.gridAccount || '').trim() &&
      (user.district || '').trim() &&
      (user.gridName || '').trim()
    )

    this.globalData.userInfo = {
      nickName: user.nickName || '',
      avatarUrl: user.avatarUrl || ''
    }
    this.globalData.userRole = user.role || null
    this.globalData.hasUserInfo = true
    this.globalData.openid = user.openid || ''
    this.globalData.profileCompleted = profileCompleted
    this.globalData.userProfile = {
      ...user,
      profileCompleted
    }
  }
})
