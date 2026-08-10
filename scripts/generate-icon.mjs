// 一次性工具：生成 public/icon-180.png（180×180 PNG 应用图标）。
// iOS 添加主屏幕只认 PNG，不支持 SVG。运行：node scripts/generate-icon.mjs
import { deflateSync, crc32 } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const SIZE = 180

// 深灰背景 + 4 个圆（红/绿/蓝/黄），与设计定位一致
function pixel(x, y) {
  const circles = [
    { cx: 60, cy: 60, rad: 22, color: [231, 76, 60] },
    { cx: 120, cy: 60, rad: 22, color: [46, 204, 113] },
    { cx: 60, cy: 120, rad: 22, color: [52, 152, 219] },
    { cx: 120, cy: 120, rad: 22, color: [241, 196, 15] },
  ]
  for (const c of circles) {
    const dx = x - c.cx
    const dy = y - c.cy
    if (dx * dx + dy * dy <= c.rad * c.rad) {
      return [...c.color, 255]
    }
  }
  return [51, 51, 51, 255]
}

// 原始 RGBA 数据，每行前加 filter byte 0
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = pixel(x, y)
    const off = y * (SIZE * 4 + 1) + 1 + x * 4
    raw[off] = r
    raw[off + 1] = g
    raw[off + 2] = b
    raw[off + 3] = a
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
ihdr[10] = 0 // compression
ihdr[11] = 0 // filter
ihdr[12] = 0 // interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

writeFileSync(new URL('../public/icon-180.png', import.meta.url), png)
console.log('generated public/icon-180.png', png.length, 'bytes')
