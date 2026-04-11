// pages/manage/manage.js
const exportUtil = require('../../utils/export')
const commission = require('../../utils/commission')

Page({
  data: {
    // 用户信息
    userRole: null,
    userDistrict: '',
    
    // 业务数据
    businessRecords: [],
    filteredRecords: [],
    
    // 统计信息
    stats: {
      totalRecords: 0,
      totalCommission: 0,
      todayRecords: 0,
      todayCommission: 0
    },
    
    // 筛选条件
    filters: {
      dateStart: '',
      dateEnd: '',
      district: '',
      businessName: '',
      developer: '',
      commissionMin: '',
      commissionMax: ''
    },
    
    // 界面状态
    loading: false,
    showFilter: false,
    showExportModal: false,
    
    // 分页
    pageSize: 20,
    currentPage: 1,
    hasMore: true,
    
    // 筛选选项
    districts: [],
    businessTypes: [],
    developers: []
  },

  onLoad() {
    this.initData()
  },

  onShow() {
    const app = getApp();
    this.setData({
      userRole: app.getUserRole()
    });
    this.checkLoginStatus();
    this.loadData();
  },

  /**
   * 格式化日期
   */
  formatDate(dateInput) {
    if (!dateInput) return ''
    
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
    if (isNaN(date.getTime())) return ''
    
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  /**
   * 格式化日期时间
   */
  formatDateTime(dateInput) {
    if (!dateInput) return ''
    
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
    if (isNaN(date.getTime())) return ''
    
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
  },

  /**
   * 初始化数据
   */
  initData() {
    const app = getApp()
    const userRole = app.getUserRole()
    
    this.setData({
      userRole,
      businessTypes: commission.getBusinessTypes()
    })
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus() {
    const app = getApp()
    if (!app.globalData.hasUserInfo) {
      wx.showModal({
        title: '请先登录',
        content: '使用此功能需要先登录',
        showCancel: false,
        success: () => {
          wx.switchTab({
            url: '/pages/login/login'
          })
        }
      })
      return false
    }

    if (!app.globalData.profileCompleted) {
      wx.showModal({
        title: '请先完善个人信息',
        content: '首次登录后需先补充姓名、网格通账号和所属网格。',
        showCancel: false,
        success: () => {
          wx.switchTab({
            url: '/pages/login/login'
          })
        }
      })
      return false
    }

    return true
  },

  /**
   * 加载数据
   */
  async loadData(reset = true) {
    if (!this.checkLoginStatus()) {
      return
    }

    try {
      this.setData({ loading: true })
      
      const app = getApp()
      const db = wx.cloud.database()
      const { userRole } = this.data
      
      // 构建查询条件
      let query = db.collection('business_records')
      let whereCondition = {}
      
      // 根据用户角色限制数据范围
      if (userRole === 'sales_person') {
        whereCondition.userId = app.globalData.openid
      } else if (userRole === 'district_manager') {
        // 获取用户的管辖区县
        const userInfo = await this.getUserInfo()
        if (userInfo && userInfo.district) {
          whereCondition.district = userInfo.district
          this.setData({ userDistrict: userInfo.district })
        }
      }
      
      // 应用筛选条件
      const activeFilters = this.buildLocalFilterCondition()
      whereCondition = { ...whereCondition, ...activeFilters }
      
      if (Object.keys(whereCondition).length > 0) {
        query = query.where(whereCondition)
      }
      
      // 分页查询
      const skip = reset ? 0 : (this.data.currentPage - 1) * this.data.pageSize
      const res = await query
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(this.data.pageSize)
        .get()
      
      const newRecords = res.data
      
      // 格式化记录中的日期
      const formattedNewRecords = newRecords.map(record => ({
        ...record,
        date: this.formatDate(record.date),
        createTime: this.formatDateTime(record.createTime)
      }))
      
      const businessRecords = reset ? formattedNewRecords : [...this.data.businessRecords, ...formattedNewRecords]
      
      // 计算统计信息
      const stats = commission.calculateStats(businessRecords)
      
      // 提取筛选选项
      this.extractFilterOptions(businessRecords)
      
      this.setData({
        businessRecords,
        filteredRecords: businessRecords,
        stats,
        currentPage: reset ? 1 : this.data.currentPage + 1,
        hasMore: newRecords.length >= this.data.pageSize
      })
      
    } catch (error) {
      console.error('加载数据失败：', error)
      wx.showToast({
        title: '加载数据失败',
        icon: 'error'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 获取用户信息
   */
  async getUserInfo() {
    const app = getApp()
    const db = wx.cloud.database()
    
    try {
      const res = await db.collection('users').where({
        openid: app.globalData.openid
      }).get()
      
      return res.data.length > 0 ? res.data[0] : null
    } catch (error) {
      console.error('获取用户信息失败：', error)
      return null
    }
  },

  /**
   * 构建筛选条件（用于导出）
   */
  buildFilterCondition() {
    // 安全检查，防止 this.data 或 filters 不存在
    if (!this.data || !this.data.filters) {
      return {}
    }
    
    const { filters } = this.data
    const condition = {}
    
    // 日期范围筛选
    if (filters.dateStart) {
      condition.startDate = filters.dateStart
    }
    if (filters.dateEnd) {
      condition.endDate = filters.dateEnd
    }
    
    // 其他筛选条件
    if (filters.district) {
      condition.district = filters.district
    }
    
    if (filters.businessName) {
      condition.businessName = filters.businessName
    }
    
    if (filters.developer) {
      condition.developer = filters.developer
    }
    
    // 酬金范围筛选
    if (filters.commissionMin) {
      condition.commissionMin = Number(filters.commissionMin)
    }
    if (filters.commissionMax) {
      condition.commissionMax = Number(filters.commissionMax)
    }
    
    return condition
  },

  /**
   * 构建本地筛选条件（用于数据库查询）
   */
  buildLocalFilterCondition() {
    const { filters } = this.data
    const db = wx.cloud.database()
    const condition = {}
    
    // 日期范围筛选
    if (filters.dateStart && filters.dateEnd) {
      condition.date = db.command.and([
        db.command.gte(new Date(filters.dateStart)),
        db.command.lte(new Date(filters.dateEnd))
      ])
    } else if (filters.dateStart) {
      condition.date = db.command.gte(new Date(filters.dateStart))
    } else if (filters.dateEnd) {
      condition.date = db.command.lte(new Date(filters.dateEnd))
    }
    
    // 其他筛选条件
    if (filters.district) {
      condition.district = filters.district
    }
    
    if (filters.businessName) {
      condition.businessName = db.command.eq(filters.businessName)
    }
    
    if (filters.developer) {
      condition.developer = filters.developer
    }
    
    // 酬金范围筛选
    if (filters.commissionMin && filters.commissionMax) {
      condition.commission = db.command.and([
        db.command.gte(Number(filters.commissionMin)),
        db.command.lte(Number(filters.commissionMax))
      ])
    } else if (filters.commissionMin) {
      condition.commission = db.command.gte(Number(filters.commissionMin))
    } else if (filters.commissionMax) {
      condition.commission = db.command.lte(Number(filters.commissionMax))
    }
    
    return condition
  },

  /**
   * 提取筛选选项
   */
  extractFilterOptions(records) {
    const districts = [...new Set(records.map(r => r.district))].filter(Boolean)
    const developers = [...new Set(records.map(r => r.developer))].filter(Boolean)
    
    this.setData({
      districts,
      developers
    })
  },

  /**
   * 显示/隐藏筛选面板
   */
  toggleFilter() {
    this.setData({
      showFilter: !this.data.showFilter
    })
  },

  /**
   * 筛选条件输入
   */
  onFilterChange(e) {
    const { field } = e.currentTarget.dataset
    const { value } = e.detail
    
    this.setData({
      [`filters.${field}`]: value
    })
  },

  /**
   * 日期筛选
   */
  onFilterDateChange(e) {
    const { field } = e.currentTarget.dataset
    const { value } = e.detail
    
    this.setData({
      [`filters.${field}`]: value
    })
  },

  /**
   * 选择器筛选
   */
  onFilterPickerChange(e) {
    const { field, options } = e.currentTarget.dataset
    const { value } = e.detail
    const selectedValue = options[value]
    
    this.setData({
      [`filters.${field}`]: selectedValue
    })
  },

  /**
   * 应用筛选
   */
  applyFilter() {
    this.setData({
      showFilter: false,
      currentPage: 1
    })
    this.loadData(true)
  },

  /**
   * 重置筛选
   */
  resetFilter() {
    this.setData({
      filters: {
        dateStart: '',
        dateEnd: '',
        district: '',
        businessName: '',
        developer: '',
        commissionMin: '',
        commissionMax: ''
      }
    })
  },

  /**
   * 查看记录详情
   */
  viewRecord(e) {
    const { index } = e.currentTarget.dataset
    const record = this.data.businessRecords[index]
    
    wx.showModal({
      title: '业务详情',
      content: `日期：${record.date}
区县：${record.district}
业务：${record.businessName}
号码：${record.userPhone}
发展人员：${record.developer}
酬金：¥${record.commission}
创建时间：${record.createTime}`,
      showCancel: false,
      confirmText: '关闭'
    })
  },

  /**
   * 预览图片
   */
  previewImages(e) {
    const { index } = e.currentTarget.dataset
    const record = this.data.businessRecords[index]
    
    if (record.attachments && record.attachments.length > 0) {
      wx.previewImage({
        urls: record.attachments,
        current: record.attachments[0]
      })
    } else {
      wx.showToast({
        title: '该记录无图片',
        icon: 'none'
      })
    }
  },

  /**
   * 显示导出选项
   */
  showExportOptions() {
    this.setData({
      showExportModal: true
    })
  },

  /**
   * 隐藏导出选项
   */
  hideExportModal() {
    this.setData({
      showExportModal: false
    })
  },

  /**
   * 导出数据
   */
  async exportData(e) {
    try {
      const format = e.currentTarget.dataset.format || 'xlsx'
      
      // 安全检查 this.data
      if (!this.data) {
        console.error('页面数据未初始化')
        wx.showToast({
          title: '页面数据未初始化',
          icon: 'error'
        })
        return
      }
      
      const { userRole, userDistrict } = this.data
      
      // 隐藏弹窗
      this.setData({
        showExportModal: false
      })
      
      if (!exportUtil.checkExportPermission(userRole)) {
        wx.showToast({
          title: '没有导出权限',
          icon: 'error'
        })
        return
      }
      
      const app = getApp()
      const userId = app.globalData.openid
      console.log('当前用户ID:', userId)
      const filters = this.buildFilterCondition()
      
      console.log('导出参数:', { userRole, userId, userDistrict, filters, format })
      
      await exportUtil.exportBusinessData(userRole, userId, userDistrict, filters, format)
      
    } catch (error) {
      console.error('导出失败：', error)
      wx.showToast({
        title: typeof error === 'string' ? error : '导出失败',
        icon: 'error'
      })
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadData(true).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadData(false)
    }
  },

  /**
   * 删除记录
   */
  deleteRecord(e) {
    const { index } = e.currentTarget.dataset
    const record = this.data.businessRecords[index]
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条业务记录吗？删除后无法恢复。',
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = wx.cloud.database()
            await db.collection('business_records').doc(record._id).remove()
            
            // 删除云存储中的图片
            if (record.attachments && record.attachments.length > 0) {
              await Promise.all(
                record.attachments.map(fileID => 
                  wx.cloud.deleteFile({ fileList: [fileID] })
                )
              )
            }
            
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })
            
            // 重新加载数据
            this.loadData(true)
            
          } catch (error) {
            console.error('删除失败：', error)
            wx.showToast({
              title: '删除失败',
              icon: 'error'
            })
          }
        }
      }
    })
  }
})