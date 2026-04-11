const auth = require('../../utils/auth')
const gridOptions = require('../../utils/grid-options')

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
      realName: '',
      gridAccount: '',
      district: '',
      gridName: ''
    }
  },

  onLoad() {
    this.loadProfile()
  },

  onShow() {
    this.loadProfile()
  },

  async loadProfile() {
    const app = getApp()
    if (!app.globalData.hasUserInfo) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/login/login'
        })
      }, 300)
      return
    }

    try {
      this.setData({ loading: true })
      const user = await auth.getCurrentUserInfo()
      const district = user.district || ''
      this.setData({
        grids: gridOptions.getGridsByDistrict(district),
        profileForm: {
          nickName: user.nickName || '',
          avatarUrl: user.avatarUrl || '',
          role: user.role || '',
          realName: user.realName || '',
          gridAccount: user.gridAccount || '',
          district,
          gridName: user.gridName || ''
        }
      })
      this.updateRoleText(user.role)
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
      await auth.updateProfile({
        realName: this.data.profileForm.realName,
        gridAccount: this.data.profileForm.gridAccount,
        district: this.data.profileForm.district,
        gridName: this.data.profileForm.gridName
      })
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })
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
