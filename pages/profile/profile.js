const auth = require('../../utils/auth')
const gridOptions = require('../../utils/grid-options')
const workspace = require('../../utils/workspace')

Page({
  data: {
    loading: false,
    saving: false,
    roleText: '',
    districts: gridOptions.getDistricts(),
    grids: [],
    profileForm: {
      nickName: '',
      avatarUrl: '',
      role: '',
      workspaceType: workspace.WORKSPACE_TYPES.SALES,
      realName: '',
      gridAccount: '',
      district: '',
      gridName: ''
    }
  },

  onShow() {
    this.loadProfile()
  },

  async loadProfile() {
    try {
      this.setData({ loading: true })
      const user = await auth.ensureLoggedIn()
      if (!user) {
        this.redirectToLogin()
        return
      }

      this.setProfileState(user)
    } catch (error) {
      console.error('加载个人信息失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  redirectToLogin() {
    wx.showToast({
      title: '请先登录',
      icon: 'none'
    })
    setTimeout(() => {
      workspace.relaunchWorkspaceHome(workspace.WORKSPACE_TYPES.SALES)
    }, 300)
  },

  async backToLogin() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 })
      return
    }

    const user = await auth.ensureLoggedIn()
    await workspace.relaunchWorkspaceHome(user || workspace.WORKSPACE_TYPES.SALES)
  },

  setProfileState(user) {
    const district = user.district || ''
    this.setData({
      roleText: workspace.getRoleText(user),
      grids: gridOptions.getGridsByDistrict(district),
      profileForm: {
        nickName: user.nickName || '',
        avatarUrl: user.avatarUrl || '',
        role: user.role || '',
        workspaceType: workspace.getWorkspaceType(user),
        realName: user.realName || '',
        gridAccount: user.gridAccount || '',
        district,
        gridName: user.gridName || ''
      }
    })
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    this.setData({
      [`profileForm.${field}`]: e.detail.value
    })
  },

  onDistrictChange(e) {
    const district = this.data.districts[Number(e.detail.value)] || ''
    const grids = gridOptions.getGridsByDistrict(district)
    this.setData({
      grids,
      'profileForm.district': district,
      'profileForm.gridName': ''
    })
  },

  onGridChange(e) {
    const gridName = this.data.grids[Number(e.detail.value)] || ''
    this.setData({
      'profileForm.gridName': gridName
    })
  },

  validateForm() {
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

  async onSave() {
    if (!this.validateForm()) {
      return
    }

    try {
      this.setData({ saving: true })
      const user = await auth.updateProfile({
        realName: this.data.profileForm.realName,
        gridAccount: this.data.profileForm.gridAccount,
        district: this.data.profileForm.district,
        gridName: this.data.profileForm.gridName
      })
      this.setProfileState(user)
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })
      setTimeout(() => {
        this.backToLogin()
      }, 500)
    } catch (error) {
      console.error('保存个人信息失败:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'error'
      })
    } finally {
      this.setData({ saving: false })
    }
  }
})
