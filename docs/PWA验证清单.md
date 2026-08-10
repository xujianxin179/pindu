# PWA 离线验证清单

对应 ticket 09（离线 PWA）的验收标准：service worker 缓存应用资源、iPad Safari 添加到主屏后离线可用（含作品库本地数据）、缓存策略不阻塞新版本生效。

SW 行为只能在真实浏览器验证（node 测试环境模拟不了），以下为**部署后手动验证步骤**。验证通过前，ticket 09 的 AC2 视为未闭环。

## 前置

1. `npm run build` 后确认 `dist/sw.js` 与 `dist/manifest.webmanifest` 存在（预缓存 11 项）。
2. 把 `dist/` 部署到 HTTPS 地址（SW 只在 secure context 生效；本地可用 `vite preview` + localhost 代替）。

## 验证步骤

### 1. SW 注册与资源缓存

- [ ] 打开应用，DevTools（或 Safari Web Inspector）确认 service worker 已注册并激活
- [ ] Network 面板确认首次访问后静态资源（js/css/png）已进 Cache Storage（`workbox-*` 缓存）

### 2. 离线可用

- [ ] 完全断网（飞行模式 / DevTools offline），**刷新页面**仍能打开应用
- [ ] 断网下导入一张图片 → 转图案 → 编辑 → 出图纸，核心流水线可用
- [ ] 断网下保存一个作品 → 刷新 → 作品库仍能列出并打开（IndexedDB 数据在）

### 3. 主屏图标

- [ ] iPad Safari 添加到主屏幕：图标显示为深灰底 4 色圆（PNG），非截图缩略
- [ ] 从主屏图标启动：独立窗口（standalone），无 Safari 地址栏

### 4. 新版本生效（autoUpdate）

- [ ] 重新部署新版 → 旧页面刷新后拿到新版本（SW autoUpdate 接管，无需手动清缓存）

## 已知限制（ADR-0001）

- 首次访问必须在线（SW 需先注册才能离线）
- 无后台推送；不是"完全离线启动"的 app
