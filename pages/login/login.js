const auth = require('../../utils/auth')
const workspace = require('../../utils/workspace')
const { callSales, currentMonth, renderSalesData, exportSalesParticipation } = require('../../utils/sales-service')
const emptyStats = () => ({ totalRecords: 0, monthRecords: 0, totalCommission: '0.00',
  monthCommission: '0.00', settledCommission: '0.00', unsettledCommission: '0.00', currentDue: '0.00' })

Page({
  data: {
    userInfo: null, hasUserInfo: false, userRole: '', isEmployee: true, selectedWorkspaceType: 'sales',
    roleText: '', profileCompleted: false, showProfileModal: false, monthLabel: currentMonth(),
    profileDisplayName: '', profileSubtitle: '', loginPrompt: '', canImport: false, canMaintain: false, claimed: false,
    monthStatus: '', cutoffDate: '', profileForm: { employeeId: '', realName: '', gridAccount: '' }, participation: null, scopeLabel: '',
    claimMode: 'employee', canClaimManager: false, managerClaimPending: false,
    stats: emptyStats(), loading: false, savingProfile: false, errorText: '', receiptWarning: '',
    canHandleFeedback: false, pendingCount: 0, feedbackError: '', canExportParticipation: false, exportingParticipation: false
  },
  onLoad() {
    const selectedWorkspaceType = workspace.getPreferredWorkspaceType()
    this.setData({ selectedWorkspaceType, loginPrompt: '已选择：' + workspace.getWorkspaceLabel(selectedWorkspaceType) })
  },
  async onShow() {
    this.visible = true
    this.setData({ loading: true, participation: null, canImport: false, canMaintain: false, canExportParticipation: false })
    try {
      if (!await auth.ensureLoggedIn()) { this.setData({ hasUserInfo: false, loading: false }); return }
      const user = await auth.getCurrentUserInfo()
      if (!this.visible) return
      this.setUserState(user)
      if (this.data.managerClaimPending) { this.setData({ loading: false }); return }
      if (workspace.isLineProjectWorkspace(user)) { await workspace.relaunchWorkspaceHome(user); return }
      await this.loadDashboard()
    } catch (error) {
      if (this.visible) { this.setData({ loading: false, hasUserInfo: !!getApp().globalData.hasUserInfo }); this.error(error) }
    }
  },
  onHide() { this.visible = false; this.requestId = (this.requestId || 0) + 1 },
  onUnload() { this.onHide() },
  error(error) { wx.showModal({ title: '提示', content: error.message || '操作失败', showCancel: false }) },
  selectWorkspace(e) {
    const selectedWorkspaceType = workspace.normalizeWorkspaceType(e.currentTarget.dataset.workspaceType)
    workspace.setPreferredWorkspaceType(selectedWorkspaceType)
    this.setData({ selectedWorkspaceType, loginPrompt: '已选择：' + workspace.getWorkspaceLabel(selectedWorkspaceType) })
  },
  setUserState(user) {
    const managerClaimPending = workspace.getPreferredWorkspaceType() === 'sales' &&
      workspace.isLineProjectWorkspace(user) && user.canClaimSalesManager === true
    const isEmployee = managerClaimPending || user.role === 'sales_person'
    const completed = workspace.isProfileCompleted(user)
    this.setData({
      userInfo: { nickName: user.nickName || '', avatarUrl: user.avatarUrl || '' },
      hasUserInfo: true, userRole: user.role, isEmployee,
      selectedWorkspaceType: managerClaimPending ? 'sales' : workspace.getWorkspaceType(user),
      roleText: workspace.getRoleText(user), profileCompleted: completed,
      showProfileModal: managerClaimPending || isEmployee && !completed, claimed: !!user.salesClaimed,
      canClaimManager: !!user.canClaimSalesManager, managerClaimPending,
      claimMode: managerClaimPending ? 'manager' : 'employee',
      profileDisplayName: user.realName || user.nickName || (isEmployee ? '待认领员工编号' : '管理人员'),
      profileSubtitle: isEmployee ? [user.employeeId, user.district, user.gridName].filter(Boolean).join(' / ')
        : user.role === 'district_manager' ? '管理区县：' + (user.salesManagedDistrict || '尚未配置') : '管理范围：全市',
      profileForm: { employeeId: user.employeeId || '', realName: user.realName || '', gridAccount: user.gridAccount || '' }
    })
  },
  async onLogin() {
    this.setData({ loading: true })
    try {
      const result = await auth.login()
      this.setUserState(result.user)
      if (this.data.managerClaimPending) return
      if (workspace.isLineProjectWorkspace(result.user)) await workspace.relaunchWorkspaceHome(result.user)
      else await this.loadDashboard()
    } catch (error) { this.error(error) } finally { this.setData({ loading: false }) }
  },
  openProfileModal() {
    if ((!this.data.isEmployee || this.data.claimed) && !this.data.canClaimManager) { wx.navigateTo({ url: '/pages/profile/profile' }); return }
    this.setData({ showProfileModal: true, claimMode: this.data.canClaimManager ? 'manager' : 'employee' })
  },
  closeProfileModal() { this.setData({ showProfileModal: false }) },
  stopModalPropagation() {},
  onClaimModeChange(e) { if (!this.data.savingProfile) this.setData({ claimMode: e.currentTarget.dataset.mode }) },
  onProfileInputChange(e) { this.setData({ ['profileForm.' + e.currentTarget.dataset.field]: e.detail.value }) },
  async submitProfile() {
    if (this.data.savingProfile) return
    const manager = this.data.claimMode === 'manager', form = this.data.profileForm
    if (manager ? !form.realName.trim() || !form.gridAccount.trim() : !form.employeeId.trim()) {
      this.error(new Error(manager ? '请输入姓名和网格通账号' : '请输入员工编号')); return
    }
    this.setData({ savingProfile: true })
    try {
      this.setUserState(await auth.updateProfile(manager
        ? { claimType: 'manager', realName: form.realName, gridAccount: form.gridAccount }
        : { employeeId: form.employeeId }))
      this.setData({ showProfileModal: false })
      await this.loadDashboard()
      wx.showToast({ title: '认领成功', icon: 'success' })
    } catch (error) { this.error(error) } finally { this.setData({ savingProfile: false }) }
  },
  onMonthChange(e) { this.setData({ monthLabel: e.detail.value }); this.loadDashboard() },
  async loadDashboard() {
    const requestId = this.requestId = (this.requestId || 0) + 1
    const current = () => this.visible && this.requestId === requestId
    const month = this.data.monthLabel
    this.setData({ loading: true, errorText: '', receiptWarning: '', participation: null, stats: emptyStats(),
      canHandleFeedback: false, pendingCount: 0, feedbackError: '' })
    try {
      const access = await callSales('getAccess')
      if (!current()) return
      const isEmployee = access.role === 'sales_person'
      this.setData({ isEmployee, canImport: access.canImport, canMaintain: access.canMaintain,
        canExportParticipation: access.canExportParticipation === true })
      if (isEmployee) {
        const result = await callSales('list', { personal: true, referenceMonth: month, receiptMonth: month, pageSize: 1 })
        const stats = { ...result.stats }
        for (const key of ['totalCommission', 'monthCommission', 'settledCommission', 'unsettledCommission', 'currentDue']) stats[key] = Number(stats[key] || 0).toFixed(2)
        const versions = result.versions.filter(item => item.businessMonth === month)
        await renderSalesData(this, { stats, loading: false,
          monthStatus: versions.length ? (versions.every(item => item.finalized) ? '已定版' : '更新中') : '暂无数据',
          cutoffDate: versions.map(item => item.cutoffDate).sort().pop() || '' }, result.receipts || [], current)
      } else {
        const result = await callSales('getSummary', { businessMonth: month })
        if (current()) this.setData({ participation: result.participation, scopeLabel: result.scopeLabel })
        const response = await wx.cloud.callFunction({ name: 'salaryFeedback', data: {
          action: 'listPending', data: { workspaceType: 'sales', scene: 'sales_salary' }
        } })
        if (!current()) return
        if (!response.result || !response.result.success) {
          this.setData({ feedbackError: '反馈处理入口加载失败，请重新进入页面刷新。' }); return
        }
        this.setData({ canHandleFeedback: response.result.data.canResolve, pendingCount: response.result.data.records.length })
      }
    } catch (error) {
      if (current()) this.setData({ errorText: error.message || '加载失败，请刷新重试', monthStatus: '加载失败' })
    } finally { if (current()) this.setData({ loading: false }) }
  },
  navigateToImport() { if (this.data.canImport) wx.navigateTo({ url: '/pages/collect/collect' }) },
  async onExportParticipation(e) {
    if (!this.data.canExportParticipation || this.data.exportingParticipation || !this.data.participation) return
    const businessMonth = this.data.monthLabel, district = e.detail.district || ''
    this.setData({ exportingParticipation: true })
    try {
      const result = await exportSalesParticipation({ businessMonth, district })
      if (this.visible && this.data.monthLabel === businessMonth && this.data.canExportParticipation && !district) {
        this.setData({ participation: result.participation })
      }
    } catch (error) { if (this.visible) this.error(error) }
    finally { this.setData({ exportingParticipation: false }) }
  },
  navigateToMaintenance() { if (this.data.canMaintain) wx.navigateTo({ url: '/pages/collect/collect?mode=maintenance' }) },
  navigateToFeedback() {
    if (!this.data.isEmployee) {
      if (this.data.canHandleFeedback) wx.navigateTo({ url: '/pages/feedback/feedback?workspaceType=sales&mode=handle' })
      return
    }
    if (!this.data.claimed) { this.setData({ showProfileModal: true }); return }
    wx.navigateTo({ url: '/pages/feedback/feedback?workspaceType=sales&salaryMonth=' + this.data.monthLabel })
  },
  onLogout() {
    wx.showModal({ title: '退出登录', content: '确认退出当前微信账号？', success: res => {
      if (!res.confirm) return
      this.requestId = (this.requestId || 0) + 1
      auth.logout()
      this.setData({ hasUserInfo: false, userInfo: null, showProfileModal: false, canImport: false,
        canMaintain: false, canExportParticipation: false, participation: null, canHandleFeedback: false, stats: emptyStats() })
    } })
  }
})
