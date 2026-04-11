const GRID_DATA = [
  {
    district: '沙市区',
    grids: ['沙市区沙北网格', '沙市区观音垱网格', '沙市区江汉网格', '沙市区安良网格', '沙市区太岳网格']
  },
  {
    district: '荆州区',
    grids: ['城区弥市网格', '城区城南网格', '城区城北网格', '城区古城网格', '城区马山网格', '城区李埠网格']
  },
  {
    district: '开发区',
    grids: ['开发区联合网格', '开发区滩桥网格', '开发区东方网格']
  },
  {
    district: '洪湖',
    grids: ['洪湖新堤网格', '洪湖大同网格', '洪湖大沙网格', '洪湖滨湖网格', '洪湖曹市网格', '洪湖柏枝网格', '洪湖峰口网格']
  },
  {
    district: '监利',
    grids: ['监利玉沙网格', '监利新沟网格', '监利汪桥网格', '监利白螺网格', '监利龚场网格', '监利福田网格', '监利朱河网格', '监利容城网格', '监利汴河网格']
  },
  {
    district: '松滋',
    grids: ['松滋洈水网格', '松滋沙道观网格', '松滋陈店网格', '松滋刘家场网格', '松滋城南网格', '松滋纸厂河网格', '松滋城北网格']
  },
  {
    district: '公安',
    grids: ['公安南平网格', '公安孟家溪网格', '公安孱陵网格', '公安梅园网格', '公安埠河网格', '公安毛家港网格', '公安藕池网格']
  },
  {
    district: '江陵',
    grids: ['江陵白马网格', '江陵普济网格', '江陵新城网格', '江陵熊河网格']
  },
  {
    district: '石首',
    grids: ['石首团山网格', '石首江北网格', '石首笔架网格', '石首东升网格', '石首绣林网格']
  }
]

function getGridData() {
  return GRID_DATA.map(item => ({
    district: item.district,
    grids: item.grids.slice()
  }))
}

function getDistricts() {
  return GRID_DATA.map(item => item.district)
}

function getGridsByDistrict(district) {
  const match = GRID_DATA.find(item => item.district === district)
  return match ? match.grids.slice() : []
}

module.exports = {
  GRID_DATA,
  getGridData,
  getDistricts,
  getGridsByDistrict
}
