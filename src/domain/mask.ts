/**
 * 抠图 mask 工具：AI 分割输出（320x320 前景概率）上采样到源图像素级并二值化。
 * 与 convert.ts 的 resampleWithMask 配合：bgMask 语义为 1=背景。
 */

/**
 * 双线性上采样 1 通道 float mask（角点对齐：dst 角点映射到 src 角点）。
 * 任一侧为 1 像素时退化为线性/常量插值。输出长度 dstW * dstH。
 */
export function upsampleMask(
  mask: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  const out = new Float32Array(dstW * dstH)
  for (let y = 0; y < dstH; y++) {
    const sy = srcH === 1 || dstH === 1 ? 0 : (y * (srcH - 1)) / (dstH - 1)
    const y0 = Math.floor(sy)
    const y1 = Math.min(y0 + 1, srcH - 1)
    const wy = sy - y0
    for (let x = 0; x < dstW; x++) {
      const sx = srcW === 1 || dstW === 1 ? 0 : (x * (srcW - 1)) / (dstW - 1)
      const x0 = Math.floor(sx)
      const x1 = Math.min(x0 + 1, srcW - 1)
      const wx = sx - x0
      const v00 = mask[y0 * srcW + x0]
      const v01 = mask[y0 * srcW + x1]
      const v10 = mask[y1 * srcW + x0]
      const v11 = mask[y1 * srcW + x1]
      out[y * dstW + x] =
        v00 * (1 - wx) * (1 - wy) + v01 * wx * (1 - wy) + v10 * (1 - wx) * wy + v11 * wx * wy
    }
  }
  return out
}

/**
 * 前景概率二值化为背景 mask：prob >= threshold 为前景（0），否则背景（1）。
 * 输出与 convert 管线的 bgMask 语义一致（1=背景，长度不变）。
 */
export function binarizeToBackgroundMask(prob: Float32Array, threshold: number): Uint8Array {
  const out = new Uint8Array(prob.length)
  for (let i = 0; i < prob.length; i++) {
    out[i] = prob[i] >= threshold ? 0 : 1
  }
  return out
}

/**
 * 空洞填充：把"不与图像边缘连通的背景区域"翻转为前景（0）。
 * 只保留与边缘连通的背景（真实外围背景），主体内部被前景包围的背景洞全部填掉，
 * 保证抠图主体内部无空洞、图案整体连通。从边缘背景像素做 BFS（连通域），
 * 未达的背景像素即空洞。原地返回新 mask，输入不变。
 */
export function fillBackgroundHoles(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length)
  if (mask.length === 0) return out
  // 连通标记：1=与边缘连通的背景像素；队列上界同 flood fill（每像素最多被 4 邻居各推一次 + 边缘种子）
  const connected = new Uint8Array(mask.length)
  const queue = new Uint32Array(mask.length * 4 + 2 * (width + height))
  let head = 0
  let tail = 0
  const push = (i: number) => {
    queue[tail++] = i
  }
  // 种子：四条边上的背景像素
  for (let x = 0; x < width; x++) {
    if (mask[x] === 1) push(x)
    if (mask[(height - 1) * width + x] === 1) push((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y++) {
    if (mask[y * width] === 1) push(y * width)
    if (mask[y * width + width - 1] === 1) push(y * width + width - 1)
  }
  while (head < tail) {
    const idx = queue[head++]
    if (connected[idx]) continue
    connected[idx] = 1
    const x = idx % width
    const y = (idx - x) / width
    const tryPush = (to: number) => {
      if (!connected[to] && mask[to] === 1) push(to)
    }
    if (x > 0) tryPush(idx - 1)
    if (x < width - 1) tryPush(idx + 1)
    if (y > 0) tryPush(idx - width)
    if (y < height - 1) tryPush(idx + width)
  }
  for (let i = 0; i < mask.length; i++) {
    out[i] = connected[i] ? 1 : 0
  }
  return out
}
