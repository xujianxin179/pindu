/**
 * AI 智能抠图：u2netp 轻量语义分割模型 + onnxruntime-web。
 * 输出源图像素级背景 mask（1=背景），与 convert 管线的 bgMask 语义一致。
 * 模型：rembg 发布的 u2netp.onnx（Apache-2.0，~4.5MB），
 * 输入 [1,3,320,320] NCHW float32（ImageNet 归一化）；输出 7 个 [1,1,320,320] tensor，
 * outputNames[0] 为最终融合 saliency map（值 [0,1] 已 sigmoid，1=前景）。
 */
import { binarizeToBackgroundMask, upsampleMask } from './domain/mask'
import type { SourceImage } from './domain/types'

const MODEL_URL = '/models/u2netp.onnx'
const INPUT_SIZE = 320
/** 前景概率阈值：prob >= 0.5 判为前景。 */
const THRESHOLD = 0.5

let ortModule: typeof import('onnxruntime-web') | null = null
let sessionPromise: Promise<import('onnxruntime-web').InferenceSession> | null = null

/** 单例加载模型（首次调用创建，后续复用；失败后重置以便下次重试）。 */
function getSession(): Promise<import('onnxruntime-web').InferenceSession> {
  if (!sessionPromise) {
    // 动态导入：onnxruntime-web 较大（~600KB），只在首次抠图时加载
    sessionPromise = import('onnxruntime-web')
      .then((ort) => {
        ortModule = ort
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
 */
export async function generateBackgroundMask(image: SourceImage): Promise<Uint8Array> {
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
  return binarizeToBackgroundMask(upsampled, THRESHOLD)
}
