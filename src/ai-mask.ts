/**
 * AI 智能抠图：u2netp 轻量语义分割模型 + onnxruntime-web。
 * 输出源图像素级背景 mask（1=背景），与 convert 管线的 bgMask 语义一致。
 * 模型：rembg 发布的 u2netp.onnx（Apache-2.0，~4.5MB），
 * 输入 [1,3,320,320] NCHW float32（ImageNet 归一化），输出 d0 [1,1,320,320]（已 sigmoid，1=前景）。
 */
import * as ort from 'onnxruntime-web'
import { binarizeToBackgroundMask, upsampleMask } from './domain/mask'
import type { SourceImage } from './domain/types'

const MODEL_URL = '/models/u2netp.onnx'
const INPUT_SIZE = 320
/** 前景概率阈值：prob >= 0.5 判为前景。 */
const THRESHOLD = 0.5

let sessionPromise: Promise<ort.InferenceSession> | null = null

/** 单例加载模型（首次调用创建，后续复用）。 */
function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_URL)
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
 * 模型推理（wasm/WebGL）在异步线程执行，首次调用需加载模型（~4.5MB，之后缓存复用）。
 */
export async function generateBackgroundMask(image: SourceImage): Promise<Uint8Array> {
  const session = await getSession()
  const input = preprocess(image)
  const feeds = {
    [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]),
  }
  const out = await session.run(feeds)
  // d0 = 最终融合 saliency map，已 sigmoid，值 [0,1]，1=前景
  const prob = out[session.outputNames[0]].data as Float32Array
  const upsampled = upsampleMask(prob, INPUT_SIZE, INPUT_SIZE, image.width, image.height)
  return binarizeToBackgroundMask(upsampled, THRESHOLD)
}
