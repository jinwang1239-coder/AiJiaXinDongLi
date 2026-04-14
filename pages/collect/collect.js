// pages/collect/collect.js
const auth = require('../../utils/auth')
const commission = require('../../utils/commission-fixed')
const productConfig = require('../../utils/product-config')
const storage = require('../../utils/storage')

const DISTRICTS = [
  '监利',
  '洪湖',
  '石首',
  '松滋',
  '公安县',
  '江陵',
  '沙市区',
  '荆州区',
  '开发区'
]

const IMPORT_TEMPLATE_HEADERS = ['办理时间', '网格通账号', '发展人员网格通', '业务名称', '业务号码']

Page({
  data: {
    formData: {
      date: '',
      district: '',
      businessName: '',
      userPhone: '',
      gridAccount: '',
      attachments: []
    },
    estimatedCommission: 0,
    categories: [],
    subcategories: [],
    products: [],
    selectedCategory: '',
    selectedSubcategory: '',
    selectedProduct: '',
    categoryIndex: -1,
    subcategoryIndex: -1,
    productIndex: -1,
    districts: DISTRICTS,
    userRole: null,
    currentUserGridAccount: '',
    currentUserDistrict: '',
    canBatchImport: false,
    loading: false,
    submitting: false,
    importing: false,
    importFile: null,
    importResult: null,
    importTemplateText: IMPORT_TEMPLATE_HEADERS.join('、'),
    phonePlaceholder: '\u8bf7\u8f93\u516511\u4f4d\u624b\u673a\u53f7\u7801',
    gridAccountPlaceholder: '\u8bf7\u8f93\u5165\u53d1\u5c55\u4eba\u5458\u7f51\u683c\u901a\u8d26\u53f7'
  },

  onLoad() {
    this.initData()
  },

  async onShow() {
    if (await this.checkLoginStatus()) {
      this.loadLastFormData()
    }
  },

  initData() {
    const categories = productConfig.getCategories()
    const dateStr = this.formatDate(new Date())

    this.setData({
      categories,
      'formData.date': dateStr
    })
  },

  loadLastFormData() {
    const lastData = storage.getLastFormData()
    if (!lastData) {
      return
    }

    wx.showModal({
      title: '自动填充',
      content: '检测到上次填写的表单信息，是否自动填充？',
      success: (res) => {
        if (res.confirm) {
          this.autoFillForm(lastData)
        }
      }
    })
  },

  autoFillForm(lastData) {
    const formData = {
      ...this.data.formData,
      district: lastData.district || this.data.formData.district,
      userPhone: lastData.userPhone || this.data.formData.userPhone,
      gridAccount: lastData.gridAccount || this.data.formData.gridAccount
    }

    if (lastData.businessName) {
      formData.businessName = lastData.businessName
      const productMatch = productConfig.searchProduct(lastData.businessName)
      if (productMatch) {
        this.selectProductByMatch(productMatch)
      }
    }

    this.setData({ formData })
    this.calculateCommission()

    wx.showToast({
      title: '已自动填充',
      icon: 'success'
    })
  },

  selectProductByMatch(match) {
    const categories = this.data.categories
    const categoryIndex = categories.findIndex((cat) => cat.name === match.category)
    if (categoryIndex < 0) {
      return
    }

    const subcategories = productConfig.getSubcategories(match.category)
    const subcategoryIndex = subcategories.findIndex((sub) => sub.name === match.subcategory)
    const products = productConfig.getProducts(match.category, match.subcategory)
    const productIndex = products.findIndex((prod) => prod.name === match.product)

    this.setData({
      categoryIndex,
      subcategories,
      subcategoryIndex,
      products,
      productIndex,
      selectedCategory: match.category || '',
      selectedSubcategory: match.subcategory || '',
      selectedProduct: match.product || ''
    })
  },

  showLoginRequiredModal() {
    wx.showModal({
      title: '请先登录',
      content: '使用该功能前需要先登录。',
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

    const nextData = {
      userRole: user.role || null,
      currentUserGridAccount: user.gridAccount || '',
      currentUserDistrict: user.district || '',
      canBatchImport: ['district_manager', 'sales_department'].includes(user.role)
    }

    if (user.gridAccount && !this.data.formData.gridAccount) {
      nextData['formData.gridAccount'] = user.gridAccount
    }

    if (user.district && !this.data.formData.district) {
      nextData['formData.district'] = user.district
    }

    this.setData(nextData)

    return true
  },

  formatDate(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    const { value } = e.detail

    this.setData({
      [`formData.${field}`]: value
    })

    if (field === 'businessName') {
      if (value && value.trim()) {
        this.clearProductSelection()
      }
      this.calculateCommission()
    }
  },

  onDateChange(e) {
    this.setData({
      'formData.date': e.detail.value
    })
  },

  onDistrictChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      'formData.district': this.data.districts[index] || ''
    })
  },

  onCategoryChange(e) {
    const index = Number(e.detail.value)
    const category = this.data.categories[index]
    if (!category) {
      wx.showToast({
        title: '未找到业务分类',
        icon: 'none'
      })
      return
    }

    const subcategories = productConfig.getSubcategories(category.name)
    this.setData({
      categoryIndex: index,
      selectedCategory: category.name,
      subcategories,
      subcategoryIndex: -1,
      productIndex: -1,
      selectedSubcategory: '',
      selectedProduct: '',
      products: [],
      'formData.businessName': ''
    })

    this.calculateCommission()
  },

  onSubcategoryChange(e) {
    const index = Number(e.detail.value)
    const subcategory = this.data.subcategories[index]
    if (!subcategory) {
      wx.showToast({
        title: '未找到业务子分类',
        icon: 'none'
      })
      return
    }

    const products = productConfig.getProducts(this.data.selectedCategory, subcategory.name)
    this.setData({
      subcategoryIndex: index,
      selectedSubcategory: subcategory.name,
      products,
      productIndex: -1,
      selectedProduct: '',
      'formData.businessName': ''
    })

    this.calculateCommission()
  },

  onProductChange(e) {
    const index = Number(e.detail.value)
    const product = this.data.products[index]
    if (!product) {
      wx.showToast({
        title: '未找到具体业务',
        icon: 'none'
      })
      return
    }

    this.setData({
      productIndex: index,
      selectedProduct: product.name,
      'formData.businessName': product.name
    })

    this.calculateCommission()
  },

  clearProductSelection() {
    this.setData({
      categoryIndex: -1,
      subcategoryIndex: -1,
      productIndex: -1,
      selectedCategory: '',
      selectedSubcategory: '',
      selectedProduct: '',
      subcategories: [],
      products: []
    })
  },

  calculateCommission() {
    const { businessName } = this.data.formData
    const estimatedCommission = businessName
      ? commission.calculateCommission(businessName)
      : 0

    this.setData({ estimatedCommission })
  },

  chooseImage() {
    const { attachments } = this.data.formData
    const remainCount = 5 - attachments.length

    if (remainCount <= 0) {
      wx.showToast({
        title: '最多只能上传5张图片',
        icon: 'none'
      })
      return
    }

    wx.chooseMedia({
      count: remainCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newAttachments = attachments.concat(res.tempFiles || [])
        this.setData({
          'formData.attachments': newAttachments
        })
      },
      fail: (error) => {
        console.error('选择图片失败：', error)
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  previewImage(e) {
    const { index } = e.currentTarget.dataset
    const { attachments } = this.data.formData
    const urls = attachments.map((item) => item.tempFilePath)

    wx.previewImage({
      current: urls[index],
      urls
    })
  },

  deleteImage(e) {
    const { index } = e.currentTarget.dataset
    const attachments = this.data.formData.attachments.slice()

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这张图片吗？',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        attachments.splice(index, 1)
        this.setData({
          'formData.attachments': attachments
        })
      }
    })
  },

  normalizeDate(dateStr) {
    if (!dateStr) {
      return ''
    }

    const normalized = dateStr
      .replace(/年/g, '-')
      .replace(/月/g, '-')
      .replace(/日/g, '')
      .replace(/\//g, '-')
      .trim()

    const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (!match) {
      return ''
    }

    const [, year, month, day] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  },

  chooseImportFile() {
    if (!this.data.canBatchImport) {
      wx.showToast({
        title: '当前角色无导入权限',
        icon: 'none'
      })
      return
    }

    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xls', 'xlsx'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) {
          return
        }

        if (!/\.(xls|xlsx)$/i.test(file.name || '')) {
          wx.showToast({
            title: '请选择Excel文件',
            icon: 'none'
          })
          return
        }

        this.setData({
          importFile: file,
          importResult: null
        })
      },
      fail: (error) => {
        if (error && error.errMsg && error.errMsg.includes('cancel')) {
          return
        }
        console.error('选择Excel文件失败：', error)
        wx.showToast({
          title: '选择文件失败',
          icon: 'none'
        })
      }
    })
  },

  clearImportFile() {
    this.setData({
      importFile: null,
      importResult: null
    })
  },

  async onBatchImport() {
    if (!this.data.importFile) {
      wx.showToast({
        title: '请先选择Excel文件',
        icon: 'none'
      })
      return
    }

    const user = await auth.ensureLoggedIn()
    if (!user) {
      this.showLoginRequiredModal()
      return
    }

    if (!['district_manager', 'sales_department'].includes(user.role)) {
      wx.showToast({
        title: '当前角色无导入权限',
        icon: 'none'
      })
      return
    }

    this.setData({ importing: true })
    wx.showLoading({
      title: '导入中...'
    })

    try {
      const file = this.data.importFile
      const ext = (file.name || 'xlsx').split('.').pop()
      const safeName = (file.name || `业务导入.${ext}`).replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: `business_imports/${Date.now()}_${safeName}`,
        filePath: file.path
      })

      const importResponse = await wx.cloud.callFunction({
        name: 'businessData',
        data: {
          action: 'batchImport',
          data: {
            fileID: uploadResult.fileID,
            fileName: file.name || safeName
          }
        }
      })

      if (!importResponse.result || !importResponse.result.success) {
        throw new Error((importResponse.result && importResponse.result.error) || '导入失败')
      }

      const result = importResponse.result.data
      this.setData({
        importResult: result,
        importFile: null
      })

      wx.showToast({
        title: `成功${result.successCount}条`,
        icon: 'success'
      })
    } catch (error) {
      console.error('批量导入失败：', error)
      wx.showToast({
        title: error.message || '导入失败',
        icon: 'none'
      })
    } finally {
      this.setData({ importing: false })
      wx.hideLoading()
    }
  },

  validateForm() {
    const { formData } = this.data

    if (!formData.date) {
      wx.showToast({ title: '请选择日期', icon: 'none' })
      return false
    }

    if (!formData.district) {
      wx.showToast({ title: '请选择区县', icon: 'none' })
      return false
    }

    if (!formData.businessName) {
      wx.showToast({ title: '请输入业务名称', icon: 'none' })
      return false
    }

    if (!formData.userPhone) {
      wx.showToast({ title: '请输入用户号码', icon: 'none' })
      return false
    }

    if (!/^1[3-9]\d{9}$/.test(formData.userPhone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return false
    }

    if (!formData.gridAccount || !formData.gridAccount.trim()) {
      wx.showToast({ title: '请输入发展人员网格通', icon: 'none' })
      return false
    }

    return true
  },

  async uploadImages() {
    const { attachments } = this.data.formData
    if (!attachments.length) {
      return []
    }

    try {
      const uploadTasks = attachments.map((file, index) => {
        const ext = (file.tempFilePath.split('.').pop() || 'jpg').toLowerCase()
        const cloudPath = `business_images/${Date.now()}_${index}.${ext}`
        return wx.cloud.uploadFile({
          cloudPath,
          filePath: file.tempFilePath
        })
      })

      const results = await Promise.all(uploadTasks)
      return results.map((item) => item.fileID)
    } catch (error) {
      console.error('上传图片失败：', error)
      throw error
    }
  },

  async onSubmit() {
    if (!this.validateForm()) {
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({
      title: '提交中...'
    })

    try {
      const user = await auth.ensureLoggedIn()
      if (!user) {
        this.showLoginRequiredModal()
        return
      }

      storage.saveLastFormData(this.data.formData)

      const imageUrls = await this.uploadImages()
      const calculatedCommission = commission.calculateCommission(this.data.formData.businessName)
      const submitResult = await wx.cloud.callFunction({
        name: 'businessData',
        data: {
          action: 'create',
          data: {
            date: new Date(this.data.formData.date),
            district: this.data.formData.district,
            gridAccount: this.data.formData.gridAccount.trim(),
            businessName: this.data.formData.businessName,
            userPhone: this.data.formData.userPhone,
            businessNumber: this.data.formData.userPhone,
            attachments: imageUrls,
            commission: calculatedCommission,
            source: 'form'
          }
        }
      })

      if (!submitResult.result || !submitResult.result.success) {
        throw new Error((submitResult.result && submitResult.result.error) || '提交失败')
      }

      wx.showToast({
        title: '提交成功',
        icon: 'success'
      })

      this.resetForm()
    } catch (error) {
      console.error('提交失败：', error)
      wx.showToast({
        title: '提交失败',
        icon: 'none'
      })
    } finally {
      this.setData({ submitting: false })
      wx.hideLoading()
    }
  },

  resetForm() {
    this.setData({
      formData: {
        date: this.formatDate(new Date()),
        district: this.data.currentUserDistrict || '',
        businessName: '',
        userPhone: '',
        gridAccount: this.data.currentUserGridAccount || '',
        attachments: []
      },
      estimatedCommission: 0,
      categoryIndex: -1,
      subcategoryIndex: -1,
      productIndex: -1,
      selectedCategory: '',
      selectedSubcategory: '',
      selectedProduct: '',
      subcategories: [],
      products: [],
      importResult: this.data.importResult
    })
  },

  onReset() {
    wx.showModal({
      title: '确认重置',
      content: '确定要清空当前表单内容吗？',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        this.resetForm()
        wx.showToast({
          title: '表单已重置',
          icon: 'success'
        })
      }
    })
  }
})
