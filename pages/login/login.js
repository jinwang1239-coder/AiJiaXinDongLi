const auth = require('../../utils/auth')
const commission = require('../../utils/commission-fixed')
const gridOptions = require('../../utils/grid-options')
const workspace = require('../../utils/workspace')

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    userRole: null,
    workspaceType: workspace.WORKSPACE_TYPES.SALES,
    selectedWorkspaceType: workspace.WORKSPACE_TYPES.SALES,
    roleText: '',
    profileCompleted: false,
    showProfileModal: false,
    monthLabel: '',
    profileDisplayName: '未命名用户',
    profileSubtitle: '请先补充所属网格信息',
    loginPrompt: '请选择工作界面后再登录',
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
    this.initWorkspaceSelection()
  },

  async onShow() {
    this.setMonthLabel()
    const user = await this.checkLoginStatus()
    if (!user) {
      return
    }

    if (await this.routeByWorkspace(user, { selectedWorkspaceType: this.data.selectedWorkspaceType })) {
      return
    }

    if (user.profileCompleted) {
      this.loadUserStats()
    }
  },

  initWorkspaceSelection() {
    const selectedWorkspaceType = workspace.getPreferredWorkspaceType()
    this.setData({
      selectedWorkspaceType,
      loginPrompt: this.buildLoginPrompt(selectedWorkspaceType)
    })
  },

  setMonthLabel() {
    const now = new Date()
    const monthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    this.setData({ monthLabel })
  },

  buildLoginPrompt(selectedWorkspaceType) {
    return `已选择：${workspace.getWorkspaceLabel(selectedWorkspaceType)}`
  },

  selectWorkspace(e) {
    const selectedWorkspaceType = workspace.normalizeWorkspaceType(e.currentTarget.dataset.workspaceType)
    workspace.setPreferredWorkspaceType(selectedWorkspaceType)
    this.setData({
      selectedWorkspaceType,
      loginPrompt: this.buildLoginPrompt(selectedWorkspaceType)
    })
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
    const actualWorkspaceType = workspace.getWorkspaceType(user)

    workspace.setPreferredWorkspaceType(actualWorkspaceType)

    this.setData({
      userInfo: {
        nickName: user.nickName || '',
        avatarUrl: user.avatarUrl || ''
      },
      hasUserInfo: true,
      userRole: user.role || null,
      workspaceType: actualWorkspaceType,
      selectedWorkspaceType: actualWorkspaceType,
      roleText: workspace.getRoleText(user),
      profileCompleted: completed,
      showProfileModal: !completed,
      profileForm,
      grids: gridOptions.getGridsByDistrict(profileForm.district),
      profileDisplayName: profileForm.realName || user.nickName || '未命名用户',
      profileSubtitle: this.buildProfileSubtitle(profileForm),
      loginPrompt: this.buildLoginPrompt(actualWorkspaceType)
    })
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
      return `${district} / ${gridName}`
    }
    return district || gridName || '请先补充所属网格信息'
  },

  async showWorkspaceMismatch(actualWorkspaceType) {
    wx.showToast({
      title: `当前账号已配置为${workspace.getWorkspaceLabel(actualWorkspaceType)}`,
      icon: 'none',
      duration: 1600
    })

    return new Promise(resolve => {
      setTimeout(resolve, 500)
    })
  },

  async routeByWorkspace(user, options = {}) {
    const actualWorkspaceType = workspace.getWorkspaceType(user)
    const selectedWorkspaceType = options.selectedWorkspaceType || this.data.selectedWorkspaceType
    const shouldTipMismatch = !!options.showMismatchTip && selectedWorkspaceType && selectedWorkspaceType !== actualWorkspaceType

    if (shouldTipMismatch) {
      await this.showWorkspaceMismatch(actualWorkspaceType)
    }

    if (!workspace.isLineProjectWorkspace(user)) {
      return false
    }

    try {
      await workspace.relaunchWorkspaceHome(user)
      return true
    } catch (error) {
      console.error('集客线路工作台跳转失败:', error)
      wx.showToast({
        title: '工作台跳转失败',
        icon: 'none'
      })
      return false
    }
  },

  formatMoney(value) {
    return Number(value || 0).toFixed(2)
  },

  async onLogin() {
    if (!this.data.selectedWorkspaceType) {
      wx.showToast({
        title: '请先选择工作界面',
        icon: 'none'
      })
      return
    }

    try {
      this.setData({ loading: true })
      const intendedWorkspaceType = this.data.selectedWorkspaceType
      const result = await auth.login()
      const user = result.user
      const hasWorkspaceMismatch = intendedWorkspaceType !== workspace.getWorkspaceType(user)
      this.setUserState(user)

      if (await this.routeByWorkspace(user, {
        selectedWorkspaceType: intendedWorkspaceType,
        showMismatchTip: true
      })) {
        return
      }

      if (user.profileCompleted) {
        await this.loadUserStats()
        if (!hasWorkspaceMismatch) {
          wx.showToast({ title: '登录成功', icon: 'success' })
        }
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

      if (await this.routeByWorkspace(user, { selectedWorkspaceType: this.data.selectedWorkspaceType })) {
        return
      }

      await this.loadUserStats()
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
      if (!currentUser || workspace.isLineProjectWorkspace(currentUser)) {
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

  navigateToFeedback() {
    if (!this.data.hasUserInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    if (!workspace.isSalesWorkspace(this.data.workspaceType)) {
      wx.showToast({ title: '当前账号不可使用酬金反馈', icon: 'none' })
      return
    }

    if (!this.data.profileCompleted) {
      wx.showToast({ title: '请先完善个人信息', icon: 'none' })
      this.setData({ showProfileModal: true })
      return
    }

    wx.navigateTo({
      url: '/pages/feedback/feedback'
    })
  },

  resetUserState() {
    const selectedWorkspaceType = workspace.getPreferredWorkspaceType()
    this.setData({
      userInfo: null,
      hasUserInfo: false,
      userRole: null,
      workspaceType: workspace.WORKSPACE_TYPES.SALES,
      selectedWorkspaceType,
      roleText: '',
      profileCompleted: false,
      showProfileModal: false,
      profileDisplayName: '未命名用户',
      profileSubtitle: '请先补充所属网格信息',
      loginPrompt: this.buildLoginPrompt(selectedWorkspaceType),
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
