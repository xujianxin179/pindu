# 技术栈：采用 PWA（Web）而非原生

开发者环境为 Windows、不熟悉 Swift，且本应用为自用、不发布到 App Store。原生（SwiftUI）需要 Mac + Xcode；Flutter / React Native 虽能在 Windows 写代码，但编译 iOS 仍需 Mac 或云构建服务，且 iOS 自用还需解决签名（免费签名 7 天失效，或 $99/年开发者账号）。决定采用 PWA：用 Web 技术开发，iPad 上通过 Safari"添加到主屏幕"使用，零 Mac 依赖、零签名成本，WebGL/Canvas 足以承担 221 色量化与抖动的计算量。

## Considered Options

- **SwiftUI 原生**：性能与体验最佳，但需 Mac + Xcode、需学 Swift，被 Windows 环境直接否决。
- **Flutter / React Native + 云构建**：可在 Windows 写代码，但 iOS 编译仍需 Mac 或云构建，且要处理签名；自用场景成本高于收益。
- **PWA（Web）**：零 Mac、零签名、Windows 开发最便利，性能满足需求。被采纳。

## Consequences

- 不是 App Store app，是主屏网页应用，无后台推送、不能完全离线启动。
- 系统分享用 Web Share API（iOS Safari 支持但不如原生完整），备选直接下载文件。
- 本地数据存 IndexedDB。
- 目标浏览器为 iPad Safari，其余浏览器可用但不保证。
