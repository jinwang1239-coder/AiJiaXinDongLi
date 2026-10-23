Component({
  properties: { value: Object, scopeLabel: String, canExport: Boolean, exporting: Boolean },
  data: { exportScopes: ['全市'], exportScopeIndex: 0 },
  observers: {
    value(value) {
      const districts = value && Array.isArray(value.districts) ? value.districts.map(item => item.district) : []
      const selected = this.data.exportScopes[this.data.exportScopeIndex]
      const exportScopes = ['全市', ...districts]
      this.setData({ exportScopes, exportScopeIndex: Math.max(0, exportScopes.indexOf(selected)) })
    }
  },
  methods: {
    onExportScopeChange(e) { this.setData({ exportScopeIndex: Number(e.detail.value) || 0 }) },
    onExport() {
      if (!this.properties.canExport || this.properties.exporting) return
      this.triggerEvent('export', { district: this.data.exportScopeIndex ? this.data.exportScopes[this.data.exportScopeIndex] : '' })
    }
  }
})
