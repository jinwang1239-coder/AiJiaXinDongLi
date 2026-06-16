const auth = require('../../utils/auth')
const lineProjectService = require('../../utils/line-project-service')
const lineProjectConfig = require('../../utils/line-project-config')
const workspace = require('../../utils/workspace')

function isProfileCompleted(user) {
  return !!user && !!(
    String(user.realName || '').trim() &&
    String(user.gridAccount || '').trim() &&
    String(user.district || '').trim() &&
    String(user.gridName || '').trim()
  )
}

function buildCompositionDisplay(composition = []) {
  const amountMap = {}
  ;(composition || []).forEach(item => {
    if (!item || !item.subCategory) {
      return
    }
    amountMap[item.subCategory] = Number(item.amount || 0)
  })

  return lineProjectConfig.COMMISSION_SUBCATEGORY_OPTIONS.map(subCategory => ({
    subCategory,
    amount: Number(amountMap[subCategory] || 0),
    amountText: lineProjectConfig.formatMoney(amountMap[subCategory] || 0)
  }))
}

function buildDefaultOverview(settlementMonth) {
  const compositionDisplay = buildCompositionDisplay([])
  return {
    summary: {
      settlementMonth,
      totalAmount: 0,
      totalAmountText: lineProjectConfig.formatMoney(0),
      totalWorkOrders: 0,
      totalRecords: 0,
      compositionText: lineProjectConfig.buildCommissionCompositionText(0, []),
      composition: [],
      formulaTitle: `总酬金（${lineProjectConfig.formatMoney(0)}元） =`,
      compositionDisplay
    }
  }
}

Page({
  data: {
    loading: false,
    roleText: '',
    profileDisplayName: '',
    profileSubtitle: '',
    profileCompleted: false,
    canImport: false,
    monthPickerValue: lineProjectConfig.toMonthPickerValue(),
    filters: {
      settlementMonth: lineProjectConfig.getDefaultSettlementMonth(),
      majorCategory: lineProjectConfig.CURRENT_MAJOR_CATEGORY,
      subCategory: lineProjectConfig.CURRENT_SUBCATEGORY
    },
    overview: buildDefaultOverview(lineProjectConfig.getDefaultSettlementMonth())
  },

  onLoad(options = {}) {
    const settlementMonth = options.settlementMonth || this.data.filters.settlementMonth
    this.setData({
      monthPickerValue: lineProjectConfig.toMonthPickerValue(settlementMonth),
      filters: {
        settlementMonth,
        majorCategory: lineProjectConfig.CURRENT_MAJOR_CATEGORY,
        subCategory: lineProjectConfig.CURRENT_SUBCATEGORY
      },
      overview: buildDefaultOverview(settlementMonth)
    })
  },

  onShow() {
    this.loadOverview()
  },

  async ensureLogin() {
    const user = await auth.ensureLoggedIn()
    if (!user) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return null
    }

    if (!workspace.isLineProjectWorkspace(user)) {
      workspace.denyWorkspaceAccess(user, workspace.WORKSPACE_TYPES.LINE_PROJECT)
      return null
    }

    this.setData({
      roleText: workspace.getRoleText(user),
      profileDisplayName: user.realName || user.nickName || '未命名用户',
      profileSubtitle: [user.district, user.gridName, user.gridAccount].filter(Boolean).join(' / ') || '集客开通酬金工作台',
      profileCompleted: isProfileCompleted(user),
      canImport: ['district_manager', 'sales_department'].includes(user.role)
    })
    return user
  },

  async loadOverview() {
    const user = await this.ensureLogin()
    if (!user) {
      return
    }

    try {
      this.setData({ loading: true })
      const data = await lineProjectService.callLineProject('getMyOverview', {
        filters: this.data.filters
      })
      const totalAmount = Number(data.summary && data.summary.totalAmount) || 0
      const composition = (data.summary && data.summary.composition) || [
        {
          subCategory: lineProjectConfig.CURRENT_SUBCATEGORY,
          amount: 0
        }
      ]
      const compositionDisplay = buildCompositionDisplay(composition)

      this.setData({
        overview: {
          summary: {
            settlementMonth: data.summary ? data.summary.settlementMonth : this.data.filters.settlementMonth,
            totalAmount,
            totalAmountText: lineProjectConfig.formatMoney(totalAmount),
            totalWorkOrders: Number(data.summary && data.summary.totalWorkOrders) || 0,
            totalRecords: Number(data.summary && data.summary.totalRecords) || 0,
            compositionText: lineProjectConfig.buildCommissionCompositionText(totalAmount, composition),
            composition,
            formulaTitle: `总酬金（${lineProjectConfig.formatMoney(totalAmount)}元） =`,
            compositionDisplay
          }
        }
      })
    } catch (error) {
      console.error('加载集客开通概览失败:', error)
      wx.showToast({
        title: error.message || '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onMonthChange(e) {
    const settlementMonth = (e.detail.value || '').slice(0, 7)
    this.setData({
      monthPickerValue: e.detail.value,
      'filters.settlementMonth': settlementMonth,
      overview: buildDefaultOverview(settlementMonth)
    })
  },

  refreshOverview() {
    this.loadOverview()
  },

  onCompositionTap(e) {
    const { subCategory = '' } = e.currentTarget.dataset || {}
    if (subCategory === lineProjectConfig.CURRENT_SUBCATEGORY) {
      this.navigateToWorkOrders()
      return
    }

    wx.showToast({
      title: `${subCategory}后续开放`,
      icon: 'none'
    })
  },

  navigateToWorkOrders() {
    wx.navigateTo({
      url: `/pages/line-project/workorders?${lineProjectConfig.buildQueryString({
        settlementMonth: this.data.filters.settlementMonth
      })}`
    })
  },

  navigateToFeedback() {
    if (!this.data.profileCompleted) {
      wx.showToast({
        title: '请先完善个人信息',
        icon: 'none'
      })
      return
    }

    wx.navigateTo({
      url: `/pages/feedback/feedback?${lineProjectConfig.buildQueryString({
        workspaceType: workspace.WORKSPACE_TYPES.LINE_PROJECT,
        scene: 'line_project_workorders',
        salaryMonth: this.data.filters.settlementMonth,
        salaryAmount: this.data.overview.summary.totalAmount
      })}`
    })
  },

  navigateToImport() {
    wx.navigateTo({
      url: `/pages/line-project/import?${lineProjectConfig.buildQueryString({
        settlementMonth: this.data.filters.settlementMonth
      })}`
    })
  },

  openProfile() {
    wx.navigateTo({
      url: '/pages/profile/profile'
    })
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        auth.logout()
        workspace.relaunchWorkspaceHome(workspace.WORKSPACE_TYPES.SALES).catch(error => {
          console.error('退出登录后跳转失败:', error)
        })
      }
    })
  }
})
