# 星海工作室机位预约｜生产验收 v1.2

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

## v1.1 发布结果

- 正式地址：`https://xinghai-ai.com/booking`
- Vercel deployment：`dpl_9sBAim6LApZfgBYRBTvCzAQRdVWu`
- 生产数据：测试预约已取消，2026-07-23 三个时段均无测试占位残留。

## v1.2 本地与接口验收

- [x] 家长可选择任意 1–3 个当天时段，并有“全选当天”。
- [x] 座位图只允许选择在全部所选时段均空闲的机器。
- [x] 多时段预约全部成功或全部失败，后台可整组取消。
- [x] 管理员可维护当前时段、今天全部时段和长期维护。
- [x] 长期维护中的机器在所有日期和时段均不可预约，恢复后重新可用。
- [x] 上午、下午、晚间之间切换只改变本地选择状态，无加载遮挡。
- [x] 冷启动建表迁移合并为一次数据库事务。
- [x] 生产同结构数据库回归通过，测试预约和维护状态已清理。
- [x] 本地浏览器截图：`prototype/screenshots/booking-multi-slot.png`。
- [x] 本地后台截图：`prototype/screenshots/admin-long-term-maintenance.png`。

## v1.2 生产待验收

- [ ] 正式页面多时段选择与长期维护界面已更新。
- [ ] 正式接口回归通过且测试数据已清理。
- [ ] 保存正式家长端与管理端截图。
