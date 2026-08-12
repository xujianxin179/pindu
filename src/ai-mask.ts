/**
 * AI 智能抠图：u2netp 轻量语义分割模型 + onnxruntime-web。
 * 输出源图像素级背景 mask（1=背景），与 convert 管线的 bgMask 语义一致。
 * 模型：rembg 发布的 u2netp.onnx（Apache-2.0，~4.5MB），
 * 输入 [1,3,320,320] NCHW float32（ImageNet 归一化）；输出 7 个 [1,1,320,320] tensor，
 * outputNames[0] 为最终融合 saliency map（值 [0,1] 已 sigmoid，1=前景）。
 */
import { binarizeToBackgroundMask, dilateForeground, fillBackgroundHoles, upsampleMask } from './domain/mask'
import { MaskCache, imageKey } from './domain/mask-cache'
import type { BackgroundMask } from './domain/mask'
import type { SourceImage } from './domain/types'

const MODEL_URL = '/models/u2netp.onnx'
const INPUT_SIZE = 320
/** 前景概率阈值：prob >= 阈值判为前景。u2netp 背景概率通常 <0.1，降到 0.4 保住边界糊区（prob 0.4-0.5），几乎不增加背景残留。 */
const THRESHOLD = 0.4
/**
 * onnxruntime 的 wasm 文件路径前缀。loader 默认从脚本 URL 推断（vite 预构建后
 * 指向 node_modules，dev/prod 都会 404 拿到 HTML 导致 wasm 编译失败），
 * 显式指向 /ort-wasm/v2/（src/ort-wasm/ 由 vite 插件 serve/复制，见 vite.config.ts）。
 * v2：CPU 变体 ort-wasm-simd-threaded.mjs/wasm（13.5MB，兼容所有设备），
 * 不用 jsep/GPU（移动端 GPU 支持差）。v2 子目录同时用于绕过旧 PWA
 * ai-assets 缓存（CacheFirst 缓存了 gzip 版 wasm，URL 不变则永远命中旧数据）。
 * 文件与 package.json 版本同步，升级 onnxruntime-web 时需重新复制。
 */
const WASM_PATHS = '/ort-wasm/v2/'

// 强制 CPU 执行：不使用 WebGPU/WebGL（jsep），避免移动端初始化失败
// onnxruntime-web 默认优先 jsep，这里显式禁用 webgpu 让 wasm 后端兜底
/**
 * 空洞填充最小面积（占图面积比例）：内部洞面积 >= 该值才填。
 * 小洞保留为细节（眼睛/花纹/文字等，u2netp 常把主体内与背景同色的
 * 细节区标为背景）；约 40x40 网格下 0.25% ≈ 4 格，属明显镂空才填。
 */
const HOLE_MIN_AREA_RATIO = 0.0025

let ortModule: typeof import('onnxruntime-web') | null = null
let sessionPromise: Promise<import('onnxruntime-web').InferenceSession> | null = null

/** AI 抠图结果：ok 携带 mask，failed 携带错误信息（替换 'failed' 字符串 sentinel）。 */
export type MaskResult =
  | { status: 'ok'; mask: BackgroundMask }
  | { status: 'failed'; error: string }

/** mask 缓存：key = 图内容哈希（FNV-1a，LRU 驱逐）。可注入（测试用空缓存验证命中/驱逐）。 */
export const maskCache = new MaskCache()

/** 单例加载模型（首次调用创建，后续复用；失败后重置以便下次重试）。 */
function getSession(): Promise<import('onnxruntime-web').InferenceSession> {
  if (!sessionPromise) {
    // 动态导入 onnxruntime-web 的 CPU wasm 后端（'onnxruntime-web/wasm'）：
    // 1) 包较大（~600KB），只在首次抠图时加载
    // 2) 默认入口（ort.bundle.min.mjs）优先 jsep/WebGPU（GPU 加速），移动端
    //    GPU 支持差导致初始化失败；wasm 后端纯 CPU 兼容所有设备
    sessionPromise = import('onnxruntime-web/wasm')
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
 * AI 智能抠图：返回源图像素级三态背景 mask（前景/外部背景/内部细节洞，语义见 domain/mask）。
 * 模型推理（wasm）在异步线程执行，首次调用需加载模型（~4.5MB，之后缓存复用）。
 * 结果按图内容缓存：同一张图重复调用（如切换抠图模式）直接返回缓存，不再推理。
 * 失败（模型加载失败等）缓存为 failed 结果，避免每次切换都重试；不再 throw。
 */
export async function generateBackgroundMask(image: SourceImage): Promise<MaskResult> {
  const key = imageKey(image)
  const cached = maskCache.get(key)
  if (cached !== undefined) return cached
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
    // 前景膨胀 1px（低分辨率下做，放大后等价源图 1-3px）：主体边界概率模糊，
    // 贴边部位/头发/半透明边缘易被 0.4 阈值切掉，膨胀把边界糊区拉回前景
    const dilated = dilateForeground(binarized, image.width, image.height)
    // 空洞填充：AI 在主体内部产生的孤立背景区域按面积处理——大面积误判镂空
    // 翻转为前景（0，保证图案整体连通），小面积标记为细节（2，转换时按自身
    // 颜色量化成珠子，u2netp 对主体内与背景同色的细节区易漏标）
    const mask = fillBackgroundHoles(
      dilated,
      image.width,
      image.height,
      Math.round(image.width * image.height * HOLE_MIN_AREA_RATIO),
    )
    const result: MaskResult = { status: 'ok', mask }
    maskCache.set(key, result)
    return result
  } catch (err) {
    const result: MaskResult = { status: 'failed', error: String(err) }
    maskCache.set(key, result)
    return result
  }
}

/**
 * 已缓存 mask 查询：图命中缓存返回 MaskResult（ok 携带 mask / failed 携带错误），未命中返回 null。
 * App 切换抠图模式时先查缓存，命中立即转换，不命中才显示加载态。
 */
export function getCachedMask(image: SourceImage): MaskResult | null {
  return maskCache.get(imageKey(image)) ?? null
}
