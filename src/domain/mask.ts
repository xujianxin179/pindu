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
 * 前景膨胀：把前景（0）向 4-邻域扩张 1px，背景（非 0）反向收缩 1px。
 * 输入三态 mask（0=前景，1=外部背景，2=内部细节），输出同态三态。
 * 用于 AI 低分辨率（320x320）二值化后：模型在主体边界概率模糊，
 * 0.5 阈值会切掉贴边部位/头发/半透明边缘；膨胀一圈把边界糊区拉回前景，
 * 上采样放大后等价于源图 1-3px，贴边主体不再被误抠。原地返回新 mask。
 */
export function dilateForeground(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length)
  if (mask.length === 0) return out
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      // 前景像素本身保留；背景像素若 4-邻域有前景则被扩张为前景
      if (mask[i] === 0) {
        out[i] = 0
        continue
      }
      let hasFg = false
      if (x > 0 && mask[i - 1] === 0) hasFg = true
      if (x < width - 1 && mask[i + 1] === 0) hasFg = true
      if (y > 0 && mask[i - width] === 0) hasFg = true
      if (y < height - 1 && mask[i + width] === 0) hasFg = true
      out[i] = hasFg ? 0 : mask[i]
    }
  }
  return out
}

/**
 * 空洞填充：把"不与图像边缘连通的背景区域"按面积处理。
 * 边缘连通背景（真实外围背景）一律保留为 1；
 * 内部洞（被前景包围的背景区域）：面积 >= minArea 的填为前景（0），
 * 面积 < minArea 的标记为细节（2）——小洞是主体细节（眼睛/花纹/文字），
 * 大洞才是误判镂空。输出三态 mask：0=前景、1=外部背景、2=内部细节洞。
 * minArea=0 时所有洞都填（退化为二态）。从边缘背景像素做 BFS 连通域，
 * 原地返回新 mask，输入不变。
 */
export function fillBackgroundHoles(
  mask: Uint8Array,
  width: number,
  height: number,
  minArea = 0,
): Uint8Array {
  const out = new Uint8Array(mask.length) // 0=前景，默认全填
  if (mask.length === 0) return out
  // 访问标记：1=已属于某连通域（边缘连通域或已处理的洞）
  const visited = new Uint8Array(mask.length)
  // 队列上界同 flood fill（每像素最多被 4 邻居各推一次 + 边缘种子）
  const queue = new Uint32Array(mask.length * 4 + 2 * (width + height))
  let head = 0
  let tail = 0
  const push = (i: number) => {
    queue[tail++] = i
  }
  // 阶段 1：从四条边上的背景像素 BFS，标记并保留边缘连通背景（1）
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
    if (visited[idx]) continue
    visited[idx] = 1
    out[idx] = 1
    const x = idx % width
    const y = (idx - x) / width
    const tryPush = (to: number) => {
      if (!visited[to] && mask[to] === 1) push(to)
    }
    if (x > 0) tryPush(idx - 1)
    if (x < width - 1) tryPush(idx + 1)
    if (y > 0) tryPush(idx - width)
    if (y < height - 1) tryPush(idx + width)
  }
  // 阶段 2：每个内部洞 BFS 计数（复用 queue），按面积决定填（0）/细节（2）
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1 && !visited[i]) {
      head = 0
      tail = 0
      queue[tail++] = i
      visited[i] = 1
      while (head < tail) {
        const idx = queue[head++]
        const x = idx % width
        const y = (idx - x) / width
        const tryPush = (to: number) => {
          if (!visited[to] && mask[to] === 1) {
            visited[to] = 1
            queue[tail++] = to
          }
        }
        if (x > 0) tryPush(idx - 1)
        if (x < width - 1) tryPush(idx + 1)
        if (y > 0) tryPush(idx - width)
        if (y < height - 1) tryPush(idx + width)
      }
      if (tail < minArea) {
        // 小洞：标记为细节（2），转换时按自身颜色量化成珠子；大洞：out 保持 0（已填）
        for (let k = 0; k < tail; k++) out[queue[k]] = 2
      }
    }
  }
  return out
}
