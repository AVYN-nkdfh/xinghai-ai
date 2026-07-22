# 星海工作室机位预约｜生产验收 v1.1

更新时间：2026-07-22

## 已通过

- [x] Neon PostgreSQL 已连接生产、预览和开发环境。
- [x] 正式预约接口可创建预约。
- [x] 管理接口登录后可读取预约并取消。
- [x] 测试预约已取消，正式机位已释放。
- [x] 未登录管理接口受服务端鉴权保护。

## 本轮失败证据

- [x] 正式截图发现日期、时段、机器内容为空。
- [x] 根因确认：`/booking` 页面中的 `./booking.js` 被解析为不存在的 `/booking.js`。
- [x] 路由复查发现 `/booking/` 被规范到 `/booking` 后，只有目录索引产物时 CDN 返回 404。

## 修复后必须通过

- [x] `npm run build` 成功。
- [x] 构建同时生成 `dist/booking.html` 与 `dist/booking/booking.js`。
- [x] `/booking/` 最终跳转到 `/booking`，返回 200。
- [x] 正式 `/booking/booking.js` 返回 200 和 JavaScript。
- [x] 正式截图显示 7 个日期、3 个时段和 6 台机器。
- [x] 家长端可用性接口返回 3 个时段且无测试预约残留。
- [x] 管理端登录接口返回成功；未登录状态接口返回 401。
- [x] 家长端截图：`prototype/screenshots/production-parent.png`。
- [x] 后台登录截图：`prototype/screenshots/production-admin-login-20260722.png`。

## 发布结果

- 正式地址：`https://xinghai-ai.com/booking`
- Vercel deployment：`dpl_9sBAim6LApZfgBYRBTvCzAQRdVWu`
- 生产数据：测试预约已取消，2026-07-23 三个时段均无测试占位残留。
