const auth = require('../../utils/auth')
const commission = require('../../utils/commission-fixed')
const gridOptions = require('../../utils/grid-options')

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    userRole: null,
    roleText: '',
    profileCompleted: false,
    showProfileModal: false,
    monthLabel: '',
    profileDisplayName: '未命名用户',
    profileSubtitle: '请先补充所属网格信息',
    districts: gridOptions.getDistricts(),
    grids: [],
    profileForm: {
      realName: '',
      gridAccount: '',
      district: '',
      gridName: ''
    },
    stats: {
      totalRecords: 0,
      totalCommission: '0.00',
      todayRecords: 0,
      todayCommission: '0.00',
      monthRecords: 0,
      monthCommission: '0.00'
    },
    loading: false,
    savingProfile: false
  },

  onLoad() {
    this.setMonthLabel()
  },

  async onShow() {
    this.setMonthLabel()
    const user = await this.checkLoginStatus()
    if (user && user.profileCompleted) {
      this.loadUserStats()
    }
  },

  setMonthLabel() {
    const now = new Date()
    const monthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    this.setData({ monthLabel })
  },

  async checkLoginStatus() {
    const user = await auth.ensureLoggedIn()
    if (!user) {
      this.resetUserState()
      return null
    }

    this.setUserState(user)
    return user
  },

  setUserState(user) {
    const profileForm = this.buildProfileForm(user)
    const completed = !!user.profileCompleted || !!(
      profileForm.realName.trim() &&
      profileForm.gridAccount.trim() &&
      profileForm.district.trim() &&
      profileForm.gridName.trim()
    )

    this.setData({
      userInfo: {
        nickName: user.nickName || '',
        avatarUrl: user.avatarUrl || ''
      },
      hasUserInfo: true,
      userRole: user.role || null,
      profileCompleted: completed,
      showProfileModal: !completed,
      profileForm,
      grids: gridOptions.getGridsByDistrict(profileForm.district),
      profileDisplayName: profileForm.realName || user.nickName || '未命名用户',
      profileSubtitle: this.buildProfileSubtitle(profileForm)
    })
    this.updateRoleText(user.role)
  },

  buildProfileForm(user) {
    return {
      realName: user.realName || '',
      gridAccount: user.gridAccount || '',
      district: user.district || '',
      gridName: user.gridName || ''
    }
  },

  buildProfileSubtitle(profileForm) {
    const { district, gridName } = profileForm
    if (district && gridName) {
      return `${district} -> ${gridName}`
    }
    return district || gridName || '请先补充所属网格信息'
  },

  updateRoleText(role) {
    const roleMap = {
      sales_person: '销售师傅',
      district_manager: '区县主管',
      sales_department: '销售业务部'
    }

    this.setData({
      roleText: roleMap[role] || '未知角色'
    })
  },

  formatMoney(value) {
    return Number(value || 0).toFixed(2)
  },

  async onLogin() {
    try {
      this.setData({ loading: true })
      const result = await auth.login()
      this.setUserState(result.userRole)

      if (result.userRole.profileCompleted) {
        this.loadUserStats()
        wx.showToast({ title: '登录成功', icon: 'success' })
      } else {
        wx.showToast({ title: '请补充个人信息', icon: 'none' })
      }
    } catch (error) {
      console.error('登录失败:', error)
      wx.showToast({ title: '登录失败', icon: 'error' })
    } finally {
      this.setData({ loading: false })
    }
  },

  openProfileModal() {
    if (!this.data.hasUserInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    if (this.data.profileCompleted) {
      wx.navigateTo({
        url: '/pages/profile/profile'
      })
      return
    }

    this.setData({ showProfileModal: true })
  },

  closeProfileModal() {
    if (!this.data.profileCompleted) {
      wx.showToast({ title: '请先完成个人信息填写', icon: 'none' })
      return
    }

    this.setData({ showProfileModal: false })
  },

  stopModalPropagation() {},

  onProfileInputChange(e) {
    const { field } = e.currentTarget.dataset
    const profileForm = {
      ...this.data.profileForm,
      [field]: e.detail.value
    }

    this.setData({
      profileForm,
      profileDisplayName: profileForm.realName || (this.data.userInfo && this.data.userInfo.nickName) || '未命名用户'
    })
  },

  onDistrictChange(e) {
    const district = this.data.districts[Number(e.detail.value)] || ''
    const grids = gridOptions.getGridsByDistrict(district)
    const profileForm = {
      ...this.data.profileForm,
      district,
      gridName: ''
    }

    this.setData({
      grids,
      profileForm,
      profileSubtitle: this.buildProfileSubtitle(profileForm)
    })
  },

  onGridChange(e) {
    const gridName = this.data.grids[Number(e.detail.value)] || ''
    const profileForm = {
      ...this.data.profileForm,
      gridName
    }

    this.setData({
      profileForm,
      profileSubtitle: this.buildProfileSubtitle(profileForm)
    })
  },

  validateProfileForm() {
    const { realName, gridAccount, district, gridName } = this.data.profileForm

    if (!realName.trim()) {
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return false
    }

    if (!gridAccount.trim()) {
      wx.showToast({ title: '请输入网格通账号', icon: 'none' })
      return false
    }

    if (!district) {
      wx.showToast({ title: '请选择区县', icon: 'none' })
      return false
    }

    if (!gridName) {
      wx.showToast({ title: '请选择所属网格', icon: 'none' })
      return false
    }

    return true
  },

  async submitProfile() {
    if (!this.validateProfileForm()) {
      return
    }

    try {
      this.setData({ savingProfile: true })
      const user = await auth.updateProfile(this.data.profileForm)
      this.setUserState(user)
      this.setData({ showProfileModal: false })
      this.loadUserStats()
      wx.showToast({ title: '资料已保存', icon: 'success' })
    } catch (error) {
      console.error('保存个人信息失败:', error)
      wx.showToast({ title: '保存失败', icon: 'error' })
    } finally {
      this.setData({ savingProfile: false })
    }
  },

  async loadUserStats() {
    try {
      const currentUser = await auth.ensureLoggedIn()
      if (!currentUser) {
        return
      }

      const res = await wx.cloud.callFunction({
        name: 'businessData',
        data: {
          action: 'list',
          data: {
            page: 1,
            pageSize: 100,
            filters: {},
            sortBy: 'createTime',
            sortOrder: 'desc'
          }
        }
      })

      if (!res.result || !res.result.success) {
        throw new Error((res.result && res.result.error) || '统计数据加载失败')
      }

      const resultData = res.result.data || {}
      const stats = this.resolveUserStats(resultData.stats, resultData.records || [], resultData.total)
      this.setData({ stats })
    } catch (error) {
      console.error('加载统计数据失败:', error)
    }
  },

  resolveUserStats(remoteStats = {}, records = [], total = 0) {
    const localStats = commission.calculateStats(records)
    const stats = remoteStats && Object.keys(remoteStats).length > 0 ? { ...remoteStats } : {}
    const totalRecords = Number(total || stats.totalRecords || localStats.totalRecords || 0)

    if (localStats.totalRecords > Number(stats.totalRecords || 0)) {
      stats.totalRecords = totalRecords || localStats.totalRecords
    } else if (!Number(stats.totalRecords || 0) && totalRecords) {
      stats.totalRecords = totalRecords
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

    return {
      totalRecords: Number(stats.totalRecords || 0),
      totalCommission: this.formatMoney(stats.totalCommission),
      todayRecords: Number(stats.todayRecords || 0),
      todayCommission: this.formatMoney(stats.todayCommission),
      monthRecords: Number(stats.monthRecords || 0),
      monthCommission: this.formatMoney(stats.monthCommission)
    }
  },

  getDefaultStats() {
    return {
      totalRecords: 0,
      totalCommission: '0.00',
      todayRecords: 0,
      todayCommission: '0.00',
      monthRecords: 0,
      monthCommission: '0.00'
    }
  },

  resetUserState() {
    this.setData({
      userInfo: null,
      hasUserInfo: false,
      userRole: null,
      roleText: '',
      profileCompleted: false,
      showProfileModal: false,
      profileDisplayName: '未命名用户',
      profileSubtitle: '请先补充所属网格信息',
      grids: [],
      profileForm: {
        realName: '',
        gridAccount: '',
        district: '',
        gridName: ''
      },
      stats: this.getDefaultStats()
    })
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: res => {
        if (!res.confirm) {
          return
        }

        auth.logout()
        this.resetUserState()

        wx.showToast({ title: '已退出登录', icon: 'success' })
      }
    })
  }
})
