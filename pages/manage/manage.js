// pages/manage/manage.js
const auth = require('../../utils/auth')
const exportUtil = require('../../utils/export')
const commission = require('../../utils/commission-fixed')

Page({
  data: {
    // 用户信息
    userRole: null,
    userDistrict: '',
    currentOpenid: '',
    userGridAccount: '',
    
    // 业务数据
    businessRecords: [],
    filteredRecords: [],
    
    // 统计信息
    stats: {
      totalRecords: 0,
      totalCommission: 0,
      todayRecords: 0,
      todayCommission: 0,
      settledCommission: 0,
      unsettledCommission: 0
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
  showLoginRequiredModal() {
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
  },

  async checkLoginStatus() {
    const user = await auth.ensureLoggedIn()
    if (!user) {
      this.showLoginRequiredModal()
      return false
    }

    this.setData({
      userRole: user.role || null,
      userDistrict: user.district || '',
      currentOpenid: user.openid || '',
      userGridAccount: user.gridAccount || ''
    })

    return user
  },

  /**
   * 加载数据
   */
  async loadData(reset = true) {
    const currentUser = await this.checkLoginStatus()
    if (!currentUser) {
      return
    }

    try {
      this.setData({ loading: true })

      const page = reset ? 1 : this.data.currentPage + 1
      const res = await wx.cloud.callFunction({
        name: 'businessData',
        data: {
          action: 'list',
          data: {
            page,
            pageSize: this.data.pageSize,
            filters: this.buildFilterCondition(),
            sortBy: 'createTime',
            sortOrder: 'desc'
          }
        }
      })

      if (!res.result || !res.result.success) {
        throw new Error((res.result && res.result.error) || '加载数据失败')
      }

      const resultData = res.result.data || {}
      const newRecords = resultData.records || []

      // 格式化记录中的日期，并补充分月核算进度
      const formattedNewRecords = newRecords.map(record => {
        const enrichedRecord = commission.enrichRecordSettlement(record)
        return {
          ...enrichedRecord,
          date: this.formatDate(record.date),
          createTime: this.formatDateTime(record.createTime)
        }
      })
      
      const businessRecords = reset ? formattedNewRecords : [...this.data.businessRecords, ...formattedNewRecords]
      const filterOptions = resultData.filterOptions || {}
      const fallbackFilterOptions = this.buildLocalFilterOptions(businessRecords)
      const total = this.resolveRecordTotal(resultData, businessRecords)
      const stats = this.resolveStats(resultData.stats, businessRecords, total)

      this.setData({
        districts: this.resolveOptionList(filterOptions.districts, fallbackFilterOptions.districts),
        developers: this.resolveOptionList(filterOptions.developers, fallbackFilterOptions.developers)
      })
      
      this.setData({
        businessRecords,
        filteredRecords: businessRecords,
        stats,
        currentPage: page,
        hasMore: businessRecords.length < total
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

  formatStats(stats = {}) {
    return {
      totalRecords: Number(stats.totalRecords || 0),
      totalCommission: this.formatMoney(stats.totalCommission),
      todayRecords: Number(stats.todayRecords || 0),
      todayCommission: this.formatMoney(stats.todayCommission),
      settledCommission: this.formatMoney(stats.settledCommission),
      unsettledCommission: this.formatMoney(stats.unsettledCommission)
    }
  },

  resolveRecordTotal(resultData = {}, records = []) {
    const total = Number(resultData.total)
    return Number.isFinite(total) && total > 0 ? total : records.length
  },

  resolveStats(remoteStats = {}, records = [], total = 0) {
    const localStats = this.calculateLocalStats(records)
    const stats = remoteStats && Object.keys(remoteStats).length > 0 ? { ...remoteStats } : {}

    if (localStats.totalRecords > Number(stats.totalRecords || 0)) {
      stats.totalRecords = total || localStats.totalRecords
    } else if (!Number(stats.totalRecords || 0) && total) {
      stats.totalRecords = total
    }

    if (localStats.totalCommission > Number(stats.totalCommission || 0)) {
      stats.totalCommission = localStats.totalCommission
    }

    if (localStats.todayRecords > Number(stats.todayRecords || 0)) {
      stats.todayRecords = localStats.todayRecords
      stats.todayCommission = localStats.todayCommission
    }

    if (localStats.monthRecords > Number(stats.monthRecords || 0)) {
      stats.monthRecords = localStats.monthRecords
      stats.monthCommission = localStats.monthCommission
    }

    if (localStats.settledCommission > Number(stats.settledCommission || 0)) {
      stats.settledCommission = localStats.settledCommission
    }

    if (localStats.unsettledCommission > Number(stats.unsettledCommission || 0)) {
      stats.unsettledCommission = localStats.unsettledCommission
    }

    return this.formatStats(stats)
  },

  calculateLocalStats(records = []) {
    const stats = commission.calculateStats(records)
    stats.settledCommission = 0
    stats.unsettledCommission = 0

    records.forEach(record => {
      const enrichedRecord = commission.enrichRecordSettlement(record)
      stats.settledCommission += Number(enrichedRecord.settledTotal || 0)
      stats.unsettledCommission += Number(enrichedRecord.unsettledTotal || 0)
    })

    return stats
  },

  buildLocalFilterOptions(records = []) {
    return {
      districts: [...new Set(records.map(record => record.district))].filter(Boolean),
      developers: [...new Set(records.map(record => record.developer || record.developerGridAccount || record.gridAccount))].filter(Boolean)
    }
  },

  resolveOptionList(remoteOptions, localOptions) {
    return Array.isArray(remoteOptions) && remoteOptions.length > 0 ? remoteOptions : localOptions
  },

  formatMoney(value) {
    return Number(value || 0).toFixed(2)
  },

  buildSettlementDetailText(record) {
    const schedule = record.settlementSchedule || []
    const summary = record.settlementSummary || {}
    const scheduleText = schedule.map(item => {
      return `${item.period}核算金额：${this.formatMoney(item.amount)}元，状态：${item.statusText}`
    }).join('\n')

    return `${scheduleText}
目前已核算总金额：${summary.settledRangeText || '暂无已核算'} ${this.formatMoney(summary.settledTotal)}元
目前未核算总金额：${summary.unsettledPeriodsText || '暂无未核算'} ${this.formatMoney(summary.unsettledTotal)}元`
  },

  /**
   * 获取用户信息
   */
  async getUserInfo() {
    return auth.ensureLoggedIn()
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
    if (filters.commissionMin !== '') {
      condition.commissionMin = Number(filters.commissionMin)
    }
    if (filters.commissionMax !== '') {
      condition.commissionMax = Number(filters.commissionMax)
    }
    
    return condition
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
网格通：${record.gridAccount || ''}
业务：${record.businessName}
号码：${record.userPhone}
发展人员：${record.developer}
酬金：¥${record.commission}
${this.buildSettlementDetailText(record)}
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
      
      const { userRole, userDistrict, userGridAccount } = this.data
      
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
      const userId = this.data.currentOpenid || app.globalData.openid
      console.log('当前用户ID:', userId)
      const filters = this.buildFilterCondition()
      
      console.log('导出参数:', { userRole, userId, userDistrict, filters, format })
      
      await exportUtil.exportBusinessData(userRole, userId, userDistrict, filters, format, userGridAccount)
      
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
            const deleteResult = await wx.cloud.callFunction({
              name: 'businessData',
              data: {
                action: 'delete',
                data: {
                  recordId: record._id
                }
              }
            })

            if (!deleteResult.result || !deleteResult.result.success) {
              throw new Error((deleteResult.result && deleteResult.result.error) || '删除失败')
            }
            
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
