# 02 - 转换参数控制

**What to build:** 参数面板控制网格尺寸、用色数上限、抖动开关；改任一参数后重新转换并刷新 Pattern 预览。转换管线接受 params，实现在用色数上限内从 ColorPalette 选出最能还原图的子集作为 Active Palette，以及抖动开关（默认关）。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] 参数面板可设定网格尺寸（宽×高，或长边珠数按图片宽高比算另一边）
- [ ] 参数面板可设定用色数上限
- [ ] 参数面板可开关抖动，默认关
- [ ] 转换管线接受 params，在用色数上限内从 ColorPalette 选出最能还原图的子集作为 Active Palette
- [ ] 抖动开时做误差扩散，关时每格独立最近邻映射
- [ ] 改任一参数后重新转换并刷新 Pattern 预览
- [ ] 不同参数组合有快照测试
