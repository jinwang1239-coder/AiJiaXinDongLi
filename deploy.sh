#!/bin/bash
# 云函数部署脚本
# 此脚本需要在微信开发者工具的终端中运行

echo "开始部署微信小程序云函数..."

# 云开发环境ID
CLOUD_ENV="cloud1-1g65i23w93c28d35"

echo "云开发环境: $CLOUD_ENV"

# 云函数列表
FUNCTIONS=("userManagement" "businessData" "fileUpload")

echo "准备部署以下云函数："
for func in "${FUNCTIONS[@]}"
do
    echo "- $func"
done

# 提示用户手动操作
echo ""
echo "请按以下步骤在微信开发者工具中手动部署："
echo ""

for func in "${FUNCTIONS[@]}"
do
    echo "部署 $func:"
    echo "1. 右键点击 cloudfunctions/$func/ 文件夹"
    echo "2. 选择 '创建并部署：云端安装依赖'"
    echo "3. 等待部署完成"
    echo ""
done

echo "部署完成后，请创建以下数据库集合："
echo "- users (用户信息表)"
echo "- business_records (业务记录表)"
echo ""
echo "数据库权限设置为：仅创建者可读写"
echo ""
echo "最后运行 test.js 中的测试脚本验证功能。"
