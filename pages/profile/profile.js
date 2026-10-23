const auth = require('../../utils/auth')
const gridOptions = require('../../utils/grid-options')
const workspace = require('../../utils/workspace')
Page({
  data: {
    loading: false, saving: false, roleText: '', isSales: true, isManagement: false, claimed: false,
    districts: gridOptions.getDistricts(), grids: [], profileForm: {}
  },
  async onShow() {
    try {
      if (!await auth.ensureLoggedIn()) { wx.switchTab({ url: '/pages/login/login' }); return }
      this.setProfileState(await auth.getCurrentUserInfo())
    } catch (error) { this.error(error) }
  },
  setProfileState(user) {
    this.setData({
      profileForm: { ...user }, roleText: workspace.getRoleText(user),
      isSales: workspace.isSalesWorkspace(user) && user.role === 'sales_person',
      isManagement: workspace.isSalesWorkspace(user) && user.role !== 'sales_person', claimed: !!user.salesClaimed,
      grids: gridOptions.getGridsByDistrict(user.district)
    })
  },
  error(error) { wx.showModal({ title: '个人资料', content: error.message || '操作失败', showCancel: false }) },
  onInputChange(e) { this.setData({ ['profileForm.' + e.currentTarget.dataset.field]: e.detail.value }) },
  onDistrictChange(e) {
    const district = this.data.districts[Number(e.detail.value)]
    this.setData({ 'profileForm.district': district, 'profileForm.gridName': '', grids: gridOptions.getGridsByDistrict(district) })
  },
  onGridChange(e) { this.setData({ 'profileForm.gridName': this.data.grids[Number(e.detail.value)] }) },
  async onSave() {
    if (this.data.saving || this.data.isManagement) return
    this.setData({ saving: true })
    try {
      const user = await auth.updateProfile(this.data.profileForm)
      this.setProfileState(user)
      wx.showToast({ title: this.data.isSales ? '认领成功' : '保存成功' })
    } catch (error) { this.error(error) } finally { this.setData({ saving: false }) }
  },
  backToLogin() {
    if (getCurrentPages().length > 1) wx.navigateBack()
    else workspace.relaunchWorkspaceHome(this.data.profileForm)
  }
})
