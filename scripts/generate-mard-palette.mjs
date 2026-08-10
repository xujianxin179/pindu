// 一次性工具：从 MARD拼豆221色色号清单.md 解析生成 src/domain/palette.ts 的 MARD_PALETTE。
// 运行：node scripts/generate-mard-palette.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const md = readFileSync(new URL('../MARD拼豆221色色号清单.md', import.meta.url), 'utf8').replace(/\r/g, '')
const entries = []
for (const line of md.split('\n')) {
  const m = line.match(/^- ([A-Z]\d+) · #([0-9A-Fa-f]{6})$/)
  if (m) {
    const [, id, hex] = m
    entries.push({
      id,
      name: id,
      rgb: {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      },
    })
  }
}

const lines = [
  "import type { ColorPalette } from './types'",
  '',
  '/**',
  ' * MARD 拼豆 221 色色板（ColorPalette）。',
  ' * 来源：HansBug/pindou-color-data（mard-221-alfonse-doudou，Alfonse + 豆豆工坊核对版）',
  ' * 注意：HEX 为屏幕参考近似值，严谨对色以实体色卡为准。',
  ' * 由 scripts/generate-mard-palette.mjs 从 MARD拼豆221色色号清单.md 生成，勿手改。',
  ' */',
  'export const MARD_PALETTE: ColorPalette = [',
  ...entries.map(
    (e) =>
      `  { id: '${e.id}', name: '${e.name}', rgb: { r: ${e.rgb.r}, g: ${e.rgb.g}, b: ${e.rgb.b} } },`,
  ),
  ']',
  '',
]

writeFileSync(new URL('../src/domain/palette.ts', import.meta.url), lines.join('\n'))
console.log(`generated MARD_PALETTE with ${entries.length} colors`)
