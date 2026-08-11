/**
 * 抠图 mask 工具：AI 分割输出（320x320 前景概率）上采样到源图像素级并二值化。
 * 与 convert.ts 的 resampleWithMask 配合：bgMask 语义为 1=背景。
 */

/**
 * 双线性上采样 1 通道 float mask（角点对齐：dst 角点映射到 src 角点）。
 * 1 像素宽的边退化为线性/常量插值。输出长度 dstW * dstH。
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
    const sy = srcH === 1 ? 0 : (y * (srcH - 1)) / (dstH - 1)
    const y0 = Math.floor(sy)
    const y1 = Math.min(y0 + 1, srcH - 1)
    const wy = sy - y0
    for (let x = 0; x < dstW; x++) {
      const sx = srcW === 1 ? 0 : (x * (srcW - 1)) / (dstW - 1)
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
