// utils/auth.js - 用户认证工具函数

/**
 * 微信登录
 */
function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: res => {
        if (res.code) {
          resolve(res.code)
        } else {
          reject('登录失败：' + res.errMsg)
        }
      },
      fail: reject
    })
  })
}

/**
 * 获取用户信息
 */
function getUserProfile() {
  return new Promise((resolve, reject) => {
    wx.getUserProfile({
      desc: '用于完善会员资料',
      success: resolve,
      fail: reject
    })
  })
}

/**
 * 检查用户登录状态
 */
function checkLoginStatus() {
  return new Promise((resolve, reject) => {
    wx.checkSession({
      success: () => {
        // session_key 未过期，并且在本生命周期一直有效
        resolve(true)
      },
      fail: () => {
        // session_key 已经失效，需要重新执行登录流程
        resolve(false)
      }
    })
  })
}

/**
 * 保存用户信息到云数据库
 */
function saveUserInfo(userInfo, openid) {
  const db = wx.cloud.database()
  return db.collection('users').where({
    openid: openid
  }).get().then(res => {
    if (res.data.length === 0) {
      // 新用户，插入数据
      return db.collection('users').add({
        data: {
          openid: openid,
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          role: 'sales_person', // 默认角色为销售师傅
          district: '',
          createTime: new Date(),
          updateTime: new Date()
        }
      })
    } else {
      // 老用户，更新信息
      return db.collection('users').doc(res.data[0]._id).update({
        data: {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          updateTime: new Date()
        }
      })
    }
  })
}

/**
 * 获取用户角色信息
 */
function getUserRole(openid) {
  return wx.cloud.callFunction({
    name: 'userManagement',
    data: {
      action: 'getUserInfo'
    }
  }).then(res => {
    if (res.result.success) {
      return res.result.data
    } else {
      return null
    }
  }).catch(err => {
    console.error('获取用户角色失败:', err)
    return null
  })
}

/**
 * 完整的登录流程
 */
function login() {
  return new Promise((resolve, reject) => {
    wx.showLoading({
      title: '登录中...'
    })
      getUserProfile()
      .then(userProfile => {
        // 调用云函数登录
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
        if (res.result.success) {
          const app = getApp()
          const userData = res.result.data.user
          app.globalData.userInfo = {
            nickName: userData.nickName,
            avatarUrl: userData.avatarUrl
          }
          app.globalData.hasUserInfo = true
          app.globalData.openid = userData.openid
          
          // 直接使用返回的用户数据
          return userData
        } else {
          throw new Error(res.result.error || '登录失败')
        }
      })      .then(userData => {
        if (userData) {
          const app = getApp()
          app.setUserRole(userData.role)
          resolve({
            userInfo: app.globalData.userInfo,
            userRole: userData
          })
        } else {
          throw new Error('获取用户信息失败')
        }
      })
      .catch(err => {
        console.error('登录失败：', err)
        reject(err)
      })
      .finally(() => {
        wx.hideLoading()
      })
  })
}

module.exports = {
  wxLogin,
  getUserProfile,
  checkLoginStatus,
  saveUserInfo,
  getUserRole,
  login
}
