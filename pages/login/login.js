// pages/login/login.js
const auth = require('../../utils/auth')
const commission = require('../../utils/commission')

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    userRole: null,
    roleText: '',
    stats: {
      totalRecords: 0,
      totalCommission: 0,
      todayRecords: 0,
      todayCommission: 0,
      monthRecords: 0,
      monthCommission: 0
    },
    loading: false
  },

  onLoad() {
    this.checkLoginStatus()
  },

  onShow() {
    if (this.data.hasUserInfo) {
      this.loadUserStats()
    }
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus() {
    const app = getApp()
    if (app.globalData.hasUserInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true,
        userRole: app.globalData.userRole
      })
      this.updateRoleText()
      this.loadUserStats()
    }
  },

  /**
   * 微信授权登录
   */
  async onLogin() {
    try {
      this.setData({ loading: true })
      
      const result = await auth.login()
      
      this.setData({
        userInfo: result.userInfo,
        hasUserInfo: true,
        userRole: result.userRole.role,
        loading: false
      })
      // 同步 userRole 到全局
      const app = getApp();
      app.globalData.userRole = result.userRole.role;
      
      this.updateRoleText()
      this.loadUserStats()
      
      wx.showToast({
        title: '登录成功',
        icon: 'success'
      })
    } catch (error) {
      console.error('登录失败：', error)
      this.setData({ loading: false })
      wx.showToast({
        title: '登录失败',
        icon: 'error'
      })
    }
  },

  /**
   * 更新角色文本
   */
  updateRoleText() {
    const roleMap = {
      'sales_person': '销售师傅',
      'district_manager': '区县主管',
      'sales_department': '销售业务部'
    }
    this.setData({
      roleText: roleMap[this.data.userRole] || '未知角色'
    })
  },

  /**
   * 加载用户统计数据
   */
  async loadUserStats() {
    try {
      const app = getApp()
      const db = wx.cloud.database()
      let query = db.collection('business_records')

      // 根据用户角色查询数据
      if (this.data.userRole === 'sales_person') {
        // 销售师傅只能看自己的数据
        const openid = app.globalData.openid
        query = query.where({
          userId: openid
        })      } else if (this.data.userRole === 'district_manager') {
        // 区县主管看所属区县数据
        const userInfo = await auth.getUserRole()
        if (userInfo && userInfo.district) {
          query = query.where({
            district: userInfo.district
          })
        }
      }
      // 销售业务部可以看全部数据，不需要额外条件

      const res = await query.get()
      const records = res.data
      const stats = commission.calculateStats(records)

      this.setData({ stats })
    } catch (error) {
      console.error('加载统计数据失败：', error)
    }
  },

  /**
   * 退出登录
   */
  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          const app = getApp()
          app.globalData.userInfo = null
          app.globalData.hasUserInfo = false
          app.globalData.userRole = null
          
          this.setData({
            userInfo: null,
            hasUserInfo: false,
            userRole: null,
            roleText: '',
            stats: {
              totalRecords: 0,
              totalCommission: 0,
              todayRecords: 0,
              todayCommission: 0,
              monthRecords: 0,
              monthCommission: 0
            }
          })
          
          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          })
        }
      }
    })
  },

  /**
   * 跳转到信息收集页面
   */
  goToCollect() {
    if (!this.data.hasUserInfo) {
      wx.showToast({
        title: '请先登录',
        icon: 'error'
      })
      return
    }
    wx.switchTab({
      url: '/pages/collect/collect'
    })
  },

  /**
   * 跳转到数据管理页面
   */
  goToManage() {
    if (!this.data.hasUserInfo) {
      wx.showToast({
        title: '请先登录',
        icon: 'error'
      })
      return
    }
    wx.switchTab({
      url: '/pages/manage/manage'
    })
  },

  /**
   * 查看个人详细统计
   */
  viewDetailStats() {
    if (!this.data.hasUserInfo) {
      wx.showToast({
        title: '请先登录',
        icon: 'error'
      })
      return
    }
    
    // 这里可以跳转到详细统计页面
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    })
  }
})
