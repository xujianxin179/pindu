/**
 * AI 智能抠图：u2netp 轻量语义分割模型 + onnxruntime-web。
 * 输出源图像素级背景 mask（1=背景），与 convert 管线的 bgMask 语义一致。
 * 模型：rembg 发布的 u2netp.onnx（Apache-2.0，~4.5MB），
 * 输入 [1,3,320,320] NCHW float32（ImageNet 归一化）；输出 7 个 [1,1,320,320] tensor，
 * outputNames[0] 为最终融合 saliency map（值 [0,1] 已 sigmoid，1=前景）。
 */
import { binarizeToBackgroundMask, fillBackgroundHoles, upsampleMask } from './domain/mask'
import type { SourceImage } from './domain/types'

const MODEL_URL = '/models/u2netp.onnx'
const INPUT_SIZE = 320
/** 前景概率阈值：prob >= 0.5 判为前景。 */
const THRESHOLD = 0.5
/**
 * onnxruntime 的 wasm 文件路径前缀。loader 默认从脚本 URL 推断（vite 预构建后
 * 指向 node_modules，dev/prod 都会 404 拿到 HTML 导致 wasm 编译失败），
 * 显式指向 /ort-wasm/（src/ort-wasm/ 由 vite 插件 serve/复制，见 vite.config.ts；
 * 文件与 package.json 版本同步，升级 onnxruntime-web 时需重新复制 jsep 两个文件）。
 */
const WASM_PATHS = '/ort-wasm/'
/**
 * 空洞填充最小面积（占图面积比例）：内部洞面积 >= 该值才填。
 * 小洞保留为细节（眼睛/花纹/文字等，u2netp 常把主体内与背景同色的
 * 细节区标为背景）；约 40x40 网格下 0.25% ≈ 4 格，属明显镂空才填。
 */
const HOLE_MIN_AREA_RATIO = 0.0025

let ortModule: typeof import('onnxruntime-web') | null = null
let sessionPromise: Promise<import('onnxruntime-web').InferenceSession> | null = null

/** mask 缓存：key = 图内容哈希（width×height 像素 RGB），命中跳过重复推理。 */
const maskCache = new Map<string, Uint8Array | 'failed'>()

/** 图内容指纹：尺寸 + 全部像素 RGB（字符串拼接）。 */
function imageKey(image: SourceImage): string {
  return `${image.width}x${image.height}:${image.pixels.map((p) => p.r << 16 | p.g << 8 | p.b).join(',')}`
}

/** 单例加载模型（首次调用创建，后续复用；失败后重置以便下次重试）。 */
function getSession(): Promise<import('onnxruntime-web').InferenceSession> {
  if (!sessionPromise) {
    // 动态导入：onnxruntime-web 较大（~600KB），只在首次抠图时加载
    sessionPromise = import('onnxruntime-web')
      .then((ort) => {
        ortModule = ort
        ort.env.wasm.wasmPaths = WASM_PATHS // 必须在 create 前设置
        return ort.InferenceSession.create(MODEL_URL)
      })
      .catch((err) => {
        sessionPromise = null // 失败后允许下次调用重试
        ortModule = null
        throw err
      })
  }
  return sessionPromise
}

/**
 * 预处理：最近邻采样拉伸到 INPUT_SIZE 方图（与训练一致，非保比），
 * ImageNet 归一化（/255 -> (x - mean) / std），CHW 布局。
 */
function preprocess(image: SourceImage): Float32Array {
  const { width, height, pixels } = image
  const out = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE)
  const MEAN = [0.485, 0.456, 0.406]
  const STD = [0.229, 0.224, 0.225]
  for (let gy = 0; gy < INPUT_SIZE; gy++) {
    const sy = Math.min(height - 1, Math.floor((gy * height) / INPUT_SIZE))
    for (let gx = 0; gx < INPUT_SIZE; gx++) {
      const sx = Math.min(width - 1, Math.floor((gx * width) / INPUT_SIZE))
      const p = pixels[sy * width + sx]
      const i = gy * INPUT_SIZE + gx
      out[i] = (p.r / 255 - MEAN[0]) / STD[0]
      out[INPUT_SIZE * INPUT_SIZE + i] = (p.g / 255 - MEAN[1]) / STD[1]
      out[2 * INPUT_SIZE * INPUT_SIZE + i] = (p.b / 255 - MEAN[2]) / STD[2]
    }
  }
  return out
}

/**
 * AI 智能抠图：返回源图像素级背景 mask（Uint8Array，1=背景）。
 * 模型推理（wasm）在异步线程执行，首次调用需加载模型（~4.5MB，之后缓存复用）。
 * 结果按图内容缓存：同一张图重复调用（如切换抠图模式）直接返回缓存，不再推理。
 * 失败（模型加载失败等）也缓存为 'failed'，避免每次切换都重试。
 */
export async function generateBackgroundMask(image: SourceImage): Promise<Uint8Array> {
  const key = imageKey(image)
  const cached = maskCache.get(key)
  if (cached !== undefined) {
    if (cached === 'failed') throw new Error('AI 抠图失败（已缓存）')
    return cached
  }
  try {
    const session = await getSession()
    const ort = ortModule!
    const input = preprocess(image)
    const feeds = {
      [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]),
    }
    const out = await session.run(feeds)
    // outputNames[0] = 最终融合 saliency map（已 sigmoid），1=前景
    const prob = out[session.outputNames[0]].data as Float32Array
    const upsampled = upsampleMask(prob, INPUT_SIZE, INPUT_SIZE, image.width, image.height)
    const binarized = binarizeToBackgroundMask(upsampled, THRESHOLD)
    // 空洞填充：AI 在主体内部产生的孤立背景区域按面积处理——大面积误判镂空
    // 翻转为前景（保证图案整体连通），小面积保留为细节（u2netp 对主体内与
    // 背景同色的细节区易漏标，全填会丢失眼睛/花纹等特征）
    const mask = fillBackgroundHoles(
      binarized,
      image.width,
      image.height,
      Math.round(image.width * image.height * HOLE_MIN_AREA_RATIO),
    )
    maskCache.set(key, mask)
    return mask
  } catch (err) {
    maskCache.set(key, 'failed')
    throw err
  }
}

/**
 * 已缓存 mask 查询：图命中缓存返回 mask（含 'failed'），未命中返回 null。
 * App 切换抠图模式时先查缓存，命中立即转换，不命中才显示加载态。
 */
export function getCachedMask(image: SourceImage): Uint8Array | 'failed' | null {
  return maskCache.get(imageKey(image)) ?? null
}
