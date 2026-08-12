// 一次性截图脚本：验证 pinDu 的钉板工作台视觉。
// 运行：node scripts/screenshot.mjs
import { chromium } from 'playwright'

// 起 dev server 供截图
const { spawn } = await import('node:child_process')
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5199'], {
  cwd: process.cwd(),
  stdio: 'pipe',
})
await new Promise((r) => setTimeout(r, 2500))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })

try {
  await page.goto('http://localhost:5199', { waitUntil: 'networkidle' })

  // 初始态截图（空作品库 + 提示）
  await page.screenshot({ path: 'scripts/shot-empty.png' })

  // 构造示例图案：模拟导入一张渐变图（通过 file input 不好注入，改用页面内构造）
  // 直接调用 convert 逻辑太侵入；改用 canvas 造一张图 -> File -> input
  await page.evaluate(async () => {
    // 造一张 80x60 的渐变图
    const cv = document.createElement('canvas')
    cv.width = 80
    cv.height = 60
    const ctx = cv.getContext('2d')
    if (!ctx) return
    for (let x = 0; x < 80; x++) {
      for (let y = 0; y < 60; y++) {
        ctx.fillStyle = `hsl(${(x / 80) * 360}, 60%, ${30 + (y / 60) * 50}%)`
        ctx.fillRect(x, y, 1, 1)
      }
    }
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'))
    const file = new File([blob], 'gradient.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    const input = document.querySelector('input[type="file"]')
    Object.defineProperty(input, 'files', { value: dt.files })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })

  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'scripts/shot-board.png' })

  // 点击第一个算色 chip，验证高亮效果
  const chip = page.locator('.count-chip').first()
  if (await chip.count()) {
    await chip.click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: 'scripts/shot-highlight.png' })
  }

  // 导出图纸截图：直接调 renderSheetToCanvas，验证清单横向排列 + 色号反色字 + 辅助线实虚交替
  const sheetDataUrl = await page.evaluate(async () => {
    const { renderSheetToCanvas } = await import('/src/sheet-export.ts')
    const { MARD_PALETTE } = await import('/src/domain/palette.ts')
    const ids = MARD_PALETTE.slice(0, 10).map((e) => e.id)
    const width = 24
    const height = 10
    const cells = Array.from({ length: width * height }, (_, i) => ids[i % ids.length])
    const result = { pattern: { width, height, cells }, activePalette: ids }
    const cv = document.createElement('canvas')
    renderSheetToCanvas(cv, result, MARD_PALETTE, null)
    return cv.toDataURL('image/png')
  })
  const { writeFileSync } = await import('node:fs')
  writeFileSync('scripts/shot-sheet.png', Buffer.from(sheetDataUrl.split(',')[1], 'base64'))
} finally {
  await browser.close()
  server.kill()
}
console.log('screenshots saved')
