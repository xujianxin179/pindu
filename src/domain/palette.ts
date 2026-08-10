import type { ColorPalette } from './types'

/**
 * 占位色板：约 16 色，用于打通"图片转图案"链路。
 * 待 ticket 03 替换为真实 MARD 221 色号体系。
 */
export const PLACEHOLDER_PALETTE: ColorPalette = [
  { id: 'P01', name: '白', rgb: { r: 255, g: 255, b: 255 } },
  { id: 'P02', name: '黑', rgb: { r: 0, g: 0, b: 0 } },
  { id: 'P03', name: '红', rgb: { r: 230, g: 30, b: 30 } },
  { id: 'P04', name: '橙', rgb: { r: 230, g: 120, b: 20 } },
  { id: 'P05', name: '黄', rgb: { r: 240, g: 210, b: 30 } },
  { id: 'P06', name: '浅绿', rgb: { r: 120, g: 220, b: 80 } },
  { id: 'P07', name: '深绿', rgb: { r: 30, g: 130, b: 50 } },
  { id: 'P08', name: '青', rgb: { r: 30, g: 180, b: 200 } },
  { id: 'P09', name: '蓝', rgb: { r: 30, g: 80, b: 200 } },
  { id: 'P10', name: '深蓝', rgb: { r: 20, g: 30, b: 110 } },
  { id: 'P11', name: '紫', rgb: { r: 130, g: 50, b: 180 } },
  { id: 'P12', name: '粉', rgb: { r: 240, g: 150, b: 180 } },
  { id: 'P13', name: '棕', rgb: { r: 120, g: 70, b: 30 } },
  { id: 'P14', name: '浅棕', rgb: { r: 200, g: 160, b: 110 } },
  { id: 'P15', name: '灰', rgb: { r: 130, g: 130, b: 130 } },
  { id: 'P16', name: '深灰', rgb: { r: 70, g: 70, b: 70 } },
]
