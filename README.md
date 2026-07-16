# 光遇陪玩团 - 前端网站

> 温暖相遇 · 快乐同行 · 专业陪玩

## 📁 项目结构

`
frontend/
├── index.html              # 主页（宣传画面）
├── pages/
│   ├── order.html          # 点单大厅
│   ├── vip.html            # 会员中心
│   ├── recharge.html       # 充值中心
│   ├── profile.html        # 个人中心
│   ├── join.html           # 加入团队
│   └── mobile.html         # 移动端适配页
├── css/
│   ├── style.css           # 全局样式
│   ├── order.css           # 点单大厅样式
│   ├── vip.css             # 会员中心样式
│   ├── recharge.css        # 充值中心样式
│   ├── profile.css         # 个人中心样式
│   ├── join.css            # 加入团队样式
│   └── mobile.css          # 移动端样式
├── js/
│   ├── main.js             # 全局交互逻辑
│   ├── order.js            # 点单大厅交互
│   ├── vip.js              # 会员中心交互
│   ├── recharge.js         # 充值中心交互
│   ├── profile.js          # 个人中心交互
│   ├── join.js             # 加入团队交互
│   └── mobile.js           # 移动端交互
└── images/                 # 图片资源目录
`

## 🎨 设计风格

- **主题色**: 天空蓝 (#4FC3F7) + 暖金色 (#FFD54F)
- **视觉风格**: 温暖、梦幻、治愈
- **UI元素**: 圆角卡片、渐变背景、微动效
- **字体**: 系统默认字体栈，中文优先

## 📱 多端适配

| 平台 | 开发工具 | 说明 |
|------|----------|------|
| PC端 | Visual Studio | 完整功能，桌面端体验 |
| 网页端 | Sublime Text 3 | PC + 移动端自适应 |
| 移动端 | HBuilderX | Android/iOS APP |

## 🚀 快速开始

1. 使用 **Sublime Text 3** 打开 rontend/ 文件夹
2. 直接在浏览器中打开 index.html 即可预览
3. 或使用 Live Server 插件获得实时预览

## ✨ 功能模块

### 1. 主页 (index.html)
- 宣传画面（星空渐变背景 + 粒子动画）
- 平台特色展示
- 人气陪玩推荐
- 用户评价
- 下载引导

### 2. 点单大厅 (order.html)
- 陪玩搜索与筛选
- 服务分类浏览
- 在线/离线状态显示
- 价格排序
- 一键下单

### 3. 会员中心 (vip.html)
- 会员等级对比
- 会员特权展示
- 在线开通会员
- 多周期选择

### 4. 充值中心 (recharge.html)
- 账户余额查询
- 多档充值方案
- 自定义充值
- 支付记录

### 5. 个人中心 (profile.html)
- 用户信息展示
- 数据统计面板
- 功能菜单导航
- 最近订单

### 6. 加入团队 (join.html)
- 团队介绍
- 申请条件说明
- 申请流程展示
- 在线申请表单

### 7. 移动端 (mobile.html)
- 响应式布局
- 侧边栏导航
- 底部Tab栏
- 横向滚动卡片
- 触摸轮播

## 🔧 技术栈

- **HTML5** - 语义化标签
- **CSS3** - Flexbox/Grid布局、CSS变量、动画
- **JavaScript (ES6+)** - 原生交互逻辑
- **Font Awesome 6** - 图标库
- **CDN加载** - 无需本地依赖

## 📝 开发说明

### 修改配色
编辑 css/style.css 中的 CSS 变量：
`css
:root {
    --primary: #4FC3F7;       /* 主色调 */
    --secondary: #FFD54F;     /* 辅色调 */
    --accent: #FF8A65;        /* 强调色 */
}
`

### 添加新陪玩
在 pages/order.html 的 .list-grid 中添加卡片：
`html
<div class=\"wizard-list-card\" 
     data-category=\"run\" 
     data-price=\"29.9\" 
     data-rating=\"5.0\" 
     data-orders=\"100\" 
     data-online=\"true\" 
     data-type=\"vip\">
    ...
</div>
`

### 移动端适配
- 使用 mobile.html 作为移动端入口
- HBuilderX 打包时引用此页面
- 自动适配各种屏幕尺寸

## 📄 许可证

本系统仅供学习和交流使用。

---

**光遇陪玩团** © 2026 | 温暖相遇，快乐同行
