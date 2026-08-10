# 07 - 分享

**What to build:** 通过 Web Share API 分享图纸（PNG 或 PDF），浏览器不支持时降级为下载文件；与导出共用同一份渲染产物。

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] 调用 `navigator.share` 分享图纸（PNG 或 PDF）
- [ ] 浏览器不支持 Web Share API 时，降级为下载文件
- [ ] 分享与导出共用同一份渲染产物，不重复渲染
