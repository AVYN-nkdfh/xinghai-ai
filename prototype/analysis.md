# 星海工作室机位预约｜上线修复分析 v1.1

更新时间：2026-07-22

## 结论

Neon PostgreSQL 已连接，生产接口能够创建、读取和取消预约。正式页面截图显示只有静态外壳，日期、时段和座位图未渲染。

## 根因

Vercel 的 clean URL 将 `/booking/` 规范为 `/booking`。HTML 使用 `./booking.js` 时，浏览器会请求根目录 `/booking.js`，而真实资源位于 `/booking/booking.js`，导致前端脚本没有执行。

继续验证确认：构建只生成 `dist/booking/index.html` 时，当前 Vercel CDN 对最终无尾斜杠地址 `/booking` 返回 404。因此需要同时生成 `dist/booking.html`，让 clean URL 直接映射。

## 最小修复

将脚本引用改为站点绝对路径 `/booking/booking.js`，并在构建阶段复制生成 `dist/booking.html`。不改 CSS、交互、API、数据库结构或页面文案。

## 数据与安全

- 预约数据存入 Neon PostgreSQL，不使用浏览器本地存储。
- 家长查询只返回占位状态；姓名和手机号只在管理员鉴权后返回。
- 管理员使用 HttpOnly 会话 Cookie，数据库连接和密码只存于 Vercel 环境变量。

## 验证方式

1. 本地构建。
2. 正式部署。
3. 检查 `/booking/booking.js` 返回 JavaScript。
4. 浏览器截图确认日期、时段和 6 台机器全部渲染。
5. 检查线上可用性接口与后台鉴权。

本轮使用既有原型和正式官网作为参考对象，不引入新的设计参考。
