// app.js
App({
  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-1g65i23w93c28d35', // 使用您提供的云开发环境ID
        traceUser: true,
      })
    }
    
    // 获取用户信息
    this.globalData = {
      userInfo: null,
      userRole: null,
      hasUserInfo: false
    }
  },

  getUserInfo() {
    return new Promise((resolve, reject) => {
      if (this.globalData.userInfo) {
        resolve(this.globalData.userInfo)
      } else {
        // 获取用户信息
        wx.getSetting({
          success: res => {
            if (res.authSetting['scope.userInfo']) {
              wx.getUserInfo({
                success: res => {
                  this.globalData.userInfo = res.userInfo
                  this.globalData.hasUserInfo = true
                  resolve(res.userInfo)
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
  }
})
